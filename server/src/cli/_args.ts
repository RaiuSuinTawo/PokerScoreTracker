/**
 * Minimal argv parser for CLI scripts — no external dep.
 * Supports: --key value, --key=value, --flag (boolean true).
 */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (!tok.startsWith('--')) continue
    const eq = tok.indexOf('=')
    if (eq >= 0) {
      out[tok.slice(2, eq)] = tok.slice(eq + 1)
    } else {
      const key = tok.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = true
      }
    }
  }
  return out
}

export function requireArg(args: Record<string, string | boolean>, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || !v) {
    console.error(`missing required argument: --${key}`)
    process.exit(1)
  }
  return v
}
