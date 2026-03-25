/**
 * @opencomp/config — shared configuration utilities.
 *
 * Provides typed env-var parsing, feature flags, and runtime config access.
 * All values are resolved once at startup and cached.
 */

// ─── Env helpers ──────────────────────────────────────────────────────────────

/** Read a required env var. Throws at startup if missing. */
export function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

/** Read an optional env var with a default. */
export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue
}

/** Read an env var as a number. */
export function getEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key]
  if (!raw) return defaultValue
  const n = parseInt(raw, 10)
  if (isNaN(n)) throw new Error(`Environment variable ${key} must be an integer, got: "${raw}"`)
  return n
}

/** Read an env var as a boolean (true if "true", "1", or "yes"). */
export function getEnvBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key]
  if (!raw) return defaultValue
  return ['true', '1', 'yes'].includes(raw.toLowerCase())
}

// ─── Core config ──────────────────────────────────────────────────────────────

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  databaseUrl: string
  redisUrl: string
  jwtSecret: string
  jwtExpiresIn: string
  logLevel: string
  filesDriver: 'local' | 's3'
  defaultTenantId?: string
}

let _config: AppConfig | undefined

export function loadConfig(): AppConfig {
  if (_config) return _config

  _config = {
    nodeEnv: (getEnv('NODE_ENV', 'development') as AppConfig['nodeEnv']),
    port: getEnvInt('PORT', 3000),
    databaseUrl: getEnv('DATABASE_URL', 'postgres://localhost:5432/opencomp'),
    redisUrl: getEnv('REDIS_URL', 'redis://localhost:6379'),
    jwtSecret: getEnv('JWT_SECRET', 'dev-secret-change-in-production'),
    jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '7d'),
    logLevel: getEnv('LOG_LEVEL', 'info'),
    filesDriver: (getEnv('FILES_DRIVER', 'local') as AppConfig['filesDriver']),
    defaultTenantId: process.env.DEFAULT_TENANT_ID,
  }

  return _config
}

/** Returns the current config, loading it if needed. */
export function getConfig(): AppConfig {
  return loadConfig()
}

// ─── Feature flags ────────────────────────────────────────────────────────────

export interface FeatureFlags {
  /** Enable the BullMQ worker for async calculation runs. */
  asyncCalculations: boolean
  /** Enable S3 file uploads instead of local disk. */
  s3Uploads: boolean
  /** Enable multi-tenant subdomain routing. */
  multiTenant: boolean
}

export function getFeatureFlags(): FeatureFlags {
  return {
    asyncCalculations: getEnvBool('FEATURE_ASYNC_CALCULATIONS', false),
    s3Uploads: getEnvBool('FEATURE_S3_UPLOADS', false),
    multiTenant: getEnvBool('FEATURE_MULTI_TENANT', false),
  }
}
