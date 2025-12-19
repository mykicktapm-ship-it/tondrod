import { FastifyPluginAsync } from 'fastify';

/**
 * Health check route. Returns a simple JSON object indicating the
 * server is running. Useful for container orchestrators and uptime
 * monitoring services.
 */
const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });
};

export default healthRoutes;