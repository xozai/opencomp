/**
 * @opencomp/ui — shared React component library.
 *
 * Thin wrappers around shadcn/ui primitives with OpenComp-specific
 * defaults (colour tokens, typography, spacing). Import from this
 * package rather than directly from shadcn/ui so that visual updates
 * can be made in one place.
 */

// ─── Re-export primitives ─────────────────────────────────────────────────────
// Components are implemented in separate files; only types and utilities live
// here to keep the barrel import cheap.

export type { ButtonProps } from './components/Button'
export { Button } from './components/Button'

export type { BadgeProps } from './components/Badge'
export { Badge } from './components/Badge'

export type { CardProps } from './components/Card'
export { Card, CardHeader, CardTitle, CardContent, CardFooter } from './components/Card'

export type { StatusChipProps } from './components/StatusChip'
export { StatusChip } from './components/StatusChip'

export type { DataTableProps } from './components/DataTable'
export { DataTable } from './components/DataTable'

export type { EmptyStateProps } from './components/EmptyState'
export { EmptyState } from './components/EmptyState'

export type { PageHeaderProps } from './components/PageHeader'
export { PageHeader } from './components/PageHeader'

// ─── Utilities ────────────────────────────────────────────────────────────────

export { cn } from './lib/cn'
export { formatCents, formatPct } from './lib/format'
