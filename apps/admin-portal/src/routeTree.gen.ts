// Auto-generated route tree (manual for now — replace with `tsr generate` once CLI is set up)
import { Route as rootRoute } from './routes/__root'
import { Route as LoginRoute } from './routes/login'
import { Route as IndexRoute } from './routes/index'
import { Route as PlansIndexRoute } from './routes/plans/index'
import { Route as PlanDetailRoute } from './routes/plans/$planId'
import { Route as ParticipantsIndexRoute } from './routes/participants/index'
import { Route as CalculationsIndexRoute } from './routes/calculations/index'
import { Route as DisputesIndexRoute } from './routes/disputes/index'
import { Route as ApprovalsIndexRoute } from './routes/approvals/index'
import { Route as QuotasIndexRoute } from './routes/quotas/index'
import { Route as PeriodsIndexRoute } from './routes/periods/index'
import { Route as TransactionsIndexRoute } from './routes/transactions/index'
import { Route as AdjustmentsIndexRoute } from './routes/adjustments/index'
import { Route as ReportsIndexRoute } from './routes/reports/index'
import { Route as GoalSheetsIndexRoute } from './routes/goal-sheets/index'

const routeTree = rootRoute.addChildren([
  LoginRoute,
  IndexRoute,
  PlansIndexRoute,
  PlanDetailRoute,
  ParticipantsIndexRoute,
  QuotasIndexRoute,
  CalculationsIndexRoute,
  AdjustmentsIndexRoute,
  ReportsIndexRoute,
  GoalSheetsIndexRoute,
  PeriodsIndexRoute,
  TransactionsIndexRoute,
  DisputesIndexRoute,
  ApprovalsIndexRoute,
])

export { routeTree }
