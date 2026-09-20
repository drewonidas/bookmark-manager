import { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Login with master password / auth token
  fastify.post('/login', async (request, reply) => {
    const { password } = (request.body as { password?: string }) || {};

    if (!password) {
      return reply.code(400).send({ error: 'Password or token required' });
    }

    const expectedBuffer = Buffer.from(env.AUTH_TOKEN);
    const providedBuffer = Buffer.from(password);

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return reply.code(401).send({ error: 'Invalid authentication credentials' });
    }

    return {
      status: 'authenticated',
      token: env.AUTH_TOKEN,
    };
  });

  // Verify currently supplied token
  fastify.get('/verify', { preHandler: [fastify.authenticate] }, async () => {
    return {
      status: 'authenticated',
      timestamp: new Date().toISOString(),
    };
  });
};
