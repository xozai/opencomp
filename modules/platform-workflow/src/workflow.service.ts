/**
 * Lightweight finite-state-machine engine.
 *
 * Usage:
 *   const machine = workflowEngine.define('plan', planTransitions)
 *   const next = workflowEngine.transition('plan', currentState, 'submit')
 */

export type Transition<S extends string, E extends string> = {
  from: S | S[]
  event: E
  to: S
  guard?: (ctx: Record<string, unknown>) => boolean
  onTransition?: (from: S, to: S, ctx: Record<string, unknown>) => void | Promise<void>
}

export type MachineDefinition<S extends string, E extends string> = {
  initial: S
  transitions: Transition<S, E>[]
}

export class WorkflowError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'WorkflowError'
  }
}

class WorkflowEngine {
  private machines = new Map<string, MachineDefinition<string, string>>()

  define<S extends string, E extends string>(
    name: string,
    definition: MachineDefinition<S, E>,
  ): MachineDefinition<S, E> {
    this.machines.set(name, definition as unknown as MachineDefinition<string, string>)
    return definition
  }

  async transition<S extends string, E extends string>(
    machineName: string,
    currentState: S,
    event: E,
    ctx: Record<string, unknown> = {},
  ): Promise<S> {
    const machine = this.machines.get(machineName)
    if (!machine) {
      throw new WorkflowError('UNKNOWN_MACHINE', `No machine defined for "${machineName}"`)
    }

    const match = machine.transitions.find((t) => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from]
      return fromStates.includes(currentState) && t.event === event
    })

    if (!match) {
      throw new WorkflowError(
        'INVALID_TRANSITION',
        `Cannot apply event "${event}" to state "${currentState}" in machine "${machineName}"`,
      )
    }

    if (match.guard && !match.guard(ctx)) {
      throw new WorkflowError('GUARD_REJECTED', `Transition guard rejected event "${event}"`)
    }

    if (match.onTransition) {
      await match.onTransition(currentState, match.to, ctx)
    }

    return match.to as S
  }

  canTransition(machineName: string, currentState: string, event: string): boolean {
    const machine = this.machines.get(machineName)
    if (!machine) return false
    return machine.transitions.some((t) => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from]
      return fromStates.includes(currentState) && t.event === event
    })
  }

  availableEvents(machineName: string, currentState: string): string[] {
    const machine = this.machines.get(machineName)
    if (!machine) return []
    return machine.transitions
      .filter((t) => {
        const fromStates = Array.isArray(t.from) ? t.from : [t.from]
        return fromStates.includes(currentState)
      })
      .map((t) => t.event)
  }
}

export const workflowEngine = new WorkflowEngine()

// ─── Built-in machine: Plan lifecycle ─────────────────────────────────────────

workflowEngine.define('plan', {
  initial: 'draft',
  transitions: [
    { from: 'draft', event: 'submit', to: 'pending_approval' },
    { from: 'pending_approval', event: 'approve', to: 'approved' },
    { from: 'pending_approval', event: 'reject', to: 'draft' },
    { from: 'approved', event: 'publish', to: 'published' },
    { from: ['draft', 'pending_approval', 'approved', 'published'], event: 'archive', to: 'archived' },
  ],
})

// ─── Built-in machine: Dispute lifecycle ──────────────────────────────────────

workflowEngine.define('dispute', {
  initial: 'open',
  transitions: [
    { from: 'open', event: 'assign', to: 'under_review' },
    { from: ['open', 'under_review'], event: 'escalate', to: 'escalated' },
    { from: ['open', 'under_review', 'escalated'], event: 'resolve', to: 'resolved' },
  ],
})

// ─── Built-in machine: Approval request lifecycle ─────────────────────────────

workflowEngine.define('approval', {
  initial: 'pending',
  transitions: [
    { from: 'pending', event: 'approve', to: 'approved' },
    { from: 'pending', event: 'reject', to: 'rejected' },
    { from: 'pending', event: 'escalate', to: 'escalated' },
    { from: 'escalated', event: 'approve', to: 'approved' },
    { from: 'escalated', event: 'reject', to: 'rejected' },
  ],
})
