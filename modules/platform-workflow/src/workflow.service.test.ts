import { describe, it, expect } from 'vitest'
import { workflowEngine, WorkflowError } from './workflow.service'

describe('WorkflowEngine', () => {
  it('transitions plan draft → pending_approval on submit', async () => {
    const next = await workflowEngine.transition('plan', 'draft', 'submit')
    expect(next).toBe('pending_approval')
  })

  it('transitions dispute open → under_review on assign', async () => {
    const next = await workflowEngine.transition('dispute', 'open', 'assign')
    expect(next).toBe('under_review')
  })

  it('throws INVALID_TRANSITION for illegal event', async () => {
    await expect(workflowEngine.transition('plan', 'draft', 'publish')).rejects.toThrow(WorkflowError)
  })

  it('throws UNKNOWN_MACHINE for undefined machine', async () => {
    await expect(workflowEngine.transition('ghost', 'draft', 'go')).rejects.toThrow(WorkflowError)
  })

  it('canTransition returns false for illegal events', () => {
    expect(workflowEngine.canTransition('plan', 'draft', 'publish')).toBe(false)
    expect(workflowEngine.canTransition('plan', 'draft', 'submit')).toBe(true)
  })

  it('availableEvents lists all valid events for a state', () => {
    const events = workflowEngine.availableEvents('plan', 'pending_approval')
    expect(events).toContain('approve')
    expect(events).toContain('reject')
    expect(events).not.toContain('submit')
  })
})
