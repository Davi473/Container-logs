package eventbus

import (
	"sync"

	"container-log-monitor/internal/domain/port"
)

type subscriber struct {
	id      uint64
	handler port.EventHandler
}

// MemoryEventBus is an in-memory thread-safe implementation of port.EventBus (Observer Pattern).
type MemoryEventBus struct {
	mu     sync.RWMutex
	nextID uint64
	topics map[port.EventTopic][]subscriber
}

func NewMemoryEventBus() *MemoryEventBus {
	return &MemoryEventBus{
		topics: make(map[port.EventTopic][]subscriber),
	}
}

func (b *MemoryEventBus) Publish(event port.DomainEvent) {
	b.mu.RLock()
	subs := append([]subscriber(nil), b.topics[event.Topic]...)
	b.mu.RUnlock()

	for _, s := range subs {
		s.handler(event)
	}
}

func (b *MemoryEventBus) Subscribe(topic port.EventTopic, handler port.EventHandler) func() {
	b.mu.Lock()
	b.nextID++
	id := b.nextID
	b.topics[topic] = append(b.topics[topic], subscriber{id: id, handler: handler})
	b.mu.Unlock()

	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		list := b.topics[topic]
		for i, s := range list {
			if s.id == id {
				b.topics[topic] = append(list[:i], list[i+1:]...)
				break
			}
		}
	}
}
