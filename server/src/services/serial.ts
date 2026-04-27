/**
 * Crockford base32 serial generator for ledgers.
 * See EXPANSION_PLAN.md §5 (serial generation).
 *
 * Alphabet excludes I L O U to avoid read-aloud ambiguity.
 * Length 8 → 32^8 ≈ 1.1e12 possible values; collisions negligible.
 */
import crypto from 'node:crypto'
import { prisma } from '../db.js'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const LENGTH = 8
const MAX_RETRIES = 5

/** Generate one candidate serial. */
export function generateSerialCandidate(): string {
  const bytes = crypto.randomBytes(5) // 40 bits, enough for 8 base32 chars
  // Pack 5 bytes into a BigInt, then peel 8 x 5-bit chunks.
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ''
  for (let i = 0; i < LENGTH; i++) {
    const idx = Number(n & 31n)
    out = ALPHABET[idx] + out
    n = n >> 5n
  }
  return out
}

/**
 * Generate a unique serial. Retries up to MAX_RETRIES on collision.
 * Throws on astronomical collision streak (extremely unlikely).
 */
export async function generateUniqueSerial(): Promise<string> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const candidate = generateSerialCandidate()
    const existing = await prisma.ledger.findUnique({ where: { serial: candidate } })
    if (!existing) return candidate
  }
  throw new Error('SERIAL_GENERATION_FAILED')
}

/**
 * Normalize a user-entered serial: strip whitespace, uppercase,
 * map ambiguous characters to their Crockford canonical form.
 */
export function normalizeSerial(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
}

export function isValidSerial(s: string): boolean {
  if (s.length !== LENGTH) return false
  for (const ch of s) {
    if (!ALPHABET.includes(ch)) return false
  }
  return true
}
