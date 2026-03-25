import * as React from 'react'
import { Badge } from './Badge'
import type { BadgeProps } from './Badge'

export interface StatusChipProps {
  status: string
  className?: string
}

const STATUS_MAP: Record<string, BadgeProps['variant']> = {
  // Generic
  active: 'success',
  inactive: 'secondary',
  draft: 'secondary',
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'destructive',
  // Plans
  published: 'success',
  archived: 'secondary',
  // Calculations
  running: 'warning',
  completed: 'success',
  failed: 'destructive',
  // Disputes
  open: 'warning',
  under_review: 'warning',
  resolved: 'success',
  // Payouts
  paid: 'success',
  // Goal sheets
  distributed: 'default',
  acknowledged: 'success',
}

export function StatusChip({ status, className }: StatusChipProps) {
  const variant = STATUS_MAP[status] ?? 'secondary'
  return (
    <Badge variant={variant} className={className}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}
