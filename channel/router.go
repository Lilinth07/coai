package channel

import "github.com/gin-gonic/gin"

func Register(app *gin.RouterGroup) {
	app.GET("/info", GetInfo)
	app.GET("/attachments/:hash", AttachmentService)

	app.GET("/admin/channel/list", GetChannelList)
	app.POST("/admin/channel/create", CreateChannel)
	app.GET("/admin/channel/get/:id", GetChannel)
	app.POST("/admin/channel/update/:id", UpdateChannel)
	app.GET("/admin/channel/delete/:id", DeleteChannel)
	app.GET("/admin/channel/activate/:id", ActivateChannel)
	app.GET("/admin/channel/deactivate/:id", DeactivateChannel)

	app.GET("/admin/charge/list", GetChargeList)
	app.POST("/admin/charge/set", SetCharge)
	app.GET("/admin/charge/delete/:id", DeleteCharge)
	app.POST("/admin/charge/sync", SyncCharge)
	app.GET("/api-pricing", GetApiChargeList)
	app.GET("/admin/api/charge/list", GetApiChargeList)
	app.POST("/admin/api/charge/set", SetApiCharge)
	app.GET("/admin/api/charge/delete/:id", DeleteApiCharge)
	app.POST("/admin/api/charge/sync", SyncApiCharge)
	app.GET("/admin/api/groups", GetApiGroups)
	app.POST("/admin/api/groups", SetApiGroup)
	app.DELETE("/admin/api/groups/:id", DeleteApiGroup)

	app.GET("/admin/config/view", GetConfig)
	app.POST("/admin/config/update", UpdateConfig)

	app.GET("/admin/plan/view", GetPlanConfig)
	app.POST("/admin/plan/update", UpdatePlanConfig)
}
