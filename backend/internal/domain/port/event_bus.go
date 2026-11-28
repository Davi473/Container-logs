package port

// EventTopic identifies domain events broadcast across the application (Observer Pattern).
type EventTopic string

const (
	TopicContainersUpdate EventTopic = "containers:update"
	TopicContainersStats  EventTopic = "containers:stats"
	TopicDockerEvent      EventTopic = "docker:event"
	TopicLogLine          EventTopic = "log:line"
	TopicLogError         EventTopic = "log:error"
)

type DomainEvent struct {
	Topic   EventTopic
	Scope   string // Optional scope (e.g., containerID for log events)
	Payload any
}

type EventHandler func(event DomainEvent)

// EventBus is the port for decoupling publishers (use cases/monitors) from subscribers (WS hub, etc.).
type EventBus interface {
	Publish(event DomainEvent)
	Subscribe(topic EventTopic, handler EventHandler) (unsubscribe func())
}
