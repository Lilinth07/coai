package payment

// PaymentOrder is the admin/API representation of a top-up order.
// Table DDL lives in connection.CreatePaymentOrderTable to avoid import cycles.
type PaymentOrder struct {
	Id        int     `json:"id"`
	UserId    int     `json:"user_id"`
	Type      string  `json:"type"`
	Service   string  `json:"service"`
	Amount    float32 `json:"amount"`
	Quota     float32 `json:"quota"`
	OrderId   string  `json:"order_id"`
	Name      string  `json:"name"`
	Device    string  `json:"device"`
	State     bool    `json:"state"`
	Username  string  `json:"username"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}
