/**
 * Auth routes: login, refresh, logout, change-password, me.
 * See Plan §6.1.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  tokenConfig,
} from '../auth/jwt.js'
import { requireAuth } from '../auth/middleware.js'

const loginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
})

const refreshBody = z.object({
  refresh: z.string().min(1),
})

const changePasswordBody = z.object({
  oldPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
})

const registerBody = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(256),
  displayName: z.string().trim().min(1).max(64),
})

function userPublicView(u: {
  id: string
  username: string | null
  displayName: string
  mustChangePwd: boolean
}) {
  return {
    id: u.id,
    username: u.username ?? '',
    displayName: u.displayName,
    mustChangePwd: u.mustChangePwd,
  }
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post('/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: '参数不合法' },
      })
    }
    const { username, password } = parsed.data
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: '账号或密码错误' },
      })
    }
    if (user.disabled) {
      return reply.code(403).send({
        error: { code: 'USER_DISABLED', message: '账号已禁用' },
      })
    }
    if (!user.passwordHash) {
      return reply.code(400).send({
        error: { code: 'NO_PASSWORD', message: '该账号通过微信登录，无密码' },
      })
    }
    const ok = await verifyPassword(user.passwordHash, password)
    if (!ok) {
      return reply.code(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: '账号或密码错误' },
      })
    }
    const access = signAccessToken(user)
    const refresh = await issueRefreshToken(user.id)
    return reply.send({
      access,
      refresh,
      expiresIn: tokenConfig.accessTtlSeconds,
      user: userPublicView(user),
    })
  })

  // POST /auth/refresh
  app.post('/auth/refresh', async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: '参数不合法' },
      })
    }
    try {
      const { userId, refresh } = await rotateRefreshToken(parsed.data.refresh)
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user || user.disabled) {
        return reply.code(401).send({
          error: { code: 'REFRESH_INVALID', message: '刷新令牌无效' },
        })
      }
      const access = signAccessToken(user)
      return reply.send({
        access,
        refresh,
        expiresIn: tokenConfig.accessTtlSeconds,
      })
    } catch (err: any) {
      return reply.code(401).send({
        error: {
          code: err?.message ?? 'REFRESH_INVALID',
          message: '刷新令牌无效或已过期',
        },
      })
    }
  })

  // POST /auth/logout
  app.post('/auth/logout', async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: '参数不合法' },
      })
    }
    await revokeRefreshToken(parsed.data.refresh)
    return reply.code(204).send()
  })

  // GET /auth/me  (allow mustChangePwd so client can fetch current user state)
  app.get(
    '/auth/me',
    { preHandler: requireAuth({ allowMustChangePwd: true }) },
    async (req, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          mustChangePwd: true,
        },
      })
      if (!user) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: '用户不存在' },
        })
      }
      return reply.send({ user })
    },
  )

  // POST /auth/change-password  (allow mustChangePwd so users can unblock themselves)
  app.post(
    '/auth/change-password',
    { preHandler: requireAuth({ allowMustChangePwd: true }) },
    async (req, reply) => {
      const parsed = changePasswordBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'BAD_REQUEST', message: '新密码至少 8 位' },
        })
      }
      const { oldPassword, newPassword } = parsed.data
      if (oldPassword === newPassword) {
        return reply.code(400).send({
          error: { code: 'SAME_PASSWORD', message: '新密码不能与旧密码相同' },
        })
      }
      const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } })
      if (!user) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: '用户不存在' },
        })
      }
      if (!user.passwordHash) {
        return reply.code(400).send({
          error: { code: 'NO_PASSWORD', message: '微信账号不支持密码修改' },
        })
      }
      const ok = await verifyPassword(user.passwordHash, oldPassword)
      if (!ok) {
        return reply.code(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: '原密码错误' },
        })
      }
      const newHash = await hashPassword(newPassword)
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, mustChangePwd: false },
      })
      // Revoke all refresh tokens on password change.
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return reply.code(204).send()
    },
  )

  // POST /auth/wx-login — 微信小程序自动登录（云托管注入 X-WX-OPENID）
  app.post('/auth/wx-login', async (req, reply) => {
    const openid = req.headers['x-wx-openid'] as string | undefined
    if (!openid) {
      return reply.code(400).send({
        error: { code: 'MISSING_OPENID', message: '缺少微信身份信息，请通过小程序访问' },
      })
    }

    let user = await prisma.user.findUnique({ where: { wxOpenid: openid } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          wxOpenid: openid,
          displayName: '微信用户',
          mustChangePwd: false,
        },
      })
    }

    if (user.disabled) {
      return reply.code(403).send({
        error: { code: 'USER_DISABLED', message: '账号已禁用' },
      })
    }

    const access = signAccessToken(user)
    const refresh = await issueRefreshToken(user.id)
    return reply.send({
      access,
      refresh,
      expiresIn: tokenConfig.accessTtlSeconds,
      user: userPublicView(user),
    })
  })

  // POST /auth/register — H5 自由注册
  app.post('/auth/register', async (req, reply) => {
    const parsed = registerBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'BAD_REQUEST', message: '用户名3-32位字母数字下划线，密码至少8位' },
      })
    }
    const { username, password, displayName } = parsed.data

    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) {
      return reply.code(409).send({
        error: { code: 'USERNAME_TAKEN', message: '用户名已被占用' },
      })
    }

    const hash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { username, passwordHash: hash, displayName, mustChangePwd: false },
    })

    const access = signAccessToken(user)
    const refresh = await issueRefreshToken(user.id)
    return reply.code(201).send({
      access,
      refresh,
      expiresIn: tokenConfig.accessTtlSeconds,
      user: userPublicView(user),
    })
  })
}
