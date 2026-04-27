/**
 * GET /ledgers/:id/settlement — authoritative profit/loss calculation.
 * See EXPANSION_PLAN.md §6.2.
 */
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'
import { ledgerAccess } from '../middleware/ledgerAccess.js'
import { computeSettlement } from '../services/settlement.js'

export async function settlementRoutes(app: FastifyInstance) {
  app.get(
    '/ledgers/:id/settlement',
    { preHandler: [requireAuth(), ledgerAccess({ allowArchived: true })] },
    async (req, reply) => {
      const [players, expenses] = await Promise.all([
        prisma.player.findMany({
          where: { ledgerId: req.ledger!.id },
          select: { id: true, nickname: true, buyInCount: true, chipAmount: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.sharedExpense.findMany({
          where: { ledgerId: req.ledger!.id },
          select: { amount: true },
        }),
      ])
      const ledger = await prisma.ledger.findUnique({
        where: { id: req.ledger!.id },
        select: { chipValue: true, chipMultiplier: true },
      })
      const s = computeSettlement(players, expenses, ledger!.chipValue, ledger!.chipMultiplier)
      return reply.send(s)
    },
  )
}
