import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'path'
import { getDb, getPool } from './client'

async function main() {
  console.log('Running database migrations...')
  const db = getDb()
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../migrations') })
  console.log('Migrations complete.')
  await getPool().end()
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
