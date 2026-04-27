/**
 * Adaptive poller.
 * See EXPANSION_PLAN.md §4.3 / §6.5.
 *
 * - Runs `fn()` every `baseIntervalMs` (default 5s).
 * - After `emptyToBackoff` consecutive empty returns (fn returns false or 0),
 *   backs off to `maxIntervalMs` (default 10s).
 * - `kick()` resets interval immediately (call after any user mutation).
 * - Stop on `stop()`; start on `start()`.
 * - onHide/onShow pauses handled by the page, not this util.
 */

export interface PollerOptions {
  baseIntervalMs?: number
  maxIntervalMs?: number
  emptyToBackoff?: number
  /** Return a boolean (true = had activity) or number (>0 = had activity) to drive backoff. */
  fn: () => Promise<boolean | number | void>
  onError?: (err: unknown) => void
}

export interface Poller {
  start(): void
  stop(): void
  kick(): void
  isRunning(): boolean
}

export function createPoller(opts: PollerOptions): Poller {
  const base = opts.baseIntervalMs ?? 5000
  const max = opts.maxIntervalMs ?? 10000
  const threshold = opts.emptyToBackoff ?? 5

  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let currentDelay = base
  let emptyStreak = 0
  let inflight = false

  async function tick() {
    timer = null
    if (!running || inflight) {
      schedule()
      return
    }
    inflight = true
    try {
      const r = await opts.fn()
      const hadActivity =
        typeof r === 'number' ? r > 0 : typeof r === 'boolean' ? r : false
      if (hadActivity) {
        emptyStreak = 0
        currentDelay = base
      } else {
        emptyStreak += 1
        if (emptyStreak >= threshold) currentDelay = max
      }
    } catch (err) {
      opts.onError?.(err)
    } finally {
      inflight = false
      schedule()
    }
  }

  function schedule() {
    if (!running) return
    timer = setTimeout(tick, currentDelay)
  }

  return {
    start() {
      if (running) return
      running = true
      currentDelay = base
      emptyStreak = 0
      schedule()
    },
    stop() {
      running = false
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
    kick() {
      currentDelay = base
      emptyStreak = 0
      if (running) {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        schedule()
      }
    },
    isRunning() {
      return running
    },
  }
}
