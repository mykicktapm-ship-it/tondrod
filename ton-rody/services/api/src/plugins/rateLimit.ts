import { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/**
 * Rate limiting plugin.
 *
 * Configures fastify-rate-limit with sensible defaults. If you need
 * per-user or per-wallet rate limits, you can override the key
 * generation function in the routes or a higher-level plugin. For
 * example, you might use the telegram ID or wallet address as the
 * key when available. Here we default to the IP address.
 */
const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Use IP address as key. Fastify trusts proxies if `trustProxy` is enabled.
      return request.ip;
    },
    errorResponseBuilder: () => {
      return { error: 'Too Many Requests' };
    },
  });
};

export default rateLimitPlugin;