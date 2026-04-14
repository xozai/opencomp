import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { Db } from '../../../apps/api/src/db/client'
import { users, participants } from '../../../apps/api/src/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

// ─── Config ───────────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ACCESS_TOKEN_TTL = (process.env.JWT_EXPIRES_IN ?? '15m') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REFRESH_TOKEN_TTL = (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as any

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
})
export type TokenPair = z.infer<typeof TokenPairSchema>

export interface JwtPayload {
  sub: string       // user id
  tenantId: string
  email: string
  role: string
  participantId?: string
  type: 'access' | 'refresh'
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AuthService {
  constructor(private db: Db) {}

  async login(input: LoginInput, tenantId: string): Promise<TokenPair> {
    const parsed = LoginSchema.parse(input)

    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.email, parsed.email.toLowerCase()),
          eq(users.isActive, true),
          isNull(users.deletedAt),
        ),
      )
      .limit(1)

    if (!user) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash)
    if (!valid) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    // Update lastLoginAt
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))

    let participantId: string | undefined
    if (user.role === 'rep') {
      const [p] = await this.db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.userId, user.id), isNull(participants.deletedAt)))
        .limit(1)
      participantId = p?.id
    }

    return this.issueTokenPair({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      ...(participantId !== undefined ? { participantId } : {}),
    })
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload
    try {
      payload = jwt.verify(refreshToken, getJwtSecret()) as JwtPayload
    } catch {
      throw new AuthError('INVALID_TOKEN', 'Invalid or expired refresh token')
    }

    if (payload.type !== 'refresh') {
      throw new AuthError('INVALID_TOKEN', 'Token is not a refresh token')
    }

    // Verify user still exists and is active
    const [user] = await this.db
      .select({ id: users.id, tenantId: users.tenantId, email: users.email, role: users.role, isActive: users.isActive })
      .from(users)
      .where(and(eq(users.id, payload.sub), eq(users.isActive, true), isNull(users.deletedAt)))
      .limit(1)

    if (!user) {
      throw new AuthError('INVALID_TOKEN', 'User not found or inactive')
    }

    return this.issueTokenPair({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    })
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as JwtPayload
      if (payload.type !== 'access') {
        throw new AuthError('INVALID_TOKEN', 'Token is not an access token')
      }
      return payload
    } catch (err) {
      if (err instanceof AuthError) throw err
      throw new AuthError('INVALID_TOKEN', 'Invalid or expired access token')
    }
  }

  async hashPassword(password: string): Promise<string> {
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12)
    return bcrypt.hash(password, rounds)
  }

  private issueTokenPair(claims: Omit<JwtPayload, 'type'> & { participantId?: string }): TokenPair {
    const secret = getJwtSecret()
    const accessToken = jwt.sign({ ...claims, type: 'access' }, secret, {
      expiresIn: ACCESS_TOKEN_TTL,
    })
    const refreshToken = jwt.sign({ ...claims, type: 'refresh' }, secret, {
      expiresIn: REFRESH_TOKEN_TTL,
    })
    return { accessToken, refreshToken, expiresIn: 900 } // 15m in seconds
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
