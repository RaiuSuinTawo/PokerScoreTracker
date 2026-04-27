/**
 * Admin CLI: reset-password
 *   npm run admin:reset-password -- --username alice --password newTemp1234
 * After reset, mustChangePwd is set to true again and all refresh tokens revoked.
 */
import 'dotenv/config'
import { prisma } from '../db.js'
import { hashPassword } from '../auth/password.js'
import { parseArgs, requireArg } from './_args.js'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const username = requireArg(args, 'username')
  const password = requireArg(args, 'password')

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    console.error(`user "${username}" not found`)
    process.exit(1)
  }
  const passwordHash = await hashPassword(password)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePwd: true },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
  console.log(`reset password for "${username}" (mustChangePwd=true; all refresh tokens revoked)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
