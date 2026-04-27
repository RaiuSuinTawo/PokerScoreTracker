/**
 * JWT access + opaque refresh token helpers.
 *
 * Access token: JWT HS256, short TTL, claims { sub: userId, username }.
 * Refresh token: opaque 256-bit random string; only its SHA-256 hash is stored.
 */
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { prisma } from '../db.js'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET // reserved for future — currently opaque tokens
const ACCESS_TTL = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900)
const REFRESH_TTL = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2592000)

if (!ACCESS_SECRET || ACCESS_SECRET.length < 32) {
  throw new Error('JWT_ACCESS_SECRET missing or too short (>=32 chars required)')
}
if (!REFRESH_SECRET || REFRESH_SECRET.length < 32) {
  throw new Error('JWT_REFRESH_SECRET missing or too short (>=32 chars required)')
}

export interface AccessPayload {
  sub: string
  username: string
}

export function signAccessToken(user: { id: string; username: string }): string {
  return jwt.sign({ sub: user.id, username: user.username }, ACCESS_SECRET!, {
    expiresIn: ACCESS_TTL,
    algorithm: 'HS256',
  })
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, ACCESS_SECRET!, { algorithms: ['HS256'] }) as jwt.JwtPayload
  if (!decoded.sub || typeof decoded.sub !== 'string' || typeof decoded.username !== 'string') {
    throw new Error('malformed token')
  }
  return { sub: decoded.sub, username: decoded.username }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateRefreshToken()
  const tokenHash = hashRefreshToken(raw)
  const expiresAt = new Date(Date.now() + REFRESH_TTL * 1000)
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  })
  return raw
}

/**
 * Rotate: verify + revoke + issue new. Throws on invalid/expired/revoked.
 * Returns the new refresh token raw value.
 */
export async function rotateRefreshToken(
  rawToken: string,
): Promise<{ userId: string; refresh: string }> {
  const tokenHash = hashRefreshToken(rawToken)
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash } })
  if (!row) throw new Error('REFRESH_INVALID')
  if (row.revokedAt) throw new Error('REFRESH_REVOKED')
  if (row.expiresAt <= new Date()) throw new Error('REFRESH_EXPIRED')

  const newRaw = generateRefreshToken()
  const newHash = hashRefreshToken(newRaw)
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL * 1000)

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: { userId: row.userId, tokenHash: newHash, expiresAt: newExpiresAt },
    }),
  ])

  return { userId: row.userId, refresh: newRaw }
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken)
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export const tokenConfig = {
  accessTtlSeconds: ACCESS_TTL,
  refreshTtlSeconds: REFRESH_TTL,
}
