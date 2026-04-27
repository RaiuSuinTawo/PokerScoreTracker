/**
 * Admin CLI: create-user
 *   npm run admin:create-user -- --username alice --password p1 --display Alice
 */
import 'dotenv/config'
import { prisma } from '../db.js'
import { hashPassword } from '../auth/password.js'
import { parseArgs, requireArg } from './_args.js'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const username = requireArg(args, 'username')
  const password = requireArg(args, 'password')
  const display = (args.display as string) ?? username

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    console.error(`user "${username}" already exists (id=${existing.id})`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      displayName: display,
      mustChangePwd: true,
      disabled: false,
    },
  })
  console.log(
    `created user "${user.username}" id=${user.id} (mustChangePwd=true; they must change password on first login)`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
