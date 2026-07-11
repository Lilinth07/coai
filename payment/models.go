package payment

import (
	"chat/globals"
	"database/sql"
	"fmt"
)

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

func CreatePaymentOrderTable(db *sql.DB) {
	_, err := globals.ExecDb(db, `
		CREATE TABLE IF NOT EXISTS payment_order (
		  id INT PRIMARY KEY AUTO_INCREMENT,
		  user_id INT,
		  type VARCHAR(32),
		  service VARCHAR(32),
		  amount DECIMAL(16, 4),
		  quota DECIMAL(16, 4),
		  order_id VARCHAR(64) UNIQUE,
		  name VARCHAR(255),
		  device VARCHAR(32),
		  state BOOLEAN DEFAULT FALSE,
		  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		  INDEX idx_user_id (user_id),
		  INDEX idx_order_id (order_id),
		  FOREIGN KEY (user_id) REFERENCES auth(id)
		);
	`)
	if err != nil {
		fmt.Println(err)
	}
}
