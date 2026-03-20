/**
 * In-process event bus for domain event pub/sub between modules.
 *
 * Modules publish events using `eventBus.publish(event)`.
 * Modules subscribe to events using `eventBus.subscribe(eventType, handler)`.
 *
 * This is intentionally synchronous and in-process.
 * For durable async processing, use BullMQ jobs in the worker.
 */

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void

export interface DomainEvent<T = unknown> {
  type: string
  tenantId: string
  occurredAt: string // ISO-8601
  payload: T
  metadata?: Record<string, unknown>
}

class EventBus {
  private handlers = new Map<string, EventHandler[]>()

  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): () => void {
    const existing = this.handlers.get(eventType) ?? []
    this.handlers.set(eventType, [...existing, handler as EventHandler])

    // Return an unsubscribe function
    return () => {
      const current = this.handlers.get(eventType) ?? []
      this.handlers.set(
        eventType,
        current.filter((h) => h !== (handler as EventHandler)),
      )
    }
  }

  async publish<T = unknown>(event: DomainEvent<T>): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? []
    const wildcardHandlers = this.handlers.get('*') ?? []
    const all = [...handlers, ...wildcardHandlers]

    await Promise.all(all.map((h) => Promise.resolve(h(event as DomainEvent))))
  }

  /** Remove all subscriptions — useful in tests. */
  reset(): void {
    this.handlers.clear()
  }

  /** List all registered event types — useful for debugging. */
  registeredTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}

// Singleton event bus — imported and used by all modules.
export const eventBus = new EventBus()
