// Auto-generated route tree (manual for now — replace with `tsr generate` once CLI is set up)
import { createRootRouteWithContext } from '@tanstack/react-router'
import { Route as rootRoute } from './routes/__root'
import { Route as LoginRoute } from './routes/login'
import { Route as IndexRoute } from './routes/index'
import { Route as PlansIndexRoute } from './routes/plans/index'
import { Route as PlanDetailRoute } from './routes/plans/$planId'
import { Route as ParticipantsIndexRoute } from './routes/participants/index'
import { Route as CalculationsIndexRoute } from './routes/calculations/index'
import { Route as DisputesIndexRoute } from './routes/disputes/index'
import { Route as ApprovalsIndexRoute } from './routes/approvals/index'

const routeTree = rootRoute.addChildren([
  LoginRoute,
  IndexRoute,
  PlansIndexRoute.addChildren([PlanDetailRoute]),
  ParticipantsIndexRoute,
  CalculationsIndexRoute,
  DisputesIndexRoute,
  ApprovalsIndexRoute,
])

export { routeTree }
