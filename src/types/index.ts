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
 * Final profit info per player (used by UI).
 */
export interface FinalProfitInfo {
  playerId: string
  nickname: string
  rawProfit: number
  expenseShare: number
  finalProfit: number
}
