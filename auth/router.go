package auth

import "github.com/gin-gonic/gin"

func Register(app *gin.RouterGroup) {
	app.Any("/", IndexAPI)
	app.POST("/verify", VerifyAPI)
	app.POST("/reset", ResetAPI)
	app.POST("/register", RegisterAPI)
	app.POST("/login", LoginAPI)
	app.POST("/state", StateAPI)
	app.GET("/apikey", KeyAPI)
	app.GET("/userinfo", UserInfoAPI)
	app.POST("/resetkey", ResetKeyAPI)
	app.GET("/keys", ListApiKeysAPI)
	app.POST("/keys", CreateApiKeyAPI)
	app.PUT("/keys/:id", UpdateApiKeyAPI)
	app.DELETE("/keys/:id", DeleteApiKeyAPI)
	app.POST("/keys/:id/reset", ResetApiKeyByIdAPI)
	app.GET("/key-groups", ListApiGroupsAPI)
	app.GET("/api-usage", ApiUsageSummaryAPI)
	app.GET("/api-records", ApiRecordListAPI)
	app.GET("/admin/api/records", AdminApiRecordListAPI)
	app.GET("/admin/api/usage/summary", AdminApiUsageSummaryAPI)
	app.GET("/package", PackageAPI)
	app.GET("/quota", QuotaAPI)
	app.POST("/buy", BuyAPI)
	app.GET("/subscription", SubscriptionAPI)
	app.POST("/subscribe", SubscribeAPI)
	app.GET("/invite", InviteAPI)
	app.GET("/redeem", RedeemAPI)
}
