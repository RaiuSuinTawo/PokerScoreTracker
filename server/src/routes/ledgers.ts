/**
 * Ledger CRUD routes.
 * See EXPANSION_PLAN.md §6.2.
 *
 * Phase 3 scope: list / create / join / getOne / patch / delete.
 * Archive & settlement endpoints arrive in later phases.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'
import { ledgerAccess } from '../middleware/ledgerAccess.js'
import { generateUniqueSerial, isValidSerial, normalizeSerial } from '../services/serial.js'
import { computeSettlement } from '../services/settlement.js'
import { emitEvent } from '../events/emit.js'
import { LedgerEventType, LedgerStatus, Role } from '../types.js'

const createBody = z.object({
  title: z.string().trim().min(1).max(60),
})

const joinBody = z.object({
  serial: z.string().min(1).max(32),
})

const patchBody = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  chipValue: z.number().positive().max(1_000_000).optional(),
  chipMultiplier: z.number().positive().max(1_000).optional(),
})

type LedgerSummary = {
  id: string
  serial: string
  title: string
  status: string
  role: string
  playerCount: number
  chipValue: number
  chipMultiplier: number
  createdAt: string
  archivedAt: string | null
  updatedAt: string
}

async function buildSummaries(userId: string): Promise<{
  active: LedgerSummary[]
  archived: LedgerSummary[]
}> {
  const rows = await prisma.membership.findMany({
    where: { userId },
    include: {
      ledger: {
        include: {
          _count: { select: { players: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })
  const active: LedgerSummary[] = []
  const archived: LedgerSummary[] = []
  for (const m of rows) {
    const l = m.ledger
    const summary: LedgerSummary = {
      id: l.id,
      serial: l.serial,
      title: l.title,
      status: l.status,
      role: m.role,
      playerCount: l._count.players,
      chipValue: l.chipValue,
      chipMultiplier: l.chipMultiplier,
      createdAt: l.createdAt.toISOString(),
      archivedAt: l.archivedAt ? l.archivedAt.toISOString() : null,
      updatedAt: l.createdAt.toISOString(),
    }
    if (l.status === LedgerStatus.ARCHIVED) archived.push(summary)
    else active.push(summary)
  }
  return { active, archived }
}

async function fetchFullLedger(ledgerId: string, userId: string) {
  const ledger = await prisma.ledger.findUnique({
    where: { id: ledgerId },
    include: {
      players: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      expenses: { orderBy: { createdAt: 'asc' } },
      memberships: {
        select: {
          id: true,
          userId: true,
          role: true,
          playerId: true,
          joinedAt: true,
          user: { select: { username: true, displayName: true } },
        },
      },
    },
  })
  if (!ledger) return null
  const me = ledger.memberships.find((m) => m.userId === userId)
  return {
    id: ledger.id,
    serial: ledger.serial,
    title: ledger.title,
    status: ledger.status,
    chipValue: ledger.chipValue,
    chipMultiplier: ledger.chipMultiplier,
    createdAt: ledger.createdAt.toISOString(),
    archivedAt: ledger.archivedAt ? ledger.archivedAt.toISOString() : null,
    createdById: ledger.createdById,
    players: ledger.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      buyInCount: p.buyInCount,
      chipAmount: p.chipAmount,
      order: p.order,
      createdAt: p.createdAt.toISOString(),
    })),
    expenses: ledger.expenses.map((e) => ({
      id: e.id,
      label: e.label,
      amount: e.amount,
      createdAt: e.createdAt.toISOString(),
    })),
    memberships: ledger.memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.displayName,
      role: m.role,
      playerId: m.playerId,
      joinedAt: m.joinedAt.toISOString(),
    })),
    me: me
      ? {
          membershipId: me.id,
          role: me.role,
          playerId: me.playerId,
        }
      : null,
  }
}

export async function ledgerRoutes(app: FastifyInstance) {
  // GET /ledgers — list summaries
  app.get('/ledgers', { preHandler: requireAuth() }, async (req, reply) => {
    const data = await buildSummaries(req.auth!.userId)
    return reply.send(data)
  })

  // POST /ledgers — create new ledger; creator auto-admin + auto-player (D1)
  app.post('/ledgers', { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '账本名称不合法' } })
    }
    const userId = req.auth!.userId
    const displayName = req.auth!.displayName

    const serial = await generateUniqueSerial()

    const ledger = await prisma.$transaction(async (tx) => {
      const l = await tx.ledger.create({
        data: {
          title: parsed.data.title,
          serial,
          createdById: userId,
          status: LedgerStatus.ACTIVE,
        },
      })
      const player = await tx.player.create({
        data: {
          ledgerId: l.id,
          nickname: displayName,
          buyInCount: 0,
          chipAmount: 0,
          order: 0,
        },
      })
      await tx.membership.create({
        data: {
          userId,
          ledgerId: l.id,
          role: Role.ADMIN,
          playerId: player.id,
        },
      })
      return l
    })

    const full = await fetchFullLedger(ledger.id, userId)
    return reply.code(201).send({ ledger: full })
  })

  // POST /ledgers/join — join by serial; auto-creates Player with 0 buy-ins
  app.post('/ledgers/join', { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = joinBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '序列号不合法' } })
    }
    const serial = normalizeSerial(parsed.data.serial)
    if (!isValidSerial(serial)) {
      return reply
        .code(400)
        .send({ error: { code: 'BAD_SERIAL', message: '序列号格式错误' } })
    }
    const userId = req.auth!.userId
    const displayName = req.auth!.displayName

    const ledger = await prisma.ledger.findUnique({ where: { serial } })
    if (!ledger) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '账本不存在' } })
    }
    if (ledger.status === LedgerStatus.ARCHIVED) {
      return reply.code(409).send({
        error: { code: 'LEDGER_ARCHIVED', message: '账本已归档，不可加入' },
      })
    }
    const existing = await prisma.membership.findUnique({
      where: { userId_ledgerId: { userId, ledgerId: ledger.id } },
    })
    if (existing) {
      // idempotent: already a member → just return the ledger
      const full = await fetchFullLedger(ledger.id, userId)
      return reply.send({ ledger: full })
    }

    await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          ledgerId: ledger.id,
          nickname: displayName,
          buyInCount: 0,
          chipAmount: 0,
          order: (await tx.player.count({ where: { ledgerId: ledger.id } })) + 0,
        },
      })
      await tx.membership.create({
        data: {
          userId,
          ledgerId: ledger.id,
          role: Role.PLAYER,
          playerId: player.id,
        },
      })
    })

    const full = await fetchFullLedger(ledger.id, userId)
    return reply.send({ ledger: full })
  })

  // GET /ledgers/:id — full ledger; archived allowed for read-only view
  app.get(
    '/ledgers/:id',
    { preHandler: [requireAuth(), ledgerAccess({ allowArchived: true })] },
    async (req, reply) => {
      const full = await fetchFullLedger(req.ledger!.id, req.auth!.userId)
      return reply.send({ ledger: full })
    },
  )

  // PATCH /ledgers/:id — admin only, non-archived
  app.patch(
    '/ledgers/:id',
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
      await prisma.ledger.update({
        where: { id: req.ledger!.id },
        data: parsed.data,
      })
      const full = await fetchFullLedger(req.ledger!.id, req.auth!.userId)
      return reply.send({ ledger: full })
    },
  )

  // DELETE /ledgers/:id — admin only; archived ledgers CAN be deleted too
  app.delete(
    '/ledgers/:id',
    {
      preHandler: [
        requireAuth(),
        ledgerAccess({ allowArchived: true, requireRole: Role.ADMIN }),
      ],
    },
    async (req, reply) => {
      await prisma.ledger.delete({ where: { id: req.ledger!.id } })
      return reply.code(204).send()
    },
  )

  // POST /ledgers/:id/archive — admin only; rejects if unbalanced.
  app.post(
    '/ledgers/:id/archive',
    {
      preHandler: [
        requireAuth(),
        ledgerAccess({ allowArchived: false, requireRole: Role.ADMIN }),
      ],
    },
    async (req, reply) => {
      const ledgerId = req.ledger!.id
      const [ledgerRow, players, expenses] = await Promise.all([
        prisma.ledger.findUnique({
          where: { id: ledgerId },
          select: { chipValue: true, chipMultiplier: true },
        }),
        prisma.player.findMany({
          where: { ledgerId },
          select: { id: true, nickname: true, buyInCount: true, chipAmount: true },
        }),
        prisma.sharedExpense.findMany({
          where: { ledgerId },
          select: { amount: true },
        }),
      ])
      const settlement = computeSettlement(
        players,
        expenses,
        ledgerRow!.chipValue,
        ledgerRow!.chipMultiplier,
      )
      if (!settlement.isBalanced) {
        return reply.code(409).send({
          error: {
            code: 'LEDGER_UNBALANCED',
            message: `账本未平衡（差值 ${settlement.balanceDiff}），无法归档`,
          },
        })
      }
      await prisma.$transaction(async (tx) => {
        await tx.ledger.update({
          where: { id: ledgerId },
          data: { status: LedgerStatus.ARCHIVED, archivedAt: new Date() },
        })
        await emitEvent(tx, ledgerId, LedgerEventType.LEDGER_ARCHIVED, {
          by: req.auth!.userId,
          balanceDiff: settlement.balanceDiff,
        })
      })
      const full = await fetchFullLedger(ledgerId, req.auth!.userId)
      return reply.send({ ledger: full })
    },
  )
}
