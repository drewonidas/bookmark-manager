import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './routes/auth.routes.js';
import { bookmarksRoutes } from './routes/bookmarks.routes.js';
import { highlightsRoutes } from './routes/highlights.routes.js';
import { statsRoutes } from './routes/stats.routes.js';
import { pool } from './db/index.js';
import { runMigrations } from './db/migrate.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  },
});

async function main() {
  // 1. Sensible defaults & error handling
  await app.register(sensible);

  // 2. CORS configuration for frontend
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 3. API Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Bookmarks Editorial Sanctuary API',
        description: 'REST API backend for Bookmarks management with content extraction & Gemini AI synthesis',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/documentation',
  });

  // 4. Custom Auth plugin
  await app.register(authPlugin);

  // 5. Healthcheck endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'bookmark-manager-backend',
      timestamp: new Date().toISOString(),
    };
  });

  // 6. Register API Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(bookmarksRoutes, { prefix: '/api/bookmarks' });
  await app.register(highlightsRoutes, { prefix: '/api/highlights' });
  await app.register(statsRoutes, { prefix: '/api/stats' });

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, closing server...`);
      await app.close();
      await pool.end();
      process.exit(0);
    });
  }

  // Run database migration check with retry for container startup
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await runMigrations();
      break;
    } catch (dbErr) {
      if (attempt === 5) {
        app.log.warn({ err: dbErr }, 'Database table migration deferred or failed. Verify PostgreSQL is running.');
      } else {
        app.log.info(`Waiting for PostgreSQL (attempt ${attempt}/5)...`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  // Start Server
  try {
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Editorial Sanctuary Backend listening on ${address}`);
    app.log.info(`Swagger docs available at ${address}/documentation`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
