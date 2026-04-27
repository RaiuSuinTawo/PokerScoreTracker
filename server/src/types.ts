/**
 * String-based "enums" backing SQLite-friendly columns.
 * SQLite has no native enum; keep values matching the comments in schema.prisma.
 */

export const LedgerStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const
export type LedgerStatus = (typeof LedgerStatus)[keyof typeof LedgerStatus]

export const Role = {
  ADMIN: 'ADMIN',
  PLAYER: 'PLAYER',
} as const
export type Role = (typeof Role)[keyof typeof Role]

export const ReqStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELED: 'CANCELED',
} as const
export type ReqStatus = (typeof ReqStatus)[keyof typeof ReqStatus]

export const LedgerEventType = {
  BUY_IN_REQUESTED: 'BUY_IN_REQUESTED',
  BUY_IN_DECIDED: 'BUY_IN_DECIDED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_UPDATED: 'PLAYER_UPDATED',
  EXPENSE_CHANGED: 'EXPENSE_CHANGED',
  LEDGER_UPDATED: 'LEDGER_UPDATED',
  LEDGER_ARCHIVED: 'LEDGER_ARCHIVED',
} as const
export type LedgerEventType = (typeof LedgerEventType)[keyof typeof LedgerEventType]
