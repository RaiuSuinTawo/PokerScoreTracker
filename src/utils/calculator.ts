import type { Player, ExpenseAllocation } from '@/types'

/**
 * Profit = remaining chips - (buyInCount * chipValue)
 */
export function calcPlayerProfit(player: Player, chipValue: number): number {
  return player.chipAmount - player.buyInCount * chipValue
}

/**
 * Distribute total shared expense among profitable players,
 * proportional to each player's profit.
 *
 * Only players with rawProfit > 0 pay.
 * Rounding residual is assigned to the biggest winner.
 */
export function calcExpenseAllocations(
  players: Player[],
  chipValue: number,
  totalExpense: number
): ExpenseAllocation[] {
  if (totalExpense <= 0) return []

  const profitablePlayers = players
    .map(p => ({
      player: p,
      rawProfit: calcPlayerProfit(p, chipValue)
    }))
    .filter(x => x.rawProfit > 0)

  if (profitablePlayers.length === 0) return []

  const totalProfit = profitablePlayers.reduce((s, x) => s + x.rawProfit, 0)

  const allocations: ExpenseAllocation[] = profitablePlayers.map(({ player, rawProfit }) => {
    const share = Math.round((rawProfit / totalProfit) * totalExpense * 100) / 100
    return {
      playerId: player.id,
      playerNickname: player.nickname,
      originalProfit: rawProfit,
      expenseShare: share,
      adjustedProfit: rawProfit - share
    }
  })

  // Fix rounding residual
  const allocatedTotal = allocations.reduce((s, a) => s + a.expenseShare, 0)
  const residual = Math.round((totalExpense - allocatedTotal) * 100) / 100
  if (residual !== 0) {
    const biggest = allocations.reduce((max, a) =>
      a.originalProfit > max.originalProfit ? a : max
    )
    biggest.expenseShare = Math.round((biggest.expenseShare + residual) * 100) / 100
    biggest.adjustedProfit = biggest.originalProfit - biggest.expenseShare
  }

  return allocations
}

/** Sum of all positive values */
export function calcTotalUp(finalProfits: number[]): number {
  return finalProfits.filter(p => p > 0).reduce((s, p) => s + p, 0)
}

/** Sum of all negative values (returns negative) */
export function calcTotalDown(finalProfits: number[]): number {
  return finalProfits.filter(p => p < 0).reduce((s, p) => s + p, 0)
}
