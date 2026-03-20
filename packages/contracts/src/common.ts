import { z } from 'zod'

// ─── Scalar primitives ────────────────────────────────────────────────────────

export const UuidSchema = z.string().uuid()
export type Uuid = z.infer<typeof UuidSchema>

export const ISODateSchema = z.string().datetime({ offset: true })
export type ISODate = z.infer<typeof ISODateSchema>

// ─── Base entity ─────────────────────────────────────────────────────────────

export const BaseEntitySchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  createdAt: ISODateSchema,
  updatedAt: ISODateSchema,
  deletedAt: ISODateSchema.nullable().optional(),
})
export type BaseEntity = z.infer<typeof BaseEntitySchema>

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── API response envelope ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Currency / Money ─────────────────────────────────────────────────────────
// All monetary amounts stored as integer cents to avoid floating-point issues.

export const MoneySchema = z.object({
  amount: z.number().int(), // in cents
  currency: z.string().length(3), // ISO 4217
})
export type Money = z.infer<typeof MoneySchema>
