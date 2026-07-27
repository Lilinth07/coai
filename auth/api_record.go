package auth

import (
	"chat/globals"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

const insertApiRecordSql = `
	INSERT INTO api_record
	(request_id, user_id, key_id, key_name, username, model, actual_model,
	 token_group, channel_id, channel_name, input_tokens, output_tokens, quota,
	 duration, is_stream, status, error, client_ip)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

func apiRecordArgs(record *ApiRecord) []interface{} {
	return []interface{}{record.RequestId, record.UserId, record.KeyId, record.KeyName,
		record.Username, record.Model, record.ActualModel, record.TokenGroup,
		record.ChannelId, record.ChannelName, record.InputTokens, record.OutputTokens,
		record.Quota, record.Duration, record.IsStream, record.Status, record.Error,
		record.ClientIP}
}

type ApiRecord struct {
	Id           int64   `json:"id"`
	RequestId    string  `json:"request_id"`
	UserId       int64   `json:"user_id"`
	KeyId        int64   `json:"key_id"`
	KeyName      string  `json:"key_name"`
	Username     string  `json:"username"`
	Model        string  `json:"model"`
	ActualModel  string  `json:"actual_model"`
	TokenGroup   string  `json:"token_group"`
	ChannelId    int     `json:"channel_id"`
	ChannelName  string  `json:"channel_name"`
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	Quota        float32 `json:"quota"`
	Duration     float32 `json:"duration"`
	IsStream     bool    `json:"is_stream"`
	Status       string  `json:"status"`
	Error        string  `json:"error"`
	ClientIP     string  `json:"client_ip"`
	CreatedAt    string  `json:"created_at"`
}

type ApiRecordQuery struct {
	Page       int    `json:"page" form:"page"`
	PageSize   int    `json:"page_size" form:"page_size"`
	KeyId      int64  `json:"key_id" form:"key_id"`
	Model      string `json:"model" form:"model"`
	Status     string `json:"status" form:"status"`
	Username   string `json:"username" form:"username"`
	TokenGroup string `json:"token_group" form:"token_group"`
}

type ApiUsagePoint struct {
	Date     string  `json:"date"`
	Requests int64   `json:"requests"`
	Tokens   int64   `json:"tokens"`
	Quota    float64 `json:"quota"`
}

type ApiUsageSummary struct {
	TodayRequests int64           `json:"today_requests"`
	MonthRequests int64           `json:"month_requests"`
	TodayTokens   int64           `json:"today_tokens"`
	MonthTokens   int64           `json:"month_tokens"`
	TodayQuota    float64         `json:"today_quota"`
	MonthQuota    float64         `json:"month_quota"`
	Series        []ApiUsagePoint `json:"series"`
}

func dbString(value interface{}) string {
	switch raw := value.(type) {
	case []byte:
		return string(raw)
	case string:
		return raw
	default:
		return fmt.Sprint(value)
	}
}

func InsertApiRecord(db *sql.DB, record *ApiRecord) error {
	if record == nil || record.RequestId == "" || record.KeyId <= 0 {
		return nil
	}
	_, err := globals.ExecDb(db, insertApiRecordSql, apiRecordArgs(record)...)
	return err
}

func SettleApiRequest(db *sql.DB, user *User, key *ApiKey, record *ApiRecord) error {
	if record == nil || user == nil || key == nil {
		return errors.New("invalid api settlement context")
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	quota := record.Quota
	if quota > 0 && record.Status == "success" {
		result, err := tx.Exec(globals.PreflightSql(`
			UPDATE quota SET quota = quota - ?, used = used + ?
			WHERE user_id = ? AND quota >= ?
		`), quota, quota, user.GetID(db), quota)
		if err != nil {
			return err
		}
		affected, _ := result.RowsAffected()
		if affected == 0 {
			return errors.New("user quota is not enough")
		}
		result, err = tx.Exec(globals.PreflightSql(`
			UPDATE apikey SET used_quota = used_quota + ?, last_used_at = CURRENT_TIMESTAMP
			WHERE id = ? AND (infinite_quota = TRUE OR used_quota + ? <= quota)
		`), quota, key.Id, quota)
		if err != nil {
			return err
		}
		affected, _ = result.RowsAffected()
		if affected == 0 {
			return errors.New("api key quota is not enough")
		}
	}
	if _, err := tx.Exec(globals.PreflightSql(insertApiRecordSql), apiRecordArgs(record)...); err != nil {
		return err
	}
	return tx.Commit()
}

func normalizeRecordQuery(query *ApiRecordQuery) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	query.Model = strings.TrimSpace(query.Model)
	query.Status = strings.TrimSpace(query.Status)
	query.Username = strings.TrimSpace(query.Username)
	query.TokenGroup = strings.TrimSpace(query.TokenGroup)
}

func buildRecordWhere(userId int64, admin bool, query ApiRecordQuery) (string, []interface{}) {
	where := make([]string, 0)
	args := make([]interface{}, 0)
	if !admin {
		where = append(where, "user_id = ?")
		args = append(args, userId)
	}
	if query.KeyId > 0 {
		where = append(where, "key_id = ?")
		args = append(args, query.KeyId)
	}
	if query.Model != "" {
		where = append(where, "model = ?")
		args = append(args, query.Model)
	}
	if query.Status != "" {
		where = append(where, "status = ?")
		args = append(args, query.Status)
	}
	if admin && query.Username != "" {
		where = append(where, "username LIKE ?")
		args = append(args, "%"+query.Username+"%")
	}
	if query.TokenGroup != "" {
		where = append(where, "token_group = ?")
		args = append(args, query.TokenGroup)
	}
	if len(where) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(where, " AND "), args
}

func ListApiRecords(db *sql.DB, userId int64, admin bool, query ApiRecordQuery) ([]ApiRecord, int64, error) {
	normalizeRecordQuery(&query)
	where, args := buildRecordWhere(userId, admin, query)
	var total int64
	if err := globals.QueryRowDb(db, "SELECT COUNT(*) FROM api_record"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, query.PageSize, (query.Page-1)*query.PageSize)
	rows, err := globals.QueryDb(db, `
		SELECT id, request_id, user_id, key_id, key_name, username, model, actual_model,
		       token_group, channel_id, channel_name, input_tokens, output_tokens, quota,
		       duration, is_stream, status, COALESCE(error, ''), client_ip, created_at
		FROM api_record`+where+` ORDER BY id DESC LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	records := make([]ApiRecord, 0)
	for rows.Next() {
		var record ApiRecord
		var createdAt interface{}
		if err := rows.Scan(&record.Id, &record.RequestId, &record.UserId, &record.KeyId,
			&record.KeyName, &record.Username, &record.Model, &record.ActualModel,
			&record.TokenGroup, &record.ChannelId, &record.ChannelName, &record.InputTokens,
			&record.OutputTokens, &record.Quota, &record.Duration, &record.IsStream,
			&record.Status, &record.Error, &record.ClientIP, &createdAt); err != nil {
			return nil, 0, err
		}
		record.CreatedAt = dbString(createdAt)
		records = append(records, record)
	}
	return records, total, rows.Err()
}

func GetApiUsageSummary(db *sql.DB, userId int64, admin bool) (*ApiUsageSummary, error) {
	filter := ""
	args := make([]interface{}, 0)
	if !admin {
		filter = " AND user_id = ?"
		args = append(args, userId)
	}
	summary := &ApiUsageSummary{Series: make([]ApiUsagePoint, 0)}
	query := `
		SELECT
		 COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END), 0),
		 COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN 1 ELSE 0 END), 0),
		 COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN input_tokens + output_tokens ELSE 0 END), 0),
		 COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN input_tokens + output_tokens ELSE 0 END), 0),
		 COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN quota ELSE 0 END), 0),
		 COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN quota ELSE 0 END), 0)
		FROM api_record WHERE 1=1` + filter
	if err := globals.QueryRowDb(db, query, args...).Scan(&summary.TodayRequests, &summary.MonthRequests,
		&summary.TodayTokens, &summary.MonthTokens, &summary.TodayQuota, &summary.MonthQuota); err != nil {
		return nil, err
	}
	seriesArgs := append([]interface{}{}, args...)
	rows, err := globals.QueryDb(db, `
		SELECT DATE(created_at), COUNT(*), COALESCE(SUM(input_tokens + output_tokens), 0), COALESCE(SUM(quota), 0)
		FROM api_record WHERE created_at >= ?`+filter+`
		GROUP BY DATE(created_at) ORDER BY DATE(created_at)
	`, append([]interface{}{time.Now().AddDate(0, 0, -6).Format("2006-01-02")}, seriesArgs...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var point ApiUsagePoint
		var date interface{}
		if err := rows.Scan(&date, &point.Requests, &point.Tokens, &point.Quota); err != nil {
			return nil, err
		}
		point.Date = dbString(date)
		summary.Series = append(summary.Series, point)
	}
	return summary, rows.Err()
}
