/**
 * Sample dispute routing plugin.
 *
 * Demonstrates the DisputeRouterExtension SDK interface.
 * Routes disputes to a specific reviewer based on amount thresholds.
 *
 * Install: import this module at API startup (after the SDK is loaded).
 */

import { registerPlugin } from '../../../packages/sdk/src'
import type { DisputeRouterExtension } from '../../../packages/sdk/src'

const disputeRouter: DisputeRouterExtension = {
  extensionId: 'sample.dispute-router',

  /**
   * Route a dispute to the appropriate reviewer.
   *
   * Rules:
   *  - amount > $10k  → route to "senior-comp-manager" role
   *  - default        → route to "comp-analyst" role
   */
  async route(dispute: {
    id: string
    participantId: string
    payoutId: string
    amountCents?: number
    tenantId: string
  }): Promise<{ assignedToRole: string; priority: 'low' | 'normal' | 'high' }> {
    const amount = dispute.amountCents ?? 0

    if (amount > 1_000_000) {
      // > $10k (in cents)
      return { assignedToRole: 'senior-comp-manager', priority: 'high' }
    }

    if (amount > 250_000) {
      // > $2.5k
      return { assignedToRole: 'comp-manager', priority: 'normal' }
    }

    return { assignedToRole: 'comp-analyst', priority: 'low' }
  },
}

registerPlugin({
  manifest: {
    id: 'sample-dispute-routing',
    name: 'Sample Dispute Routing',
    version: '0.1.0',
    description: 'Routes disputes by dollar amount threshold to appropriate reviewers',
    author: 'OpenComp Contributors',
    license: 'Apache-2.0',
    extensionPoints: ['dispute-router'],
  },
  extensions: [
    { type: 'dispute-router', implementation: disputeRouter },
  ],
})

export { disputeRouter }
