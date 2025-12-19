import Fastify from 'fastify';
import dotenv from 'dotenv';
import authPlugin from './plugins/auth';
import rateLimitPlugin from './plugins/rateLimit';
import idempotencyPlugin from './plugins/idempotency';
import authRoutes from './routes/auth';
import lobbiesRoutes from './routes/lobbies';
import coinflipRoutes from './routes/coinflip';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';

dotenv.config();

async function buildServer() {
  const fastify = Fastify({ logger: true });
  await fastify.register(require('@fastify/cors'));
  await fastify.register(rateLimitPlugin);
  await fastify.register(authPlugin);
  await fastify.register(idempotencyPlugin);
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(lobbiesRoutes);
  await fastify.register(coinflipRoutes);
  await fastify.register(adminRoutes);
  return fastify;
}

buildServer()
  .then((server) => {
    const port = parseInt(process.env.PORT || '3001');
    server.listen({ port }, (err, address) => {
      if (err) {
        server.log.error(err);
        process.exit(1);
      }
      server.log.info(`server listening on ${address}`);
    });
  })
  .catch((err) => {
    console.error(err);
  });