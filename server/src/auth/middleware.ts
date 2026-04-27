/**
 * Fastify preHandler to enforce auth.
 *
 * Behaviour (see Plan §4.2):
 *  - No / malformed Authorization header → 401 { code: 'UNAUTHENTICATED' }
 *  - Expired JWT → 401 { code: 'TOKEN_EXPIRED' }  (client will attempt refresh)
 *  - Invalid JWT → 401 { code: 'TOKEN_INVALID' }
 *  - User disabled → 403 { code: 'USER_DISABLED' }
 *  - User.mustChangePwd=true → 409 { code: 'MUST_CHANGE_PASSWORD' }
 *    EXCEPT: routes tagged with `allowMustChangePwd = true` (e.g. change-password, me, logout)
 */
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { verifyAccessToken } from './jwt.js'
import { prisma } from '../db.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      userId: string
      username: string
      mustChangePwd: boolean
      displayName: string
    }
  }
}

export interface RequireAuthOptions {
  /** If true, allow request through even if user.mustChangePwd === true. */
  allowMustChangePwd?: boolean
}

export function requireAuth(opts: RequireAuthOptions = {}): preHandlerHookHandler {
  return async function preHandler(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: '未登录' },
      })
    }
    const token = header.slice('Bearer '.length).trim()
    let payload
    try {
      payload = verifyAccessToken(token)
    } catch (err: any) {
      const isExpired = err?.name === 'TokenExpiredError'
      return reply.code(401).send({
        error: {
          code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
          message: isExpired ? '令牌已过期' : '令牌无效',
        },
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        displayName: true,
        mustChangePwd: true,
        disabled: true,
      },
    })
    if (!user) {
      return reply.code(401).send({
        error: { code: 'TOKEN_INVALID', message: '账号不存在' },
      })
    }
    if (user.disabled) {
      return reply.code(403).send({
        error: { code: 'USER_DISABLED', message: '账号已禁用' },
      })
    }
    if (user.mustChangePwd && !opts.allowMustChangePwd) {
      return reply.code(409).send({
        error: { code: 'MUST_CHANGE_PASSWORD', message: '首次登录必须修改初始密码' },
      })
    }

    req.auth = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      mustChangePwd: user.mustChangePwd,
    }
  }
}
