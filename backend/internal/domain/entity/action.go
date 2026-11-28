package entity

type ContainerAction string

const (
	ActionStart   ContainerAction = "start"
	ActionStop    ContainerAction = "stop"
	ActionRestart ContainerAction = "restart"
	ActionPause   ContainerAction = "pause"
	ActionUnpause ContainerAction = "unpause"
	ActionKill    ContainerAction = "kill"
)

var validActions = map[ContainerAction]struct{}{
	ActionStart:   {},
	ActionStop:    {},
	ActionRestart: {},
	ActionPause:   {},
	ActionUnpause: {},
	ActionKill:    {},
}

func ParseContainerAction(raw string) (ContainerAction, bool) {
	act := ContainerAction(raw)
	_, ok := validActions[act]
	return act, ok
}
