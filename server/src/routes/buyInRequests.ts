/**
 * Buy-in request flow.
 * See EXPANSION_PLAN.md §6.4 and §8 Phase 5.
 *
 * Rules:
 *  - POST  /ledgers/:id/buy-in-requests
 *      Creates a PENDING request for the requester's own Player row.
 *      If requester is the ledger admin AND target player is their own
 *      player row, auto-approve in the same transaction (D3).
 *  - GET   /ledgers/:id/buy-in-requests?status=PENDING
 *      Admin: sees every request for the ledger.
 *      Player: sees only own.
 *  - POST  /buy-in-requests/:rid/approve
 *      Admin-only. Tx: mark APPROVED + increment buyInCount + emit event.
 *  - POST  /buy-in-requests/:rid/reject
 *      Admin-only. Tx: mark REJECTED with optional reason + emit event.
 *  - POST  /buy-in-requests/:rid/cancel
 *      Requester-only, PENDING only.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'
import { ledgerAccess } from '../middleware/ledgerAccess.js'
import { emitEvent } from '../events/emit.js'
import { LedgerEventType, ReqStatus, Role } from '../types.js'

const createBody = z.object({
  hands: z.number().int().min(1).max(1000),
  note: z.string().trim().max(120).optional(),
})

const rejectBody = z.object({
  reason: z.string().trim().max(120).optional(),
})

const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELED']).optional(),
})

function reqDTO(r: {
  id: string
  ledgerId: string
  playerId: string
  requestedById: string
  hands: number
  status: string
  decidedById: string | null
  decidedAt: Date | null
  note: string | null
  rejectReason: string | null
  createdAt: Date
}) {
  return {
    id: r.id,
    ledgerId: r.ledgerId,
    playerId: r.playerId,
    requestedById: r.requestedById,
    hands: r.hands,
    status: r.status,
    decidedById: r.decidedById,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    note: r.note,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt.toISOString(),
  }
}

export async function buyInRequestRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /ledgers/:id/buy-in-requests
  // ──────────────────────────────────────────────────────────
  app.post(
    '/ledgers/:id/buy-in-requests',
    { preHandler: [requireAuth(), ledgerAccess({ allowArchived: false })] },
    async (req, reply) => {
      const parsed = createBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '参数不合法' } })
      }
      const playerId = req.membership!.playerId
      if (!playerId) {
        return reply.code(400).send({
          error: { code: 'NO_PLAYER_ROW', message: '当前用户在该账本中没有玩家行（可能已被管理员删除）' },
        })
      }
      const { hands, note } = parsed.data
      const isAdminSelf =
        req.membership!.role === Role.ADMIN && req.membership!.playerId === playerId

      // Transaction: create request; if admin-self, also approve + increment buyIn.
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.buyInRequest.create({
          data: {
            ledgerId: req.ledger!.id,
            playerId,
            requestedById: req.auth!.userId,
            hands,
            note: note ?? null,
            status: isAdminSelf ? ReqStatus.APPROVED : ReqStatus.PENDING,
            decidedById: isAdminSelf ? req.auth!.userId : null,
            decidedAt: isAdminSelf ? new Date() : null,
          },
        })
        if (isAdminSelf) {
          await tx.player.update({
            where: { id: playerId },
            data: { buyInCount: { increment: hands } },
          })
          await emitEvent(tx, req.ledger!.id, LedgerEventType.BUY_IN_DECIDED, {
            requestId: created.id,
            playerId,
            hands,
            status: ReqStatus.APPROVED,
            auto: true,
            by: req.auth!.userId,
          })
        } else {
          await emitEvent(tx, req.ledger!.id, LedgerEventType.BUY_IN_REQUESTED, {
            requestId: created.id,
            playerId,
            hands,
            by: req.auth!.userId,
          })
        }
        return created
      })
      return reply.code(201).send({ request: reqDTO(result) })
    },
  )

  // ──────────────────────────────────────────────────────────
  // GET /ledgers/:id/buy-in-requests?status=
  // ──────────────────────────────────────────────────────────
  app.get(
    '/ledgers/:id/buy-in-requests',
    { preHandler: [requireAuth(), ledgerAccess({ allowArchived: true })] },
    async (req, reply) => {
      const parsedQuery = listQuery.safeParse(req.query)
      const where: any = { ledgerId: req.ledger!.id }
      if (parsedQuery.success && parsedQuery.data.status) {
        where.status = parsedQuery.data.status
      }
      if (req.membership!.role !== Role.ADMIN) {
        where.requestedById = req.auth!.userId
      }
      const rows = await prisma.buyInRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return reply.send({ requests: rows.map(reqDTO) })
    },
  )

  // ──────────────────────────────────────────────────────────
  // POST /buy-in-requests/:rid/approve|reject|cancel
  // (No :id path here — the request row itself carries the ledgerId.)
  // ──────────────────────────────────────────────────────────
  async function loadRequestForAction(rid: string) {
    const row = await prisma.buyInRequest.findUnique({
      where: { id: rid },
      include: {
        ledger: { select: { id: true, status: true } },
      },
    })
    return row
  }

  app.post(
    '/buy-in-requests/:rid/approve',
    { preHandler: [requireAuth()] },
    async (req, reply) => {
      const { rid } = req.params as { rid: string }
      const row = await loadRequestForAction(rid)
      if (!row) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '请求不存在' } })
      }
      if (row.ledger.status === 'ARCHIVED') {
        return reply.code(409).send({ error: { code: 'LEDGER_ARCHIVED', message: '账本已归档' } })
      }
      if (row.status !== ReqStatus.PENDING) {
        return reply.code(409).send({
          error: { code: 'REQUEST_NOT_PENDING', message: '该请求已处理' },
        })
      }
      const membership = await prisma.membership.findUnique({
        where: { userId_ledgerId: { userId: req.auth!.userId, ledgerId: row.ledgerId } },
      })
      if (!membership || membership.role !== Role.ADMIN) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: '仅管理员可审批' } })
      }

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.buyInRequest.update({
          where: { id: rid },
          data: {
            status: ReqStatus.APPROVED,
            decidedById: req.auth!.userId,
            decidedAt: new Date(),
          },
        })
        const player = await tx.player.update({
          where: { id: row.playerId },
          data: { buyInCount: { increment: row.hands } },
        })
        await emitEvent(tx, row.ledgerId, LedgerEventType.BUY_IN_DECIDED, {
          requestId: rid,
          playerId: row.playerId,
          hands: row.hands,
          status: ReqStatus.APPROVED,
          by: req.auth!.userId,
        })
        return { updated, player }
      })

      return reply.send({
        request: reqDTO(result.updated),
        player: {
          id: result.player.id,
          nickname: result.player.nickname,
          buyInCount: result.player.buyInCount,
          chipAmount: result.player.chipAmount,
          order: result.player.order,
          createdAt: result.player.createdAt.toISOString(),
        },
      })
    },
  )

  app.post(
    '/buy-in-requests/:rid/reject',
    { preHandler: [requireAuth()] },
    async (req, reply) => {
      const parsed = rejectBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '参数不合法' } })
      }
      const { rid } = req.params as { rid: string }
      const row = await loadRequestForAction(rid)
      if (!row) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '请求不存在' } })
      }
      if (row.status !== ReqStatus.PENDING) {
        return reply.code(409).send({
          error: { code: 'REQUEST_NOT_PENDING', message: '该请求已处理' },
        })
      }
      const membership = await prisma.membership.findUnique({
        where: { userId_ledgerId: { userId: req.auth!.userId, ledgerId: row.ledgerId } },
      })
      if (!membership || membership.role !== Role.ADMIN) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: '仅管理员可审批' } })
      }
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.buyInRequest.update({
          where: { id: rid },
          data: {
            status: ReqStatus.REJECTED,
            decidedById: req.auth!.userId,
            decidedAt: new Date(),
            rejectReason: parsed.data.reason ?? null,
          },
        })
        await emitEvent(tx, row.ledgerId, LedgerEventType.BUY_IN_DECIDED, {
          requestId: rid,
          playerId: row.playerId,
          hands: row.hands,
          status: ReqStatus.REJECTED,
          reason: parsed.data.reason,
          by: req.auth!.userId,
        })
        return u
      })
      return reply.send({ request: reqDTO(updated) })
    },
  )

  app.post(
    '/buy-in-requests/:rid/cancel',
    { preHandler: [requireAuth()] },
    async (req, reply) => {
      const { rid } = req.params as { rid: string }
      const row = await loadRequestForAction(rid)
      if (!row) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '请求不存在' } })
      }
      if (row.requestedById !== req.auth!.userId) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: '只能取消自己的请求' } })
      }
      if (row.status !== ReqStatus.PENDING) {
        return reply.code(409).send({
          error: { code: 'REQUEST_NOT_PENDING', message: '该请求已处理' },
        })
      }
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.buyInRequest.update({
          where: { id: rid },
          data: {
            status: ReqStatus.CANCELED,
            decidedAt: new Date(),
          },
        })
        await emitEvent(tx, row.ledgerId, LedgerEventType.BUY_IN_DECIDED, {
          requestId: rid,
          playerId: row.playerId,
          hands: row.hands,
          status: ReqStatus.CANCELED,
          by: req.auth!.userId,
        })
        return u
      })
      return reply.send({ request: reqDTO(updated) })
    },
  )
}
