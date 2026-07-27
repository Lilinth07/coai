package auth

import (
	"chat/channel"
	"chat/utils"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func ListApiKeysAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	keys, err := user.ListApiKeys(utils.GetDBFromContext(c))
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "data": keys, "error": utils.GetError(err)})
}

func CreateApiKeyAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	var form ApiKeyUpsertForm
	if err := c.ShouldBindJSON(&form); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
		return
	}
	key, err := user.CreateApiKeyWithForm(utils.GetDBFromContext(c), form)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "data": key, "error": utils.GetError(err)})
}

func UpdateApiKeyAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	var form ApiKeyUpsertForm
	if err := c.ShouldBindJSON(&form); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
		return
	}
	form.Id, _ = strconv.ParseInt(c.Param("id"), 10, 64)
	err := user.UpdateApiKey(utils.GetDBFromContext(c), form)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "error": utils.GetError(err)})
}

func DeleteApiKeyAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	err := user.DeleteApiKey(utils.GetDBFromContext(c), id)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "error": utils.GetError(err)})
}

func ResetApiKeyByIdAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	key, err := user.ResetApiKeyById(utils.GetDBFromContext(c), id)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "data": gin.H{"key": key}, "error": utils.GetError(err)})
}

func ListApiGroupsAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	db := utils.GetDBFromContext(c)
	groups := channel.ApiGroupInstance.Available(user.GetSubscriptionLevel(db), user.IsAdmin(db))
	c.JSON(http.StatusOK, gin.H{"status": true, "data": groups})
}

func ApiUsageSummaryAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	db := utils.GetDBFromContext(c)
	summary, err := GetApiUsageSummary(db, user.GetID(db), false)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "data": summary, "error": utils.GetError(err)})
}

func ApiRecordListAPI(c *gin.Context) {
	user := GetUser(c)
	if user == nil {
		return
	}
	var query ApiRecordQuery
	_ = c.ShouldBindQuery(&query)
	db := utils.GetDBFromContext(c)
	records, total, err := ListApiRecords(db, user.GetID(db), false, query)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "data": gin.H{"records": records, "total": total}, "error": utils.GetError(err)})
}

func AdminApiRecordListAPI(c *gin.Context) {
	var query ApiRecordQuery
	_ = c.ShouldBindQuery(&query)
	records, total, err := ListApiRecords(utils.GetDBFromContext(c), 0, true, query)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "data": gin.H{"records": records, "total": total}, "error": utils.GetError(err)})
}

func AdminApiUsageSummaryAPI(c *gin.Context) {
	summary, err := GetApiUsageSummary(utils.GetDBFromContext(c), 0, true)
	c.JSON(http.StatusOK, gin.H{"status": err == nil, "data": summary, "error": utils.GetError(err)})
}
