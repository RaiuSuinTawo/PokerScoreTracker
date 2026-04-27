/**
 * Admin CLI: disable-user (or --enable to re-enable)
 *   npm run admin:disable-user -- --username alice
 *   npm run admin:disable-user -- --username alice --enable
 */
import 'dotenv/config'
import { prisma } from '../db.js'
import { parseArgs, requireArg } from './_args.js'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const username = requireArg(args, 'username')
  const enable = args.enable === true

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    console.error(`user "${username}" not found`)
    process.exit(1)
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { disabled: !enable },
    }),
    // always revoke refresh tokens on state flip
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
  console.log(`${enable ? 'enabled' : 'disabled'} user "${username}"`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
