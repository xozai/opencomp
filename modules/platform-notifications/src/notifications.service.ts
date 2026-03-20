import type { Db } from '../../../apps/api/src/db/client'
import { notifications, users } from '../../../apps/api/src/db/schema'
import { eq, and } from 'drizzle-orm'

export interface SendNotificationInput {
  tenantId: string
  recipientId: string
  type: string
  title: string
  body: string
  metadata?: Record<string, unknown>
}

export interface EmailPayload {
  to: string
  subject: string
  text: string
}

// ─── Email drivers ────────────────────────────────────────────────────────────

type EmailDriver = (payload: EmailPayload) => Promise<void>

const consoleDriver: EmailDriver = async (payload) => {
  console.log('[email:console]', JSON.stringify(payload, null, 2))
}

function getEmailDriver(): EmailDriver {
  const driver = process.env.EMAIL_DRIVER ?? 'console'
  if (driver === 'console') return consoleDriver
  // Future: smtp driver via nodemailer
  return consoleDriver
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationsService {
  constructor(private db: Db) {}

  async send(input: SendNotificationInput): Promise<void> {
    // Persist in-app notification
    await this.db.insert(notifications).values({
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      isRead: false,
      metadata: input.metadata ?? {},
    })

    // Look up recipient email
    const [user] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.recipientId))
      .limit(1)

    if (user?.email) {
      await getEmailDriver()({
        to: user.email,
        subject: input.title,
        text: input.body,
      })
    }
  }

  async listForUser(tenantId: string, userId: string, unreadOnly = false) {
    const all = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.recipientId, userId)))

    return unreadOnly ? all.filter((n) => !n.isRead) : all
  }

  async markRead(tenantId: string, notificationId: string, userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.id, notificationId),
          eq(notifications.recipientId, userId),
        ),
      )
  }
}
