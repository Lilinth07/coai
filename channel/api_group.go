package channel

import (
	"chat/globals"
	"chat/utils"
	"errors"
	"strings"

	"github.com/spf13/viper"
)

func defaultApiGroups() ApiGroupSequence {
	return ApiGroupSequence{
		&ApiGroup{Id: "default", Name: "默认分组", Ratio: 1, Enabled: true, MinLevel: 0},
		&ApiGroup{Id: "basic", Name: "基础分组", ChannelGroup: globals.BasicType, Ratio: 1, Enabled: true, MinLevel: 1},
		&ApiGroup{Id: "standard", Name: "标准分组", ChannelGroup: globals.StandardType, Ratio: 1, Enabled: true, MinLevel: 2},
		&ApiGroup{Id: "pro", Name: "专业分组", ChannelGroup: globals.ProType, Ratio: 1, Enabled: true, MinLevel: 3},
	}
}

func NewApiGroupManager() *ApiGroupManager {
	var seq ApiGroupSequence
	if err := viper.UnmarshalKey("api_group", &seq); err != nil || len(seq) == 0 {
		seq = defaultApiGroups()
	}
	m := &ApiGroupManager{Sequence: seq}
	m.Normalize()
	return m
}

func (m *ApiGroupManager) Normalize() {
	seen := map[string]bool{}
	seq := make(ApiGroupSequence, 0, len(m.Sequence))
	for _, group := range m.Sequence {
		if group == nil {
			continue
		}
		group.Id = strings.TrimSpace(group.Id)
		group.Name = strings.TrimSpace(group.Name)
		if group.Id == "" || seen[group.Id] {
			continue
		}
		if group.Name == "" {
			group.Name = group.Id
		}
		if group.Ratio <= 0 {
			group.Ratio = 1
		}
		seen[group.Id] = true
		seq = append(seq, group)
	}
	if len(seq) == 0 {
		seq = defaultApiGroups()
	}
	m.Sequence = seq
}

func (m *ApiGroupManager) SaveConfig() error {
	m.Normalize()
	return utils.SaveConfig("api_group", m.Sequence)
}

func (m *ApiGroupManager) List() ApiGroupSequence {
	return m.Sequence
}

func (m *ApiGroupManager) Get(id string) *ApiGroup {
	for _, group := range m.Sequence {
		if group.Id == id {
			return group
		}
	}
	return nil
}

func (m *ApiGroupManager) Available(level int, admin bool) ApiGroupSequence {
	result := make(ApiGroupSequence, 0)
	for _, group := range m.Sequence {
		if group.Enabled && (admin || level >= group.MinLevel) {
			copy := *group
			result = append(result, &copy)
		}
	}
	return result
}

func (m *ApiGroupManager) Set(group ApiGroup) error {
	group.Id = strings.TrimSpace(group.Id)
	if group.Id == "" {
		return errors.New("group id is required")
	}
	if group.Ratio <= 0 {
		return errors.New("group ratio must be greater than zero")
	}
	for i, item := range m.Sequence {
		if item.Id == group.Id {
			m.Sequence[i] = &group
			return m.SaveConfig()
		}
	}
	m.Sequence = append(m.Sequence, &group)
	return m.SaveConfig()
}

func (m *ApiGroupManager) Delete(id string) error {
	if id == "default" {
		return errors.New("default group cannot be deleted")
	}
	for i, group := range m.Sequence {
		if group.Id == id {
			m.Sequence = append(m.Sequence[:i], m.Sequence[i+1:]...)
			return m.SaveConfig()
		}
	}
	return errors.New("group not found")
}
