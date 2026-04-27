/**
 * A single player seated at the current table.
 */
export interface Player {
  id: string
  nickname: string
  buyInCount: number
  chipAmount: number
  joinedAt: number
}

/**
 * A shared expense line item (room, food, etc.)
 */
export interface SharedExpenseItem {
  id: string
  label: string
  amount: number
}

/**
 * The result of distributing shared expenses to profitable players.
 */
export interface ExpenseAllocation {
  playerId: string
  playerNickname: string
  originalProfit: number
  expenseShare: number
  adjustedProfit: number
}

/**
 * Represents one poker session (one "table").
 */
export interface Session {
  id: string
  createdAt: number
  updatedAt: number
  chipValue: number
  chipMultiplier: number
  players: Player[]
  sharedExpenses: SharedExpenseItem[]
  isSettled: boolean
}

/**
 * Top-level storage shape.
 */
export interface AppData {
  currentSessionId: string | null
  sessions: Session[]
  version: number
}

/**
 * Final profit info per player (used by UI).
 */
export interface FinalProfitInfo {
  playerId: string
  nickname: string
  rawProfit: number
  expenseShare: number
  finalProfit: number
}
