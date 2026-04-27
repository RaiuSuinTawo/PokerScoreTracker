/**
 * Profile routes — per-user ledger history and bankroll curve.
 * See EXPANSION_PLAN.md §6.6 and §8 Phase 7.
 *
 *   GET /profile/ledgers
 *     → { ledgers: [{ id, serial, title, status, role, archivedAt, createdAt, myNet }] }
 *     Every ledger the user is a member of, with `myNet` computed from the
 *     authoritative settlement formula for the user's player row (null if the
 *     user has no player row in that ledger).
 *
 *   GET /profile/bankroll
 *     → { points: [{ at, ledgerId, ledgerTitle, perLedgerNet, cumulative }] }
 *     Only ARCHIVED ledgers, ordered by archivedAt ascending, cumulative running
 *     sum of `myNet`.
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'
import { computeSettlement } from '../services/settlement.js'

interface ProfileLedgerRow {
  id: string
  serial: string
  title: string
  status: string
  role: string
  archivedAt: string | null
  createdAt: string
  myNet: number | null
}

async function buildProfile(userId: string): Promise<ProfileLedgerRow[]> {
  const rows = await prisma.membership.findMany({
    where: { userId },
    include: {
      ledger: {
        include: {
          players: {
            select: { id: true, nickname: true, buyInCount: true, chipAmount: true },
          },
          expenses: { select: { amount: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })

  const out: ProfileLedgerRow[] = []
  for (const m of rows) {
    const l = m.ledger
    let myNet: number | null = null
    if (m.playerId) {
      const s = computeSettlement(l.players, l.expenses, l.chipValue, l.chipMultiplier)
      const mine = s.perPlayer.find((p) => p.playerId === m.playerId)
      myNet = mine ? mine.finalProfit : null
    }
    out.push({
      id: l.id,
      serial: l.serial,
      title: l.title,
      status: l.status,
      role: m.role,
      archivedAt: l.archivedAt ? l.archivedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
      myNet,
    })
  }
  return out
}

export async function profileRoutes(app: FastifyInstance) {
  app.get(
    '/profile/ledgers',
    { preHandler: requireAuth() },
    async (req, reply) => {
      const rows = await buildProfile(req.auth!.userId)
      return reply.send({ ledgers: rows })
    },
  )

  app.get(
    '/profile/bankroll',
    { preHandler: requireAuth() },
    async (req, reply) => {
      const rows = await buildProfile(req.auth!.userId)
      const archived = rows
        .filter((r) => r.status === 'ARCHIVED' && r.archivedAt && r.myNet !== null)
        .sort((a, b) => (a.archivedAt! < b.archivedAt! ? -1 : 1))
      let cumulative = 0
      const points = archived.map((r) => {
        cumulative = Math.round((cumulative + (r.myNet ?? 0)) * 100) / 100
        return {
          at: r.archivedAt!,
          ledgerId: r.id,
          ledgerTitle: r.title,
          ledgerSerial: r.serial,
          perLedgerNet: r.myNet ?? 0,
          cumulative,
        }
      })
      return reply.send({ points })
    },
  )
}
