import { FastifyPluginAsync } from 'fastify';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { highlights } from '../db/schema.js';
import crypto from 'node:crypto';

export const highlightsRoutes: FastifyPluginAsync = async (fastify) => {
  // Protect all highlight routes
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Get all highlights across sanctuary
  fastify.get('/', async (request) => {
    const { bookmarkId, color } = request.query as { bookmarkId?: string; color?: string };

    const conditions: any[] = [];
    if (bookmarkId) conditions.push(eq(highlights.bookmarkId, bookmarkId));
    if (color) conditions.push(eq(highlights.color, color));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db.query.highlights.findMany({
      where: whereClause,
      orderBy: [desc(highlights.createdAt)],
      with: {
        bookmark: true,
      },
    });

    return items;
  });

  // 2. Add new highlight
  fastify.post('/', async (request, reply) => {
    const body = (request.body as any) || {};
    const { bookmarkId, text, color, note } = body;

    if (!bookmarkId || !text) {
      return reply.code(400).send({ error: 'bookmarkId and text are required' });
    }

    const highlightId = body.id || `hl-${crypto.randomUUID()}`;

    const [created] = await db
      .insert(highlights)
      .values({
        id: highlightId,
        bookmarkId,
        text,
        color: color || 'yellow',
        note: note || null,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // 3. Update highlight note or color
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as any) || {};

    const updateData: any = {};
    if (body.color !== undefined) updateData.color = body.color;
    if (body.note !== undefined) updateData.note = body.note;

    const [updated] = await db
      .update(highlights)
      .set(updateData)
      .where(eq(highlights.id, id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: 'Highlight not found' });
    }

    return updated;
  });

  // 4. Delete highlight
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(highlights)
      .where(eq(highlights.id, id))
      .returning();

    if (!deleted) {
      return reply.code(404).send({ error: 'Highlight not found' });
    }

    return { status: 'deleted', id };
  });
};
