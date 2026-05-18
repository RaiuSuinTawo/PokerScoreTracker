import { PrismaClient } from '@prisma/client'

// Reuse a single Prisma client across module reloads in dev (tsx watch).
const g = globalThis as unknown as { __prisma?: PrismaClient }

export const prisma =
  g.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  g.__prisma = prisma
}

/**
 * Warm the connection pool at startup.
 * Call this before app.listen() so the first real request doesn't eat a cold-start penalty.
 * Also validates that the DATABASE_URL is reachable.
 */
export async function connectDB(): Promise<void> {
  await prisma.$connect()
}

/**
 * Lightweight DB ping — validates the pool has at least one live connection.
 * Use in health checks and keep-alive probes.
 */
export async function pingDB(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

/**
 * Keep-alive interval: periodically pings the DB to prevent MySQL from
 * killing idle connections (MySQL default wait_timeout = 28800s / 8h;
 * cloud providers may set it as low as 300s).
 *
 * Call startKeepAlive() after connectDB() in server boot.
 */
let keepAliveTimer: ReturnType<typeof setInterval> | null = null

export function startKeepAlive(intervalMs = 60_000): void {
  if (keepAliveTimer) return
  keepAliveTimer = setInterval(() => {
    prisma.$queryRaw`SELECT 1`.catch((err) => {
      console.warn('[db] keep-alive ping failed, pool will reconnect on next query', err?.message)
    })
  }, intervalMs)
  // Unref so it doesn't keep the process alive during graceful shutdown
  if (keepAliveTimer && typeof keepAliveTimer === 'object' && 'unref' in keepAliveTimer) {
    keepAliveTimer.unref()
  }
}

export function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}
