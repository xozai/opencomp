import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL ?? 'postgresql://opencomp:opencomp@localhost:5432/opencomp_dev',
  },
} satisfies Config
