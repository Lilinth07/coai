package manager

import (
	adaptercommon "chat/adapter/common"
	"chat/addition/web"
	"chat/admin"
	"chat/auth"
	"chat/channel"
	"chat/globals"
	"chat/utils"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

const (
	ReasonStop      = "stop"
	ReasonToolCalls = "tool_calls"
)

func supportRelayPlan() bool {
	return channel.SystemInstance.SupportRelayPlan()
}

func checkEnableState(db *sql.DB, cache *redis.Client, user *auth.User, model string, messages []globals.Message) (state error, plan bool) {
	if supportRelayPlan() {
		return auth.CanEnableModelWithSubscription(db, cache, user, model, messages)
	}

	return auth.CanEnableModel(db, user, model, messages), false
}

func buildApiRecord(c *gin.Context, user *auth.User, key *auth.ApiKey, buffer *utils.Buffer, props *adaptercommon.ChatProps, requestId, model string, stream bool, status string, requestErr error, charged bool) *auth.ApiRecord {
	record := &auth.ApiRecord{
		RequestId: requestId, UserId: user.GetID(utils.GetDBFromContext(c)), KeyId: key.Id,
		KeyName: key.Name, Username: user.Username, Model: model, TokenGroup: key.TokenGroup,
		InputTokens: buffer.CountInputToken(), OutputTokens: buffer.CountOutputToken(false),
		Duration: buffer.GetDuration(), IsStream: stream, Status: status, ClientIP: c.ClientIP(),
	}
	if charged {
		record.Quota = buffer.GetRecordQuota()
	}
	if requestErr != nil {
		record.Error = requestErr.Error()
	}
	if props != nil {
		record.ActualModel = props.Model
		record.ChannelId = props.ChannelId
		record.ChannelName = props.ChannelName
	}
	return record
}

func ChatRelayAPI(c *gin.Context) {
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

	var form RelayForm
	if err := c.ShouldBindJSON(&form); err != nil {
		abortWithErrorResponse(c, fmt.Errorf("invalid request body: %s", err.Error()), "invalid_request_error")
		return
	}

	db := utils.GetDBFromContext(c)
	apiKey := auth.GetApiKeyFromContext(c)
	if apiKey == nil {
		abortWithErrorResponse(c, fmt.Errorf("access denied for invalid api key"), "authentication_error")
		return
	}
	user := &auth.User{
		Username: username,
	}
	id := utils.Md5Encrypt(username + form.Model + time.Now().String())
	created := time.Now().Unix()

	messages := transform(form.Messages)
	if strings.HasPrefix(form.Model, "web-") {
		suffix := strings.TrimPrefix(form.Model, "web-")

		form.Model = suffix
		messages = web.ToSearched(true, messages)
	}

	if strings.HasSuffix(form.Model, "-official") {
		form.Model = strings.TrimSuffix(form.Model, "-official")
		form.Official = true
	}

	charge := channel.ApiChargeInstance.GetCharge(form.Model).WithRatio(apiKey.GroupRatio)
	check := auth.CanEnableApiModel(db, user, apiKey, form.Model, messages, charge)
	if check != nil {
		sendErrorResponse(c, check, "quota_exceeded_error")
		return
	}

	if form.Stream {
		sendStreamTranshipmentResponse(c, form, messages, id, created, user, apiKey, charge)
	} else {
		sendTranshipmentResponse(c, form, messages, id, created, user, apiKey, charge)
	}
}

func getChatProps(form RelayForm, messages []globals.Message, buffer *utils.Buffer) *adaptercommon.ChatProps {
	return adaptercommon.CreateChatProps(&adaptercommon.ChatProps{
		Model:             form.Model,
		Message:           messages,
		MaxTokens:         form.MaxTokens,
		PresencePenalty:   form.PresencePenalty,
		FrequencyPenalty:  form.FrequencyPenalty,
		RepetitionPenalty: form.RepetitionPenalty,
		Temperature:       form.Temperature,
		TopP:              form.TopP,
		TopK:              form.TopK,
		Tools:             form.Tools,
		ToolChoice:        form.ToolChoice,
	}, buffer)
}

func sendTranshipmentResponse(c *gin.Context, form RelayForm, messages []globals.Message, id string, created int64, user *auth.User, apiKey *auth.ApiKey, charge *channel.Charge) {
	db := utils.GetDBFromContext(c)
	cache := utils.GetCacheFromContext(c)

	buffer := utils.NewBuffer(form.Model, messages, charge)
	props := getChatProps(form, messages, buffer)
	hit, err := channel.NewChatRequestWithCache(cache, buffer, apiKey.ChannelGroup, props, func(data *globals.Chunk) error {
		buffer.WriteChunk(data)
		return nil
	})

	admin.AnalyseRequest(form.Model, buffer, err)
	if err != nil {
		globals.Warn(fmt.Sprintf("error from chat request api: %s (instance: %s, client: %s)", err, form.Model, c.ClientIP()))
		_ = auth.SettleApiRequest(db, user, apiKey, buildApiRecord(c, user, apiKey, buffer, props, id, form.Model, false, "error", err, false))
		sendErrorResponse(c, err)
		return
	}

	if settleErr := auth.SettleApiRequest(db, user, apiKey, buildApiRecord(c, user, apiKey, buffer, props, id, form.Model, false, "success", nil, !hit)); settleErr != nil {
		sendErrorResponse(c, settleErr, "quota_exceeded_error")
		return
	}

	tools := buffer.GetToolCalls()

	c.JSON(http.StatusOK, RelayResponse{
		Id:      fmt.Sprintf("chatcmpl-%s", id),
		Object:  "chat.completion",
		Created: created,
		Model:   form.Model,
		Choices: []Choice{
			{
				Index: 0,
				Message: globals.Message{
					Role:         globals.Assistant,
					Content:      buffer.Read(),
					ToolCalls:    tools,
					FunctionCall: buffer.GetFunctionCall(),
				},
				FinishReason: utils.Multi(tools != nil, ReasonToolCalls, ReasonStop),
			},
		},
		Usage: Usage{
			PromptTokens:     buffer.CountInputToken(),
			CompletionTokens: buffer.CountOutputToken(false),
			TotalTokens:      buffer.CountToken(),
		},
		Quota: utils.Multi[*float32](form.Official, nil, utils.ToPtr(buffer.GetQuota())),
	})
}

func getFinishReason(buffer *utils.Buffer, end bool) interface{} {
	if !end {
		return nil
	}

	if buffer.IsFunctionCalling() {
		return ReasonToolCalls
	}

	return ReasonStop
}

func getRole(data *globals.Chunk) string {
	if data.Content != "" {
		return globals.Assistant
	} else if data.ToolCall != nil {
		return globals.Tool
	} else if data.FunctionCall != nil {
		return globals.Function
	}

	return ""
}

func getStreamTranshipmentForm(id string, created int64, form RelayForm, data *globals.Chunk, buffer *utils.Buffer, end bool, err error) RelayStreamResponse {
	return RelayStreamResponse{
		Id:      fmt.Sprintf("chatcmpl-%s", id),
		Object:  "chat.completion.chunk",
		Created: created,
		Model:   form.Model,
		Choices: []ChoiceDelta{
			{
				Index: 0,
				Delta: Message{
					Role:         getRole(data),
					Content:      data.Content,
					ToolCalls:    data.ToolCall,
					FunctionCall: data.FunctionCall,
				},
				FinishReason: getFinishReason(buffer, end),
			},
		},
		Usage: Usage{
			PromptTokens:     buffer.CountInputToken(),
			CompletionTokens: buffer.CountOutputToken(true),
			TotalTokens:      buffer.CountToken(),
		},
		Quota: utils.Multi[*float32](form.Official, nil, utils.ToPtr(buffer.GetQuota())),
		Error: err,
	}
}

func sendStreamTranshipmentResponse(c *gin.Context, form RelayForm, messages []globals.Message, id string, created int64, user *auth.User, apiKey *auth.ApiKey, charge *channel.Charge) {
	partial := make(chan RelayStreamResponse)
	db := utils.GetDBFromContext(c)
	cache := utils.GetCacheFromContext(c)

	go func() {
		buffer := utils.NewBuffer(form.Model, messages, charge)
		props := getChatProps(form, messages, buffer)
		hit, err := channel.NewChatRequestWithCache(
			cache, buffer, apiKey.ChannelGroup, props,
			func(data *globals.Chunk) error {
				buffer.WriteChunk(data)

				if !data.IsEmpty() {
					partial <- getStreamTranshipmentForm(id, created, form, data, buffer, false, nil)
				}
				return nil
			},
		)

		admin.AnalyseRequest(form.Model, buffer, err)
		if err != nil {
			globals.Warn(fmt.Sprintf("error from chat request api: %s (instance: %s, client: %s)", err.Error(), form.Model, c.ClientIP()))
			_ = auth.SettleApiRequest(db, user, apiKey, buildApiRecord(c, user, apiKey, buffer, props, id, form.Model, true, "error", err, false))
			partial <- getStreamTranshipmentForm(id, created, form, &globals.Chunk{Content: err.Error()}, buffer, true, err)
			close(partial)
			return
		}

		if settleErr := auth.SettleApiRequest(db, user, apiKey, buildApiRecord(c, user, apiKey, buffer, props, id, form.Model, true, "success", nil, !hit)); settleErr != nil {
			partial <- getStreamTranshipmentForm(id, created, form, &globals.Chunk{Content: settleErr.Error()}, buffer, true, settleErr)
			close(partial)
			return
		}

		partial <- getStreamTranshipmentForm(id, created, form, &globals.Chunk{Content: ""}, buffer, true, nil)

		close(partial)
		return
	}()

	c.Stream(func(w io.Writer) bool {
		if resp, ok := <-partial; ok {
			if resp.Error != nil {
				sendErrorResponse(c, resp.Error)
				return false
			}

			c.Render(-1, utils.NewEvent(resp))
			return true
		}

		c.Render(-1, utils.NewEndEvent())
		return false
	})
}
