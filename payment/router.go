package payment

import "github.com/gin-gonic/gin"

func Register(app *gin.RouterGroup) {
	// User payment routes (auth required via middleware)
	app.POST("/payment/create", CreatePaymentAPI)
	app.GET("/payment/check/:order", CheckPaymentAPI)

	// Payment gateway callback routes (anonymous)
	app.GET("/payment/notify", NotifyAPI)
	app.POST("/payment/notify", NotifyAPI)
	app.GET("/payment/return", ReturnAPI)
	app.POST("/payment/return", ReturnAPI)

	// Admin routes (admin check is handled by middleware)
	app.GET("/admin/payment/view", AdminViewAPI)
	app.GET("/admin/payment/recheck", AdminRecheckAPI)
}
