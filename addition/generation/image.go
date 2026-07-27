package generation

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

	"github.com/gin-gonic/gin"
)

// ImageRequest is the browser-facing drawing request. The optional fields are
// intentionally kept as presentation metadata for models that do not expose
// native image controls through the common chat interface.
type ImageRequest struct {
	Prompt         string `json:"prompt" binding:"required"`
	NegativePrompt string `json:"negative_prompt"`
	Model          string `json:"model" binding:"required"`
	Style          string `json:"style"`
	Quality        string `json:"quality"`
	Size           string `json:"size"`
}

type ImageResponse struct {
	URL    string  `json:"url,omitempty"`
	B64    string  `json:"b64_json,omitempty"`
	Quota  float32 `json:"quota"`
	Prompt string  `json:"prompt"`
}

func imageDataFromBuffer(buffer *utils.Buffer) (string, string) {
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

// ImageAPI generates one image for a logged-in website user. It deliberately
// reuses the normal chat pipeline so channel fallback, subscriptions, quota
// accounting and server-side image storage remain consistent with chat/API use.
func ImageAPI(c *gin.Context) {
	user := auth.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"status": false, "error": "login required"})
		return
	}

	var form ImageRequest
	if err := c.ShouldBindJSON(&form); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "invalid request body"})
		return
	}

	prompt := strings.TrimSpace(form.Prompt)
	model := strings.TrimSpace(form.Model)
	if prompt == "" || model == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "prompt and model are required"})
		return
	}

	parts := []string{prompt}
	if style := strings.TrimSpace(form.Style); style != "" && style != "auto" {
		parts = append(parts, fmt.Sprintf("Style: %s", style))
	}
	if quality := strings.TrimSpace(form.Quality); quality != "" && quality != "standard" {
		parts = append(parts, fmt.Sprintf("Quality: %s", quality))
	}
	if negative := strings.TrimSpace(form.NegativePrompt); negative != "" {
		parts = append(parts, fmt.Sprintf("Avoid: %s", negative))
	}
	requestPrompt := strings.Join(parts, "\n")

	db := utils.GetDBFromContext(c)
	cache := utils.GetCacheFromContext(c)
	if check, plan := auth.CanEnableModelWithSubscription(db, cache, user, model, []globals.Message{{Role: globals.User, Content: requestPrompt}}); check != nil {
		c.JSON(http.StatusOK, gin.H{"status": false, "error": check.Error()})
		return
	} else {
		charge := channel.ChargeInstance.GetCharge(model)
		buffer := utils.NewBuffer(model, []globals.Message{{Role: globals.User, Content: requestPrompt}}, charge)
		props := adaptercommon.CreateChatProps(&adaptercommon.ChatProps{
			Model:         model,
			OriginalModel: model,
			Message:       []globals.Message{{Role: globals.User, Content: requestPrompt}},
			MaxTokens:     utils.ToPtr(-1),
		}, buffer)
		err := channel.NewChatRequest(auth.GetGroup(db, user), props, func(data *globals.Chunk) error {
			buffer.WriteChunk(data)
			return nil
		})
		admin.AnalyseRequest(model, buffer, err)
		if err != nil {
			auth.RevertSubscriptionUsage(db, cache, user, model)
			c.JSON(http.StatusOK, gin.H{"status": false, "error": err.Error()})
			return
		}
		if !plan && buffer.GetQuota() > 0 {
			user.UseQuota(db, buffer.GetQuota())
		}

		url, b64 := imageDataFromBuffer(buffer)
		if url == "" && b64 == "" {
			c.JSON(http.StatusOK, gin.H{"status": false, "error": "no image generated"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"status": true,
			"data": ImageResponse{URL: url, B64: b64, Quota: buffer.GetQuota(), Prompt: requestPrompt},
		})
	}
}
