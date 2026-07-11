# EPay Integration (易支付)

## Overview

coAI supports online top-up via EPay (易支付), a Chinese third-party payment gateway supporting Alipay, WeChat Pay, and QQ Pay.

## Backend Configuration

Edit `config.yaml` or `config.toml`:

```yaml
system:
  payment:
    epay:
      enabled: true
      domain: "https://pay.example.com"    # EPay service domain
      business_id: "1000"                  # EPay Partner ID (PID)
      business_key: "your-secret-key"      # EPay Secret Key
      methods: ["alipay", "wxpay"]         # Allowed payment methods
      aggregation: false                   # Enable aggregation mode
```

Or configure via the admin panel at `/admin/pay` → EPay Configuration section.

## Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/payment/create` | POST | Auth | Create payment order |
| `/api/payment/check/:order` | GET | Auth | Check order status |
| `/api/payment/notify` | GET/POST | None | EPay async notify callback |
| `/api/payment/return` | GET/POST | None | EPay sync return (browser redirect) |
| `/api/admin/payment/view` | GET | Admin | List all payment orders |
| `/api/admin/payment/recheck` | GET | Admin | Recheck order status with EPay |

## Payment Flow

1. User selects amount + payment method on wallet page
2. Frontend calls `POST /api/payment/create` with type, quota, name
3. Backend creates pending order, calls EPay Purchase API
4. Backend returns payment URL + params
5. Frontend creates a form and POSTs to EPay gateway
6. User completes payment on EPay page
7. EPay redirects to `/api/payment/return` (sync) → verifies → redirects to /wallet
8. EPay calls `/api/payment/notify` (async) → verifies → credits user quota
9. Frontend polls `/api/payment/check/:order` to detect payment completion

## Order Model

Table: `payment_order`

| Column | Type | Description |
|--------|------|-------------|
| id | INT PK | Auto increment |
| user_id | INT FK | References auth.id |
| type | VARCHAR(32) | Payment method (alipay, wxpay) |
| service | VARCHAR(32) | Payment provider (epay) |
| amount | DECIMAL(16,4) | Payment amount in CNY |
| quota | DECIMAL(16,4) | Quota points to credit |
| order_id | VARCHAR(64) | Unique trade number |
| name | VARCHAR(255) | Order display name |
| device | VARCHAR(32) | Device type (pc, mobile) |
| state | BOOLEAN | Payment status (false=pending, true=paid) |
| created_at | DATETIME | Order creation time |
| updated_at | DATETIME | Last update time |

## Frontend

- **Wallet page** (`/wallet`): Shows amount selector + payment method buttons when epay is enabled
- **Admin Payment page** (`/admin/pay`): Order list with search, pagination, and recheck
- **Admin Record page** (`/admin/record`): Same order monitor view

Payment method availability is exposed via the `/info` API endpoint in the `payment` array field.

## Dependencies

- `github.com/Calcium-Ion/go-epay v0.0.4` — Go EPay SDK
