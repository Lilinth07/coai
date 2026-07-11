package payment

import (
	"chat/auth"
	"chat/channel"
	"chat/globals"
	"chat/utils"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
)

// orderLocks keeps per-order mutexes so notify/return/recheck stay idempotent
// without introducing a global lock that would hurt throughput.
var orderLocks sync.Map

func getOrderLock(orderId string) *sync.Mutex {
	lock, _ := orderLocks.LoadOrStore(orderId, &sync.Mutex{})
	return lock.(*sync.Mutex)
}

func getEpayConfig() (*channel.EpayConfig, error) {
	if channel.SystemInstance == nil {
		return nil, errors.New("system not ready")
	}
	cfg := channel.SystemInstance.Payment.Epay
	if !cfg.Enabled {
		return nil, errors.New("payment not enabled")
	}
	if strings.TrimSpace(cfg.Domain) == "" ||
		strings.TrimSpace(cfg.BusinessId) == "" ||
		strings.TrimSpace(cfg.BusinessKey) == "" {
		return nil, errors.New("epay configuration is incomplete")
	}
	return &cfg, nil
}

func getEpayClient() (*epay.Client, error) {
	cfg, err := getEpayConfig()
	if err != nil {
		return nil, err
	}
	return epay.NewClient(&epay.Config{
		PartnerID: cfg.BusinessId,
		Key:       cfg.BusinessKey,
	}, strings.TrimRight(cfg.Domain, "/"))
}

func allowedMethods(cfg *channel.EpayConfig) []string {
	if cfg != nil && len(cfg.Methods) > 0 {
		return cfg.Methods
	}
	return []string{"alipay", "wxpay"}
}

func isMethodAllowed(cfg *channel.EpayConfig, method string) bool {
	for _, item := range allowedMethods(cfg) {
		if item == method {
			return true
		}
	}
	return false
}

func mapDevice(device string) epay.DeviceType {
	switch strings.ToLower(strings.TrimSpace(device)) {
	case "mobile", "wechat", "alipay", "qq":
		return epay.MOBILE
	default:
		return epay.PC
	}
}

func parseParams(c *gin.Context) map[string]string {
	params := make(map[string]string)
	if c.Request.Method == http.MethodPost {
		_ = c.Request.ParseForm()
		for k, v := range c.Request.PostForm {
			if len(v) > 0 {
				params[k] = v[0]
			}
		}
	}
	for k, v := range c.Request.URL.Query() {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}
	return params
}

func buildCallbackURLs(domain string) (notifyUrl *url.URL, returnUrl *url.URL, err error) {
	backend := ""
	if channel.SystemInstance != nil {
		backend = channel.SystemInstance.GetBackend()
	}
	base := strings.TrimRight(backend, "/")
	if base == "" {
		base = strings.TrimRight(domain, "/")
	}
	if base == "" {
		return nil, nil, errors.New("callback base url is empty; set system.general.backend")
	}
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		base = "https://" + base
	}

	notifyUrl, err = url.Parse(base + "/api/payment/notify")
	if err != nil {
		return nil, nil, err
	}

	retBase := strings.TrimRight(domain, "/")
	if retBase == "" {
		retBase = base
	}
	if !strings.HasPrefix(retBase, "http://") && !strings.HasPrefix(retBase, "https://") {
		retBase = "https://" + retBase
	}
	returnUrl, err = url.Parse(retBase + "/wallet")
	if err != nil {
		return nil, nil, err
	}
	return notifyUrl, returnUrl, nil
}

func generateTradeNo(userId int64) string {
	return fmt.Sprintf("USR%dNO%s", userId, auth.GenerateOrder()[:16])
}

type CreatePaymentForm struct {
	Type   string  `json:"type" binding:"required"`
	Quota  float32 `json:"quota" binding:"required"`
	Domain string  `json:"domain"`
	Name   string  `json:"name"`
	Device string  `json:"device"`
}

func CreatePaymentAPI(c *gin.Context) {
	user := auth.RequireAuth(c)
	if user == nil {
		return
	}

	var form CreatePaymentForm
	if err := c.ShouldBindJSON(&form); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "bad request"})
		return
	}

	cfg, err := getEpayConfig()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error()})
		return
	}

	if form.Quota < 1 || form.Quota > 99999 {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "invalid quota range (1 ~ 99999)"})
		return
	}
	if !isMethodAllowed(cfg, form.Type) {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "payment method not allowed"})
		return
	}

	// coAI rule: 10 points = 1 CNY
	money := float32(form.Quota) * 0.1
	if money < 0.01 {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "amount too small"})
		return
	}

	db := utils.GetDBFromContext(c)
	userId := user.GetID(db)
	if userId <= 0 {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "user not found"})
		return
	}

	orderId := generateTradeNo(userId)
	name := strings.TrimSpace(form.Name)
	if name == "" {
		name = fmt.Sprintf("TUC%.0f", form.Quota)
	}
	device := strings.TrimSpace(form.Device)
	if device == "" {
		device = "pc"
	}

	if _, err = globals.ExecDb(db, `
		INSERT INTO payment_order (user_id, type, service, amount, quota, order_id, name, device, state)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, userId, form.Type, "epay", money, form.Quota, orderId, name, device, false); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "failed to create order"})
		return
	}

	client, err := getEpayClient()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error()})
		return
	}

	notifyUrl, returnUrl, err := buildCallbackURLs(form.Domain)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error()})
		return
	}

	purchaseUrl, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           form.Type,
		ServiceTradeNo: orderId,
		Name:           name,
		Money:          fmt.Sprintf("%.2f", money),
		Device:         mapDevice(device),
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "failed to create payment"})
		return
	}

	if params == nil {
		params = map[string]string{}
	}
	if params["out_trade_no"] == "" {
		params["out_trade_no"] = orderId
	}

	c.JSON(http.StatusOK, gin.H{
		"status": true,
		"data": gin.H{
			"url":    purchaseUrl,
			"params": params,
		},
	})
}

func CheckPaymentAPI(c *gin.Context) {
	user := auth.RequireAuth(c)
	if user == nil {
		return
	}

	order := c.Param("order")
	if order == "" {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "order id required", "order_state": false})
		return
	}

	db := utils.GetDBFromContext(c)
	var state bool
	var createdAt time.Time
	var userId int64
	err := globals.QueryRowDb(db, `
		SELECT user_id, state, created_at FROM payment_order WHERE order_id = ?
	`, order).Scan(&userId, &state, &createdAt)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "order not found", "order_state": false})
		return
	}

	if userId != user.GetID(db) && !user.IsAdmin(db) {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "forbidden", "order_state": false})
		return
	}

	remaining := int64(0)
	if !state {
		elapsed := time.Since(createdAt).Seconds()
		remaining = int64(900 - elapsed)
		if remaining < 0 {
			remaining = 0
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":         true,
		"order_state":    state,
		"remaining_time": remaining,
	})
}

func completeOrder(db *sql.DB, orderId string) error {
	lock := getOrderLock(orderId)
	lock.Lock()
	defer lock.Unlock()

	var state bool
	var userId int64
	var quota float32
	if err := globals.QueryRowDb(db, `
		SELECT user_id, quota, state FROM payment_order WHERE order_id = ?
	`, orderId).Scan(&userId, &quota, &state); err != nil {
		return err
	}
	if state {
		return nil
	}

	if _, err := globals.ExecDb(db, `
		UPDATE payment_order SET state = true WHERE order_id = ? AND state = false
	`, orderId); err != nil {
		return err
	}

	user := auth.GetUserById(db, userId)
	if user == nil {
		return errors.New("user not found")
	}
	if !user.IncreaseQuota(db, quota) {
		return errors.New("failed to increase quota")
	}
	return nil
}

func NotifyAPI(c *gin.Context) {
	client, err := getEpayClient()
	if err != nil {
		c.String(http.StatusOK, "fail")
		return
	}

	params := parseParams(c)
	if len(params) == 0 {
		c.String(http.StatusOK, "fail")
		return
	}

	verifyInfo, err := client.Verify(params)
	if err != nil || verifyInfo == nil || !verifyInfo.VerifyStatus {
		c.String(http.StatusOK, "fail")
		return
	}
	if verifyInfo.TradeStatus != epay.StatusTradeSuccess {
		c.String(http.StatusOK, "fail")
		return
	}

	orderId := verifyInfo.ServiceTradeNo
	if orderId == "" {
		orderId = params["out_trade_no"]
	}
	if orderId == "" {
		c.String(http.StatusOK, "fail")
		return
	}

	db := utils.GetDBFromContext(c)
	if err := completeOrder(db, orderId); err != nil {
		c.String(http.StatusOK, "fail")
		return
	}
	c.String(http.StatusOK, "success")
}

func ReturnAPI(c *gin.Context) {
	redirect := func(status string) {
		c.Redirect(http.StatusFound, "/wallet?status="+status)
	}

	client, err := getEpayClient()
	if err != nil {
		redirect("failed")
		return
	}

	params := parseParams(c)
	if len(params) == 0 {
		redirect("failed")
		return
	}

	verifyInfo, err := client.Verify(params)
	if err != nil || verifyInfo == nil || !verifyInfo.VerifyStatus {
		redirect("failed")
		return
	}

	orderId := verifyInfo.ServiceTradeNo
	if orderId == "" {
		orderId = params["out_trade_no"]
	}

	if verifyInfo.TradeStatus == epay.StatusTradeSuccess && orderId != "" {
		db := utils.GetDBFromContext(c)
		_ = completeOrder(db, orderId)
		redirect("success")
		return
	}
	redirect("processing")
}

func AdminViewAPI(c *gin.Context) {
	if auth.RequireAdmin(c) == nil {
		return
	}

	db := utils.GetDBFromContext(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	search := strings.TrimSpace(c.Query("search"))
	if page < 1 {
		page = 1
	}
	perPage := 20
	offset := (page - 1) * perPage

	var total int
	var rows *sql.Rows
	var err error

	if search != "" {
		like := "%" + search + "%"
		if err = globals.QueryRowDb(db, `
			SELECT COUNT(*) FROM payment_order
			LEFT JOIN auth ON auth.id = payment_order.user_id
			WHERE payment_order.order_id LIKE ? OR auth.username LIKE ?
		`, like, like).Scan(&total); err != nil {
			c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error(), "data": []PaymentOrder{}, "total": 0})
			return
		}
		rows, err = globals.QueryDb(db, `
			SELECT payment_order.id, payment_order.user_id, payment_order.type, payment_order.service,
			       payment_order.amount, payment_order.quota, payment_order.order_id, payment_order.name,
			       payment_order.device, payment_order.state, COALESCE(auth.username, ''),
			       payment_order.created_at, payment_order.updated_at
			FROM payment_order
			LEFT JOIN auth ON auth.id = payment_order.user_id
			WHERE payment_order.order_id LIKE ? OR auth.username LIKE ?
			ORDER BY payment_order.id DESC LIMIT ? OFFSET ?
		`, like, like, perPage, offset)
	} else {
		if err = globals.QueryRowDb(db, `SELECT COUNT(*) FROM payment_order`).Scan(&total); err != nil {
			c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error(), "data": []PaymentOrder{}, "total": 0})
			return
		}
		rows, err = globals.QueryDb(db, `
			SELECT payment_order.id, payment_order.user_id, payment_order.type, payment_order.service,
			       payment_order.amount, payment_order.quota, payment_order.order_id, payment_order.name,
			       payment_order.device, payment_order.state, COALESCE(auth.username, ''),
			       payment_order.created_at, payment_order.updated_at
			FROM payment_order
			LEFT JOIN auth ON auth.id = payment_order.user_id
			ORDER BY payment_order.id DESC LIMIT ? OFFSET ?
		`, perPage, offset)
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error(), "data": []PaymentOrder{}, "total": 0})
		return
	}
	defer rows.Close()

	orders := make([]PaymentOrder, 0)
	for rows.Next() {
		var order PaymentOrder
		var createdAt, updatedAt time.Time
		if err := rows.Scan(
			&order.Id, &order.UserId, &order.Type, &order.Service,
			&order.Amount, &order.Quota, &order.OrderId, &order.Name,
			&order.Device, &order.State, &order.Username,
			&createdAt, &updatedAt,
		); err != nil {
			continue
		}
		order.CreatedAt = createdAt.Format("2006-01-02 15:04:05")
		order.UpdatedAt = updatedAt.Format("2006-01-02 15:04:05")
		orders = append(orders, order)
	}

	c.JSON(http.StatusOK, gin.H{
		"status": true,
		"data":   orders,
		"total":  total,
	})
}

func AdminRecheckAPI(c *gin.Context) {
	if auth.RequireAdmin(c) == nil {
		return
	}

	orderId := strings.TrimSpace(c.Query("order"))
	if orderId == "" {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "order id required", "is_changed": false})
		return
	}

	db := utils.GetDBFromContext(c)
	var currentState bool
	if err := globals.QueryRowDb(db, `SELECT state FROM payment_order WHERE order_id = ?`, orderId).Scan(&currentState); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": "order not found", "is_changed": false})
		return
	}
	if currentState {
		c.JSON(http.StatusOK, gin.H{"status": true, "order_state": true, "is_changed": false})
		return
	}

	// Low load: no outbound provider query by default.
	// service=force enables manual complete for admin repair.
	if strings.TrimSpace(c.Query("service")) != "force" {
		c.JSON(http.StatusOK, gin.H{"status": true, "order_state": currentState, "is_changed": false})
		return
	}

	if err := completeOrder(db, orderId); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error(), "is_changed": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": true, "order_state": true, "is_changed": true})
}
