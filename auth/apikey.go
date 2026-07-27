package auth

import (
	"chat/channel"
	"chat/globals"
	"chat/utils"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

type ApiKey struct {
	Id             int64   `json:"id"`
	UserId         int64   `json:"user_id,omitempty"`
	Name           string  `json:"name"`
	Key            string  `json:"key,omitempty"`
	MaskedKey      string  `json:"masked_key"`
	Disabled       bool    `json:"disabled"`
	ExpiredAt      string  `json:"expired_at"`
	Quota          float32 `json:"quota"`
	UsedQuota      float32 `json:"used_quota"`
	InfiniteQuota  bool    `json:"infinite_quota"`
	IpWhitelist    string  `json:"ip_whitelist"`
	ModelWhitelist string  `json:"model_whitelist"`
	TokenGroup     string  `json:"token_group"`
	LastUsedAt     string  `json:"last_used_at"`
	CreatedAt      string  `json:"created_at"`
	GroupRatio     float32 `json:"-"`
	ChannelGroup   string  `json:"-"`
}

type ApiKeyUpsertForm struct {
	Id             int64   `json:"id"`
	Name           string  `json:"name" binding:"required"`
	Disabled       bool    `json:"disabled"`
	ExpiredAt      string  `json:"expired_at"`
	Quota          float32 `json:"quota"`
	InfiniteQuota  bool    `json:"infinite_quota"`
	IpWhitelist    string  `json:"ip_whitelist"`
	ModelWhitelist string  `json:"model_whitelist"`
	TokenGroup     string  `json:"token_group"`
}

func generateApiKey() (string, error) {
	raw := make([]byte, 36)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return "sk-coai-" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func maskApiKey(prefix, last4 string) string {
	if prefix == "" {
		prefix = "sk-coai"
	}
	if last4 == "" {
		return prefix + "••••••••"
	}
	return prefix + "••••••••" + last4
}

func normalizeApiKeyForm(form *ApiKeyUpsertForm) error {
	form.Name = strings.TrimSpace(form.Name)
	form.ExpiredAt = strings.TrimSpace(form.ExpiredAt)
	form.IpWhitelist = strings.TrimSpace(form.IpWhitelist)
	form.ModelWhitelist = strings.TrimSpace(form.ModelWhitelist)
	form.TokenGroup = strings.TrimSpace(form.TokenGroup)
	if form.Name == "" {
		return errors.New("key name is required")
	}
	if form.Quota < 0 {
		return errors.New("key quota cannot be negative")
	}
	if form.TokenGroup == "" {
		form.TokenGroup = "default"
	}
	if channel.ApiGroupInstance.Get(form.TokenGroup) == nil {
		return errors.New("api group not found")
	}
	return nil
}

func nullableDate(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func (u *User) CreateApiKeyWithForm(db *sql.DB, form ApiKeyUpsertForm) (*ApiKey, error) {
	if err := normalizeApiKeyForm(&form); err != nil {
		return nil, err
	}
	group := channel.ApiGroupInstance.Get(form.TokenGroup)
	if group == nil || !group.Enabled || (!u.IsAdmin(db) && u.GetSubscriptionLevel(db) < group.MinLevel) {
		return nil, errors.New("api group is not available for current user")
	}
	key, err := generateApiKey()
	if err != nil {
		return nil, err
	}
	prefix := key
	if len(prefix) > 16 {
		prefix = prefix[:16]
	}
	last4 := key[len(key)-4:]
	result, err := globals.ExecDb(db, `
		INSERT INTO apikey
		(user_id, api_key, key_hash, key_prefix, key_last4, name, disabled, expired_at,
		 quota, used_quota, infinite_quota, ip_whitelist, model_whitelist, token_group)
		VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
	`, u.GetID(db), utils.Sha2Encrypt(key), prefix, last4, form.Name, form.Disabled,
		nullableDate(form.ExpiredAt), form.Quota, form.InfiniteQuota, form.IpWhitelist,
		form.ModelWhitelist, form.TokenGroup)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return &ApiKey{
		Id: id, UserId: u.GetID(db), Name: form.Name, Key: key,
		MaskedKey: maskApiKey(prefix, last4), Disabled: form.Disabled,
		ExpiredAt: form.ExpiredAt, Quota: form.Quota, InfiniteQuota: form.InfiniteQuota,
		IpWhitelist: form.IpWhitelist, ModelWhitelist: form.ModelWhitelist,
		TokenGroup: form.TokenGroup,
	}, nil
}

// CreateApiKey keeps the legacy call path working while creating a modern default key.
func (u *User) CreateApiKey(db *sql.DB) string {
	key, err := u.CreateApiKeyWithForm(db, ApiKeyUpsertForm{
		Name: "Default Key", InfiniteQuota: true, TokenGroup: "default",
	})
	if err != nil {
		return ""
	}
	return key.Key
}

func scanApiKey(rows interface{ Scan(...interface{}) error }) (*ApiKey, error) {
	var key ApiKey
	var expiredAt, lastUsedAt, createdAt sql.NullString
	var prefix, last4 string
	err := rows.Scan(&key.Id, &key.UserId, &key.Name, &key.Disabled, &expiredAt,
		&key.Quota, &key.UsedQuota, &key.InfiniteQuota, &key.IpWhitelist,
		&key.ModelWhitelist, &key.TokenGroup, &lastUsedAt, &createdAt, &prefix, &last4)
	if err != nil {
		return nil, err
	}
	key.ExpiredAt = expiredAt.String
	key.LastUsedAt = lastUsedAt.String
	key.CreatedAt = createdAt.String
	key.MaskedKey = maskApiKey(prefix, last4)
	return &key, nil
}

const apiKeySelect = `
	SELECT id, user_id, name, disabled, expired_at, quota, used_quota,
	       infinite_quota, COALESCE(ip_whitelist, ''), COALESCE(model_whitelist, ''),
	       token_group, last_used_at, created_at, COALESCE(key_prefix, ''), COALESCE(key_last4, '')
	FROM apikey`

func (u *User) ListApiKeys(db *sql.DB) ([]ApiKey, error) {
	rows, err := globals.QueryDb(db, apiKeySelect+` WHERE user_id = ? ORDER BY id DESC`, u.GetID(db))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := make([]ApiKey, 0)
	for rows.Next() {
		key, err := scanApiKey(rows)
		if err != nil {
			return nil, err
		}
		keys = append(keys, *key)
	}
	return keys, rows.Err()
}

func (u *User) GetApiKey(db *sql.DB) string {
	// Legacy endpoint: return a masked key, creating a default key if none exists.
	keys, err := u.ListApiKeys(db)
	if err == nil && len(keys) > 0 {
		return keys[0].MaskedKey
	}
	return u.CreateApiKey(db)
}

func (u *User) UpdateApiKey(db *sql.DB, form ApiKeyUpsertForm) error {
	if form.Id <= 0 {
		return errors.New("invalid key id")
	}
	if err := normalizeApiKeyForm(&form); err != nil {
		return err
	}
	group := channel.ApiGroupInstance.Get(form.TokenGroup)
	if group == nil || !group.Enabled || (!u.IsAdmin(db) && u.GetSubscriptionLevel(db) < group.MinLevel) {
		return errors.New("api group is not available for current user")
	}
	result, err := globals.ExecDb(db, `
		UPDATE apikey SET name = ?, disabled = ?, expired_at = ?, quota = ?,
		infinite_quota = ?, ip_whitelist = ?, model_whitelist = ?, token_group = ?,
		updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
	`, form.Name, form.Disabled, nullableDate(form.ExpiredAt), form.Quota,
		form.InfiniteQuota, form.IpWhitelist, form.ModelWhitelist, form.TokenGroup,
		form.Id, u.GetID(db))
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return errors.New("api key not found")
	}
	return nil
}

func (u *User) DeleteApiKey(db *sql.DB, id int64) error {
	result, err := globals.ExecDb(db, `DELETE FROM apikey WHERE id = ? AND user_id = ?`, id, u.GetID(db))
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return errors.New("api key not found")
	}
	return nil
}

func (u *User) ResetApiKeyById(db *sql.DB, id int64) (string, error) {
	key, err := generateApiKey()
	if err != nil {
		return "", err
	}
	prefix := key
	if len(prefix) > 16 {
		prefix = prefix[:16]
	}
	last4 := key[len(key)-4:]
	result, err := globals.ExecDb(db, `
		UPDATE apikey SET api_key = NULL, key_hash = ?, key_prefix = ?, key_last4 = ?,
		updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
	`, utils.Sha2Encrypt(key), prefix, last4, id, u.GetID(db))
	if err != nil {
		return "", err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return "", errors.New("api key not found")
	}
	return key, nil
}

func (u *User) ResetApiKey(db *sql.DB) (string, error) {
	keys, err := u.ListApiKeys(db)
	if err != nil {
		return "", err
	}
	if len(keys) == 0 {
		return u.CreateApiKey(db), nil
	}
	return u.ResetApiKeyById(db, keys[0].Id)
}

func splitAccessList(value string) []string {
	return strings.FieldsFunc(value, func(r rune) bool {
		return r == ',' || r == ';' || r == '\n' || r == '\r' || r == ' '
	})
}

func (k *ApiKey) AllowsModel(model string) bool {
	models := splitAccessList(k.ModelWhitelist)
	if len(models) == 0 {
		return true
	}
	for _, item := range models {
		if item == model {
			return true
		}
	}
	return false
}

func (k *ApiKey) AllowsIP(ip string) bool {
	items := splitAccessList(k.IpWhitelist)
	if len(items) == 0 {
		return true
	}
	parsed := net.ParseIP(ip)
	for _, item := range items {
		if item == ip {
			return true
		}
		if _, network, err := net.ParseCIDR(item); err == nil && parsed != nil && network.Contains(parsed) {
			return true
		}
	}
	return false
}

func (k *ApiKey) HasQuota(required float32) bool {
	return k.InfiniteQuota || k.UsedQuota+required <= k.Quota
}

func (k *ApiKey) UseQuota(db *sql.DB, quota float32) bool {
	if quota <= 0 {
		return true
	}
	result, err := globals.ExecDb(db, `
		UPDATE apikey SET used_quota = used_quota + ?, last_used_at = CURRENT_TIMESTAMP
		WHERE id = ? AND (infinite_quota = TRUE OR used_quota + ? <= quota)
	`, quota, k.Id, quota)
	if err != nil {
		return false
	}
	affected, _ := result.RowsAffected()
	if affected > 0 {
		k.UsedQuota += quota
		return true
	}
	return false
}

func ParseApiKeyInfo(c *gin.Context, raw string) (*User, *ApiKey) {
	if raw == "" {
		return nil, nil
	}
	db := utils.GetDBFromContext(c)
	var user User
	row := globals.QueryRowDb(db, `
		SELECT auth.id, auth.username, auth.password,
		       apikey.id, apikey.user_id, apikey.name, apikey.disabled, apikey.expired_at,
		       apikey.quota, apikey.used_quota, apikey.infinite_quota,
		       COALESCE(apikey.ip_whitelist, ''), COALESCE(apikey.model_whitelist, ''),
		       apikey.token_group, apikey.last_used_at, apikey.created_at,
		       COALESCE(apikey.key_prefix, ''), COALESCE(apikey.key_last4, '')
		FROM auth INNER JOIN apikey ON auth.id = apikey.user_id
		WHERE (apikey.key_hash = ? OR apikey.api_key = ?)
		  AND apikey.disabled = FALSE
		  AND (apikey.expired_at IS NULL OR apikey.expired_at > CURRENT_TIMESTAMP)
	`, utils.Sha2Encrypt(raw), raw)
	var key ApiKey
	var expiredAt, lastUsedAt, createdAt sql.NullString
	var prefix, last4 string
	err := row.Scan(&user.ID, &user.Username, &user.Password,
		&key.Id, &key.UserId, &key.Name, &key.Disabled, &expiredAt,
		&key.Quota, &key.UsedQuota, &key.InfiniteQuota, &key.IpWhitelist,
		&key.ModelWhitelist, &key.TokenGroup, &lastUsedAt, &createdAt, &prefix, &last4)
	if err != nil {
		return nil, nil
	}
	key.ExpiredAt = expiredAt.String
	key.LastUsedAt = lastUsedAt.String
	key.CreatedAt = createdAt.String
	key.MaskedKey = maskApiKey(prefix, last4)
	if !key.AllowsIP(c.ClientIP()) {
		return nil, nil
	}
	group := channel.ApiGroupInstance.Get(key.TokenGroup)
	if group == nil || !group.Enabled || (!user.IsAdmin(db) && user.GetSubscriptionLevel(db) < group.MinLevel) {
		return nil, nil
	}
	key.GroupRatio = group.Ratio
	key.ChannelGroup = group.ChannelGroup
	if key.ChannelGroup == "" {
		key.ChannelGroup = GetGroup(db, &user)
	}
	return &user, &key
}

func ParseApiKey(c *gin.Context, key string) *User {
	user, _ := ParseApiKeyInfo(c, key)
	return user
}

func GetApiKeyFromContext(c *gin.Context) *ApiKey {
	value, exists := c.Get("api_key")
	if !exists || value == nil {
		return nil
	}
	key, _ := value.(*ApiKey)
	return key
}

func (k *ApiKey) String() string {
	return fmt.Sprintf("api key #%d (%s)", k.Id, k.Name)
}
