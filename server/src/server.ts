/**
 * Fastify bootstrap.
 *
 * Loads env, installs CORS, registers routes under /api prefix, installs a
 * centralised error handler that converts thrown errors into the { error: {...} }
 * envelope used by clients.
 */
import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ulid } from 'ulid'
import { authRoutes } from './routes/auth.js'
import { ledgerRoutes } from './routes/ledgers.js'
import { playerRoutes } from './routes/players.js'
import { expenseRoutes } from './routes/expenses.js'
import { eventRoutes } from './routes/events.js'
import { settlementRoutes } from './routes/settlement.js'
import { buyInRequestRoutes } from './routes/buyInRequests.js'
import { profileRoutes } from './routes/profile.js'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    disableRequestLogging: false,
    trustProxy: true,
  })

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true) // same-origin / server-to-server / curl
      if (CORS_ORIGIN.length === 0) return cb(null, true) // permissive in dev if unset
      if (CORS_ORIGIN.includes(origin)) return cb(null, true)
      cb(new Error('CORS blocked'), false)
    },
    credentials: false,
  })

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }))

  await app.register(
    async (scope) => {
      await scope.register(authRoutes)
      await scope.register(ledgerRoutes)
      await scope.register(playerRoutes)
      await scope.register(expenseRoutes)
      await scope.register(eventRoutes)
      await scope.register(settlementRoutes)
      await scope.register(buyInRequestRoutes)
      await scope.register(profileRoutes)
    },
    { prefix: '/api' },
  )

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.url}` },
    })
  })

  app.setErrorHandler((err, req, reply) => {
    const errorId = ulid()
    req.log.error({ err, errorId }, 'unhandled error')
    // Zod / Fastify validation are handled per-route; this catches the rest.
    const status = (err as any).statusCode ?? 500
    if (status >= 500) {
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器错误',
          errorId,
        },
      })
    }
    return reply.code(status).send({
      error: {
        code: (err as any).code ?? 'ERROR',
        message: err.message ?? '请求失败',
        errorId,
      },
    })
  })

  return app
}

async function main() {
  try {
    const app = await buildServer()
    await app.listen({ port: PORT, host: HOST })
    app.log.info({ port: PORT, host: HOST }, 'holdem server listening')
  } catch (err) {
    console.error('server failed to start:', err)
    process.exit(1)
  }
}

// Run only when invoked as entry (not on import).
// Use pathToFileURL to produce a comparable file:// URL that matches import.meta.url on all OSes.
import { pathToFileURL } from 'node:url'
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entry) {
  main()
}
