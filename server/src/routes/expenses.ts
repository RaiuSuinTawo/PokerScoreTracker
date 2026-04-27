/**
 * Shared expense routes — admin-only create / update / delete.
 * See EXPANSION_PLAN.md §6.3.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'
import { ledgerAccess } from '../middleware/ledgerAccess.js'
import { emitEvent } from '../events/emit.js'
import { LedgerEventType, Role } from '../types.js'

const createBody = z.object({
  label: z.string().trim().min(1).max(40),
  amount: z.number().finite().nonnegative().max(1e9),
})

const patchBody = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  amount: z.number().finite().nonnegative().max(1e9).optional(),
})

function expenseDTO(e: {
  id: string
  label: string
  amount: number
  createdAt: Date
}) {
  return {
    id: e.id,
    label: e.label,
    amount: e.amount,
    createdAt: e.createdAt.toISOString(),
  }
}

export async function expenseRoutes(app: FastifyInstance) {
  // POST /ledgers/:id/expenses
  app.post(
    '/ledgers/:id/expenses',
    {
      preHandler: [
        requireAuth(),
        ledgerAccess({ allowArchived: false, requireRole: Role.ADMIN }),
      ],
    },
    async (req, reply) => {
      const parsed = createBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '参数不合法' } })
      }
      const row = await prisma.$transaction(async (tx) => {
        const e = await tx.sharedExpense.create({
          data: {
            ledgerId: req.ledger!.id,
            label: parsed.data.label,
            amount: Math.abs(parsed.data.amount),
          },
        })
        await emitEvent(tx, req.ledger!.id, LedgerEventType.EXPENSE_CHANGED, {
          expenseId: e.id,
          action: 'create',
          by: req.auth!.userId,
        })
        return e
      })
      return reply.code(201).send({ expense: expenseDTO(row) })
    },
  )

  // PATCH /ledgers/:id/expenses/:eid
  app.patch(
    '/ledgers/:id/expenses/:eid',
    {
      preHandler: [
        requireAuth(),
        ledgerAccess({ allowArchived: false, requireRole: Role.ADMIN }),
      ],
    },
    async (req, reply) => {
      const parsed = patchBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '参数不合法' } })
      }
      const { eid } = req.params as { eid: string }
      const existing = await prisma.sharedExpense.findUnique({ where: { id: eid } })
      if (!existing || existing.ledgerId !== req.ledger!.id) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '公摊不存在' } })
      }
      const patch: Record<string, unknown> = {}
      if (parsed.data.label !== undefined) patch.label = parsed.data.label
      if (parsed.data.amount !== undefined) patch.amount = Math.abs(parsed.data.amount)
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.sharedExpense.update({
          where: { id: eid },
          data: patch,
        })
        await emitEvent(tx, req.ledger!.id, LedgerEventType.EXPENSE_CHANGED, {
          expenseId: eid,
          action: 'update',
          fields: Object.keys(patch),
          by: req.auth!.userId,
        })
        return updated
      })
      return reply.send({ expense: expenseDTO(row) })
    },
  )

  // DELETE /ledgers/:id/expenses/:eid
  app.delete(
    '/ledgers/:id/expenses/:eid',
    {
      preHandler: [
        requireAuth(),
        ledgerAccess({ allowArchived: false, requireRole: Role.ADMIN }),
      ],
    },
    async (req, reply) => {
      const { eid } = req.params as { eid: string }
      const existing = await prisma.sharedExpense.findUnique({ where: { id: eid } })
      if (!existing || existing.ledgerId !== req.ledger!.id) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '公摊不存在' } })
      }
      await prisma.$transaction(async (tx) => {
        await tx.sharedExpense.delete({ where: { id: eid } })
        await emitEvent(tx, req.ledger!.id, LedgerEventType.EXPENSE_CHANGED, {
          expenseId: eid,
          action: 'delete',
          by: req.auth!.userId,
        })
      })
      return reply.code(204).send()
    },
  )
}
