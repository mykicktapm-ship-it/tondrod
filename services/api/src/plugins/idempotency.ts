import { FastifyPluginAsync } from 'fastify';

/**
 * Idempotency plugin.
 *
 * This plugin extracts an `Idempotency-Key` header from incoming
 * requests and stores it on the request object. Downstream route
 * handlers can use this to ensure idempotent behaviour when creating
 * resources or processing payments. In a real implementation you
 * would check a datastore to see if a request with the same key has
 * already been processed and respond with the cached result.
 */
const idempotencyPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('idempotencyKey', null);
  fastify.addHook('onRequest', async (request) => {
    const key = request.headers['idempotency-key'];
    if (typeof key === 'string') {
      // eslint-disable-next-line no-param-reassign
      request.idempotencyKey = key;
    }
  });
};

export default idempotencyPlugin;

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string | null;
  }
}