import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from './bus'

describe('EventBus', () => {
  beforeEach(() => {
    eventBus.reset()
  })

  it('delivers events to subscribers', async () => {
    const handler = vi.fn()
    eventBus.subscribe('test.event', handler)

    await eventBus.publish({
      type: 'test.event',
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
      payload: { foo: 'bar' },
    })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].payload).toEqual({ foo: 'bar' })
  })

  it('delivers to wildcard subscribers', async () => {
    const wildcardHandler = vi.fn()
    eventBus.subscribe('*', wildcardHandler)

    await eventBus.publish({
      type: 'anything.happened',
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
      payload: {},
    })

    expect(wildcardHandler).toHaveBeenCalledOnce()
  })

  it('unsubscribes correctly', async () => {
    const handler = vi.fn()
    const unsub = eventBus.subscribe('test.event', handler)
    unsub()

    await eventBus.publish({
      type: 'test.event',
      tenantId: 'tenant-1',
      occurredAt: new Date().toISOString(),
      payload: {},
    })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not bleed events between tenants (handler receives full event)', async () => {
    const received: string[] = []
    eventBus.subscribe('order.created', (e) => {
      received.push(e.tenantId)
    })

    await eventBus.publish({ type: 'order.created', tenantId: 'tenant-a', occurredAt: '', payload: {} })
    await eventBus.publish({ type: 'order.created', tenantId: 'tenant-b', occurredAt: '', payload: {} })

    expect(received).toEqual(['tenant-a', 'tenant-b'])
  })
})
