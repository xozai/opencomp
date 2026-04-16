import { Route as rootRoute } from './routes/__root'
import { Route as LoginRoute } from './routes/login'
import { Route as IndexRoute } from './routes/index'
import { Route as GoalSheetsRoute } from './routes/goal-sheets'
import { Route as StatementsRoute } from './routes/statements'
import { Route as DisputesRoute } from './routes/disputes'
import { Route as ForecastRoute } from './routes/forecast'

const routeTree = rootRoute.addChildren([
  LoginRoute,
  IndexRoute,
  GoalSheetsRoute,
  StatementsRoute,
  DisputesRoute,
  ForecastRoute,
])

export { routeTree }
