/**
 * Seed script: ensures a bootstrap admin account exists.
 * Re-runnable: if user exists, does nothing (no password reset here — use admin:reset-password CLI).
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/auth/password.js'

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_INITIAL_PASSWORD
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? 'Root'

  if (!username || !password) {
    console.error('[seed] ADMIN_USERNAME and ADMIN_INITIAL_PASSWORD must be set in .env')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    console.log(`[seed] user "${username}" already exists, skipping.`)
    return
  }

  const passwordHash = await hashPassword(password)
  await prisma.user.create({
    data: {
      username,
      passwordHash,
      displayName,
      mustChangePwd: true,
      disabled: false,
    },
  })
  console.log(`[seed] created initial admin user "${username}" (mustChangePwd=true)`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
