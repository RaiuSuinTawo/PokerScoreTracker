/**
 * Player routes — PATCH (field-level perms) and DELETE (admin).
 * See EXPANSION_PLAN.md §6.3.
 *
 * Field-level permissions (for PATCH):
 *   nickname   — self (own playerId) OR admin
 *   chipAmount — admin only (D2 in plan)
 *   order      — admin only
 *
 * buyInCount is NOT patchable via this route — it is changed through
 * the buy-in-request flow (Phase 5).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'
import { ledgerAccess } from '../middleware/ledgerAccess.js'
import { emitEvent } from '../events/emit.js'
import { LedgerEventType, Role } from '../types.js'

const patchBody = z.object({
  nickname: z.string().trim().min(1).max(12).optional(),
  chipAmount: z.number().finite().min(0).max(1e9).optional(),
  order: z.number().int().min(0).max(1e6).optional(),
})

export async function playerRoutes(app: FastifyInstance) {
  // PATCH /ledgers/:id/players/:pid
  app.patch(
    '/ledgers/:id/players/:pid',
    { preHandler: [requireAuth(), ledgerAccess({ allowArchived: false })] },
    async (req, reply) => {
      const parsed = patchBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '参数不合法' } })
      }
      const { pid } = req.params as { pid: string }
      const player = await prisma.player.findUnique({
        where: { id: pid },
        select: { id: true, ledgerId: true },
      })
      if (!player || player.ledgerId !== req.ledger!.id) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '玩家不存在' } })
      }

      const role = req.membership!.role
      const isOwn = req.membership!.playerId === pid
      const patch = parsed.data

      // Per-field permission check.
      if (patch.nickname !== undefined && !(isOwn || role === Role.ADMIN)) {
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: '仅本人或管理员可改昵称' } })
      }
      if (patch.chipAmount !== undefined && role !== Role.ADMIN) {
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: '仅管理员可录入筹码量' } })
      }
      if (patch.order !== undefined && role !== Role.ADMIN) {
        return reply
          .code(403)
          .send({ error: { code: 'FORBIDDEN', message: '仅管理员可调整顺序' } })
      }

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.player.update({
          where: { id: pid },
          data: patch,
        })
        await emitEvent(tx, req.ledger!.id, LedgerEventType.PLAYER_UPDATED, {
          playerId: pid,
          fields: Object.keys(patch),
          by: req.auth!.userId,
        })
        return row
      })

      return reply.send({
        player: {
          id: updated.id,
          nickname: updated.nickname,
          buyInCount: updated.buyInCount,
          chipAmount: updated.chipAmount,
          order: updated.order,
          createdAt: updated.createdAt.toISOString(),
        },
      })
    },
  )

  // DELETE /ledgers/:id/players/:pid — admin only
  app.delete(
    '/ledgers/:id/players/:pid',
    {
      preHandler: [
        requireAuth(),
        ledgerAccess({ allowArchived: false, requireRole: Role.ADMIN }),
      ],
    },
    async (req, reply) => {
      const { pid } = req.params as { pid: string }
      const player = await prisma.player.findUnique({
        where: { id: pid },
        select: { id: true, ledgerId: true, membership: { select: { id: true } } },
      })
      if (!player || player.ledgerId !== req.ledger!.id) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '玩家不存在' } })
      }
      await prisma.$transaction(async (tx) => {
        // Detach the membership.playerId (if any) so the user remains a member.
        if (player.membership) {
          await tx.membership.update({
            where: { id: player.membership.id },
            data: { playerId: null },
          })
        }
        await tx.player.delete({ where: { id: pid } })
        await emitEvent(tx, req.ledger!.id, LedgerEventType.PLAYER_UPDATED, {
          playerId: pid,
          removed: true,
          by: req.auth!.userId,
        })
      })
      return reply.code(204).send()
    },
  )
}
