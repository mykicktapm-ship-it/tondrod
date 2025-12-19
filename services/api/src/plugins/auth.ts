import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt, { FastifyJWTOptions } from '@fastify/jwt';
import prisma from '../db/prisma';

/**
 * Auth plugin
 *
 * Registers JWT support and decorates the Fastify instance with an
 * `authenticate` function that can be used in `preValidation` to
 * protect routes. Expects the JWT secret to be provided via
 * `JWT_SECRET` environment variable. If not provided, a default
 * insecure secret is used (suitable only for development).
 */
const authPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.JWT_SECRET || 'insecure_dev_secret';
  const jwtOptions: FastifyJWTOptions = {
    secret,
  };
  await fastify.register(fastifyJwt, jwtOptions);

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Decorate reply with a helper to sign tokens
  fastify.decorateReply('signUser', function (user: { id: string; telegramId?: bigint; username?: string }) {
    return this.jwtSign({
      sub: user.id,
      telegramId: user.telegramId?.toString(),
      username: user.username,
    });
  });
};

export default authPlugin;

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyReply {
    signUser: (user: { id: string; telegramId?: bigint; username?: string }) => string;
  }
}