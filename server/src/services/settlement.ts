/**
 * Settlement math — the AUTHORITATIVE implementation.
 *
 * Mirrors the client sessionStore.ts `finalProfits` / `totalUp` / `totalDown`
 * computeds (the formula that actually drove the UI before the server era).
 * See EXPANSION_PLAN.md §4.1 and §10.
 *
 * Invariants:
 *  - expenseShare is computed on BASE profit ratios (without chipMultiplier)
 *    and is NOT itself multiplied by chipMultiplier — this matches the client
 *    design decision documented at sessionStore.ts:77 (old code).
 *  - rawProfit displayed = baseProfit * chipMultiplier, rounded 2 decimals.
 *  - finalProfit = rawProfit - expenseShare, rounded 2 decimals.
 *  - totalUp = sum of positive BASE profits * chipMultiplier (display).
 *  - totalDown = sum of negative BASE profits * chipMultiplier (display, negative).
 *  - balanceDiff = totalUp + totalDown (ideally 0).
 *  - isBalanced = |balanceDiff| < 0.01.
 */

export interface SettlementPlayerInput {
  id: string
  nickname: string
  buyInCount: number
  chipAmount: number
}

export interface PerPlayerSettlement {
  playerId: string
  nickname: string
  rawProfit: number // multiplier applied, 2 decimals
  expenseShare: number // NOT multiplied, 2 decimals
  finalProfit: number // rawProfit - expenseShare, 2 decimals
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

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

export function computeSettlement(
  players: SettlementPlayerInput[],
  expenses: { amount: number }[],
  chipValue: number,
  chipMultiplier: number,
): Settlement {
  const multiplier = chipMultiplier
  const totalSharedExpense = round2(expenses.reduce((s, e) => s + e.amount, 0))

  // Base profits (no multiplier applied yet).
  const bases = players.map((p) => ({
    player: p,
    baseProfit: p.chipAmount - p.buyInCount * chipValue,
  }))

  const totalUpBase = bases.filter((b) => b.baseProfit > 0).reduce((s, b) => s + b.baseProfit, 0)
  const totalDownBase = bases.filter((b) => b.baseProfit < 0).reduce((s, b) => s + b.baseProfit, 0)

  const perPlayer: PerPlayerSettlement[] = bases.map(({ player, baseProfit }) => {
    const rawProfit = round2(baseProfit * multiplier)
    let expenseShare = 0
    if (baseProfit > 0 && totalUpBase > 0 && totalSharedExpense > 0) {
      expenseShare = round2((totalSharedExpense / totalUpBase) * baseProfit)
    }
    const finalProfit = round2(rawProfit - expenseShare)
    return {
      playerId: player.id,
      nickname: player.nickname,
      rawProfit,
      expenseShare,
      finalProfit,
    }
  })

  const totalUp = round2(totalUpBase * multiplier)
  const totalDown = round2(totalDownBase * multiplier)
  const balanceDiff = round2(totalUp + totalDown)
  const isBalanced = Math.abs(balanceDiff) < 0.01

  return {
    chipValue,
    chipMultiplier,
    totalSharedExpense,
    totalUpBase: round2(totalUpBase),
    totalUp,
    totalDown,
    balanceDiff,
    isBalanced,
    perPlayer,
  }
}
