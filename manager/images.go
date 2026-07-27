package manager

import (
	adaptercommon "chat/adapter/common"
	"chat/admin"
	"chat/auth"
	"chat/channel"
	"chat/globals"
	"chat/utils"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func ImagesRelayAPI(c *gin.Context) {
	if globals.CloseRelay {
		abortWithErrorResponse(c, fmt.Errorf("relay api is denied of access"), "access_denied_error")
		return
	}

	username := utils.GetUserFromContext(c)
	if username == "" {
		abortWithErrorResponse(c, fmt.Errorf("access denied for invalid api key"), "authentication_error")
		return
	}

	if utils.GetAgentFromContext(c) != "api" {
		abortWithErrorResponse(c, fmt.Errorf("access denied for invalid agent"), "authentication_error")
		return
	}

	var form RelayImageForm
	if err := c.ShouldBindJSON(&form); err != nil {
		abortWithErrorResponse(c, fmt.Errorf("invalid request body: %s", err.Error()), "invalid_request_error")
		return
	}

	prompt := strings.TrimSpace(form.Prompt)
	if prompt == "" {
		sendErrorResponse(c, fmt.Errorf("prompt is required"), "invalid_request_error")
	}

	db := utils.GetDBFromContext(c)
	apiKey := auth.GetApiKeyFromContext(c)
	if apiKey == nil {
		sendErrorResponse(c, fmt.Errorf("access denied for invalid api key"), "authentication_error")
		return
	}
	user := &auth.User{
		Username: username,
	}

	created := time.Now().Unix()

	if strings.HasSuffix(form.Model, "-official") {
		form.Model = strings.TrimSuffix(form.Model, "-official")
	}

	charge := channel.ApiChargeInstance.GetCharge(form.Model).WithRatio(apiKey.GroupRatio)
	check := auth.CanEnableApiModel(db, user, apiKey, form.Model, []globals.Message{}, charge)
	if check != nil {
		sendErrorResponse(c, check, "quota_exceeded_error")
		return
	}

	createRelayImageObject(c, form, prompt, created, user, apiKey, charge)
}

func getImageProps(form RelayImageForm, messages []globals.Message, buffer *utils.Buffer) *adaptercommon.ChatProps {
	return adaptercommon.CreateChatProps(&adaptercommon.ChatProps{
		Model:     form.Model,
		Message:   messages,
		MaxTokens: utils.ToPtr(-1),
	}, buffer)
}

func getImageDataFromBuffer(buffer *utils.Buffer) (string, string) {
	content := buffer.Read()

	urls := utils.ExtractImagesFromMarkdown(content)
	if len(urls) > 0 {
		return urls[len(urls)-1], ""
	}

	base64Data := utils.ExtractBase64FromMarkdown(content)
	if len(base64Data) > 0 {
		return "", base64Data[len(base64Data)-1]
	}

	return "", ""
}

func createRelayImageObject(c *gin.Context, form RelayImageForm, prompt string, created int64, user *auth.User, apiKey *auth.ApiKey, charge *channel.Charge) {
	db := utils.GetDBFromContext(c)
	cache := utils.GetCacheFromContext(c)

	messages := []globals.Message{
		{
			Role:    globals.User,
			Content: prompt,
		},
	}

	requestId := utils.Md5Encrypt(user.Username + form.Model + time.Now().String())
	buffer := utils.NewBuffer(form.Model, messages, charge)
	props := getImageProps(form, messages, buffer)
	hit, err := channel.NewChatRequestWithCache(cache, buffer, apiKey.ChannelGroup, props, func(data *globals.Chunk) error {
		buffer.WriteChunk(data)
		return nil
	})

	admin.AnalyseRequest(form.Model, buffer, err)
	if err != nil {
		globals.Warn(fmt.Sprintf("error from chat request api: %s (instance: %s, client: %s)", err, form.Model, c.ClientIP()))
		_ = auth.SettleApiRequest(db, user, apiKey, buildApiRecord(c, user, apiKey, buffer, props, requestId, form.Model, false, "error", err, false))
		sendErrorResponse(c, err)
		return
	}

	if settleErr := auth.SettleApiRequest(db, user, apiKey, buildApiRecord(c, user, apiKey, buffer, props, requestId, form.Model, false, "success", nil, !hit)); settleErr != nil {
		sendErrorResponse(c, settleErr, "quota_exceeded_error")
		return
	}

	url, b64Json := getImageDataFromBuffer(buffer)
	if url == "" && b64Json == "" {
		sendErrorResponse(c, fmt.Errorf("no image generated"), "image_generation_error")
		return
	}

	c.JSON(http.StatusOK, RelayImageResponse{
		Created: created,
		Data: []RelayImageData{
			{
				Url:     url,
				B64Json: b64Json,
			},
		},
	})
}
