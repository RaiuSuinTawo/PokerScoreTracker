/**
 * ledgerAccess middleware — attaches req.membership / req.role for a :id param.
 * Assumes requireAuth has already run and populated req.auth.
 *
 * On missing ledger → 404 NOT_FOUND
 * On user not in ledger → 403 FORBIDDEN
 */
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { prisma } from '../db.js'
import type { Role } from '../types.js'

declare module 'fastify' {
  interface FastifyRequest {
    ledger?: {
      id: string
      serial: string
      status: string
      archivedAt: Date | null
    }
    membership?: {
      id: string
      role: Role
      playerId: string | null
    }
  }
}

export interface LedgerAccessOptions {
  /** If true, allow through even if status === 'ARCHIVED'. Default false. */
  allowArchived?: boolean
  /** If 'ADMIN', require membership.role === 'ADMIN'. */
  requireRole?: Role
}

export function ledgerAccess(opts: LedgerAccessOptions = {}): preHandlerHookHandler {
  return async function preHandler(req: FastifyRequest, reply: FastifyReply) {
    const params = req.params as { id?: string }
    const ledgerId = params?.id
    if (!ledgerId) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '缺少账本 id' } })
    }
    if (!req.auth) {
      return reply
        .code(401)
        .send({ error: { code: 'UNAUTHENTICATED', message: '未登录' } })
    }
    const [ledger, membership] = await Promise.all([
      prisma.ledger.findUnique({
        where: { id: ledgerId },
        select: { id: true, serial: true, status: true, archivedAt: true },
      }),
      prisma.membership.findUnique({
        where: { userId_ledgerId: { userId: req.auth.userId, ledgerId } },
        select: { id: true, role: true, playerId: true },
      }),
    ])
    if (!ledger) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '账本不存在' } })
    }
    if (!membership) {
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: '无权访问该账本' } })
    }
    if (opts.requireRole && membership.role !== opts.requireRole) {
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: '仅管理员可执行该操作' } })
    }
    if (!opts.allowArchived && ledger.status === 'ARCHIVED') {
      return reply
        .code(409)
        .send({ error: { code: 'LEDGER_ARCHIVED', message: '账本已归档，不可修改' } })
    }
    req.ledger = ledger
    req.membership = { id: membership.id, role: membership.role as Role, playerId: membership.playerId }
  }
}
