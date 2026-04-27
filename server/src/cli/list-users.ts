/**
 * Admin CLI: list-users
 *   npm run admin:list-users
 */
import 'dotenv/config'
import { prisma } from '../db.js'

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      displayName: true,
      mustChangePwd: true,
      disabled: true,
      createdAt: true,
    },
  })
  if (users.length === 0) {
    console.log('(no users)')
    return
  }
  for (const u of users) {
    console.log(
      [
        u.id.padEnd(28),
        u.username.padEnd(20),
        u.displayName.padEnd(20),
        `mustChange=${u.mustChangePwd}`.padEnd(20),
        `disabled=${u.disabled}`.padEnd(16),
        u.createdAt.toISOString(),
      ].join('  '),
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
