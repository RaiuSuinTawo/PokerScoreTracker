import argon2 from 'argon2'

const memoryCost = Number(process.env.ARGON_MEMORY ?? 65536)
const timeCost = Number(process.env.ARGON_TIME ?? 3)
const parallelism = Number(process.env.ARGON_PARALLELISM ?? 1)

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost,
    timeCost,
    parallelism,
  })
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}
