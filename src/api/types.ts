/**
 * Shared API types between client and server (duplicated by hand; not imported
 * from server to avoid coupling the uni-app build to server/node tooling).
 *
 * Whenever server shapes change, update here too.
 */

export interface UserPublic {
  id: string
  username: string
  displayName: string
  mustChangePwd: boolean
}

export interface LoginResponse {
  access: string
  refresh: string
  expiresIn: number
  user: UserPublic
}

export interface RefreshResponse {
  access: string
  refresh: string
  expiresIn: number
}

export interface MeResponse {
  user: UserPublic
}

// ---- Domain enums ----
export type LedgerStatus = 'ACTIVE' | 'ARCHIVED'
export type Role = 'ADMIN' | 'PLAYER'
export type ReqStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'

// ---- Ledger DTOs ----
export interface LedgerSummary {
  id: string
  serial: string
  title: string
  status: LedgerStatus
  role: Role
  playerCount: number
  chipValue: number
  chipMultiplier: number
  createdAt: string
  archivedAt: string | null
  updatedAt: string
}

export interface LedgerListResponse {
  active: LedgerSummary[]
  archived: LedgerSummary[]
}

export interface PlayerDTO {
  id: string
  nickname: string
  buyInCount: number
  chipAmount: number
  order: number
  createdAt: string
}

export interface ExpenseDTO {
  id: string
  label: string
  amount: number
  createdAt: string
}

export interface MembershipDTO {
  id: string
  userId: string
  username: string
  displayName: string
  role: Role
  playerId: string | null
  joinedAt: string
}

export interface LedgerFull {
  id: string
  serial: string
  title: string
  status: LedgerStatus
  chipValue: number
  chipMultiplier: number
  createdAt: string
  archivedAt: string | null
  createdById: string
  players: PlayerDTO[]
  expenses: ExpenseDTO[]
  memberships: MembershipDTO[]
  me: {
    membershipId: string
    role: Role
    playerId: string | null
  } | null
}

export interface LedgerResponse {
  ledger: LedgerFull
}

// ---- Settlement ----
export interface PerPlayerSettlement {
  playerId: string
  nickname: string
  rawProfit: number
  expenseShare: number
  finalProfit: number
}

export interface Settlement {
  chipValue: number
  chipMultiplier: number
  totalSharedExpense: number
  totalUpBase: number
  totalUp: number
  totalDown: number
  balanceDiff: number
  isBalanced: boolean
  perPlayer: PerPlayerSettlement[]
}

// ---- Events ----
export type LedgerEventType =
  | 'BUY_IN_REQUESTED'
  | 'BUY_IN_DECIDED'
  | 'PLAYER_JOINED'
  | 'PLAYER_UPDATED'
  | 'EXPENSE_CHANGED'
  | 'LEDGER_UPDATED'
  | 'LEDGER_ARCHIVED'

export interface LedgerEvent {
  id: string
  type: LedgerEventType
  payload: Record<string, any> | null
  createdAt: string
}

export interface EventsResponse {
  events: LedgerEvent[]
  serverTime: string
}

// ---- Buy-in Requests (Phase 5) ----
export interface BuyInRequestDTO {
  id: string
  ledgerId: string
  playerId: string
  requestedById: string
  hands: number
  status: ReqStatus
  decidedById: string | null
  decidedAt: string | null
  note: string | null
  rejectReason: string | null
  createdAt: string
}

// ---- Profile (Phase 7) ----
export interface ProfileLedgerRow {
  id: string
  serial: string
  title: string
  status: LedgerStatus
  role: Role
  archivedAt: string | null
  createdAt: string
  myNet: number | null
}

export interface BankrollPoint {
  at: string
  ledgerId: string
  ledgerTitle: string
  ledgerSerial: string
  perLedgerNet: number
  cumulative: number
}
