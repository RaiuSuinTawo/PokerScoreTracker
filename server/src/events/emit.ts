/**
 * Small helper to write LedgerEvent rows.
 * See EXPANSION_PLAN.md §6.5.
 *
 * Every mutation in ledger scope should emit an event so the poll-based
 * clients know something changed.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import type { LedgerEventType } from '../types.js'

type Tx = PrismaClient | Prisma.TransactionClient

export async function emitEvent(
  tx: Tx,
  ledgerId: string,
  type: LedgerEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await tx.ledgerEvent.create({
    data: {
      ledgerId,
      type,
      payload: JSON.stringify(payload),
    },
  })
}
