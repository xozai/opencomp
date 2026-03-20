import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService, AuthError } from './auth.service'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'alice@example.com',
  passwordHash: '$2b$12$mockhashedpassword', // bcrypt hash placeholder
  role: 'comp_manager',
  isActive: true,
  deletedAt: null,
}

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([mockUser]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
}

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('$2b$12$newhash'),
  },
}))

process.env.JWT_SECRET = 'test-secret-min-32-chars-long-enough'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService(mockDb as any)
    vi.clearAllMocks()
  })

  describe('verifyAccessToken', () => {
    it('throws AuthError for invalid token', () => {
      expect(() => service.verifyAccessToken('invalid-token')).toThrow(AuthError)
    })

    it('returns payload for valid access token', async () => {
      const { accessToken } = await service.login(
        { email: 'alice@example.com', password: 'password123' },
        'tenant-1',
      )
      const payload = service.verifyAccessToken(accessToken)
      expect(payload.sub).toBe('user-1')
      expect(payload.tenantId).toBe('tenant-1')
      expect(payload.type).toBe('access')
    })
  })

  describe('login', () => {
    it('returns token pair on valid credentials', async () => {
      const result = await service.login(
        { email: 'alice@example.com', password: 'password123' },
        'tenant-1',
      )
      expect(result.accessToken).toBeTruthy()
      expect(result.refreshToken).toBeTruthy()
      expect(result.expiresIn).toBe(900)
    })

    it('throws INVALID_CREDENTIALS when user not found', async () => {
      mockDb.limit.mockResolvedValueOnce([])
      await expect(
        service.login({ email: 'unknown@example.com', password: 'pass' }, 'tenant-1'),
      ).rejects.toThrow(AuthError)
    })
  })
})
