/**
 * Event stream for polling clients.
 * See EXPANSION_PLAN.md §6.5.
 *
 *   GET /ledgers/:id/events?since=<ISO>
 *   → { events: [{ id, type, payload, createdAt }], serverTime }
 *
 * When `since` is omitted, returns the most recent N events so the client
 * can initialise its `lastEventAt`.
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'
import { ledgerAccess } from '../middleware/ledgerAccess.js'

const MAX_ROWS = 100

export async function eventRoutes(app: FastifyInstance) {
  app.get(
    '/ledgers/:id/events',
    { preHandler: [requireAuth(), ledgerAccess({ allowArchived: true })] },
    async (req, reply) => {
      const { since } = req.query as { since?: string }
      const sinceDate = since ? new Date(since) : null
      const where: any = { ledgerId: req.ledger!.id }
      if (sinceDate && !isNaN(sinceDate.getTime())) {
        where.createdAt = { gt: sinceDate }
      }
      const rows = await prisma.ledgerEvent.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: MAX_ROWS,
      })
      return reply.send({
        events: rows.map((r) => ({
          id: r.id,
          type: r.type,
          payload: r.payload ? safeJson(r.payload) : null,
          createdAt: r.createdAt.toISOString(),
        })),
        serverTime: new Date().toISOString(),
      })
    },
  )
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
