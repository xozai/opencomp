import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

let _pool: Pool | undefined

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      min: Number(process.env.DATABASE_POOL_MIN ?? 2),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    })
  }
  return _pool
}

export function getDb() {
  return drizzle(getPool(), { schema })
}

export type Db = ReturnType<typeof getDb>
