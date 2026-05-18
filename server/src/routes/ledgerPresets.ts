/**
 * Ledger Preset CRUD routes.
 *
 * Presets are user-owned templates for creating ledgers quickly.
 * All routes require authentication; ownership is enforced inline.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

const createBody = z.object({
  name: z.string().trim().min(1).max(60),
  title: z.string().trim().max(60).optional(),
  chipValue: z.number().positive().max(1_000_000).optional(),
  chipMultiplier: z.number().positive().max(1_000).optional(),
  autoApprove: z.boolean().optional(),
})

const patchBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  title: z.string().trim().max(60).optional(),
  chipValue: z.number().positive().max(1_000_000).optional(),
  chipMultiplier: z.number().positive().max(1_000).optional(),
  autoApprove: z.boolean().optional(),
})

function presetDTO(p: {
  id: string
  name: string
  title: string
  chipValue: number
  chipMultiplier: number
  autoApprove: boolean
  createdAt: Date
}) {
  return {
    id: p.id,
    name: p.name,
    title: p.title,
    chipValue: p.chipValue,
    chipMultiplier: p.chipMultiplier,
    autoApprove: p.autoApprove,
    createdAt: p.createdAt.toISOString(),
  }
}

export async function ledgerPresetRoutes(app: FastifyInstance) {
  // GET /ledger-presets — list all presets for the current user
  app.get('/ledger-presets', { preHandler: requireAuth() }, async (req, reply) => {
    const rows = await prisma.ledgerPreset.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({ presets: rows.map(presetDTO) })
  })

  // POST /ledger-presets — create a new preset
  app.post('/ledger-presets', { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '参数不合法' } })
    }
    const row = await prisma.ledgerPreset.create({
      data: {
        userId: req.auth!.userId,
        name: parsed.data.name,
        title: parsed.data.title ?? '',
        chipValue: parsed.data.chipValue ?? 200,
        chipMultiplier: parsed.data.chipMultiplier ?? 1,
        autoApprove: parsed.data.autoApprove ?? true,
      },
    })
    return reply.code(201).send({ preset: presetDTO(row) })
  })

  // PATCH /ledger-presets/:pid — update a preset
  app.patch('/ledger-presets/:pid', { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = patchBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: '参数不合法' } })
    }
    const { pid } = req.params as { pid: string }
    const existing = await prisma.ledgerPreset.findUnique({ where: { id: pid } })
    if (!existing || existing.userId !== req.auth!.userId) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '预设不存在' } })
    }
    const row = await prisma.ledgerPreset.update({
      where: { id: pid },
      data: parsed.data,
    })
    return reply.send({ preset: presetDTO(row) })
  })

  // DELETE /ledger-presets/:pid — delete a preset
  app.delete('/ledger-presets/:pid', { preHandler: requireAuth() }, async (req, reply) => {
    const { pid } = req.params as { pid: string }
    const existing = await prisma.ledgerPreset.findUnique({ where: { id: pid } })
    if (!existing || existing.userId !== req.auth!.userId) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '预设不存在' } })
    }
    await prisma.ledgerPreset.delete({ where: { id: pid } })
    return reply.code(204).send()
  })
}
