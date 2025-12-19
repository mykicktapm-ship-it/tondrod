import { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma';

/**
 * Admin routes (stub).
 *
 * These routes are protected by an `admin-secret` header for simplicity. In
 * a real implementation you would use proper roles and ACLs. This
 * scaffold provides an overview endpoint and a blocklist manager.
 */
const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Simple auth check: require admin-secret header equals env.ADMIN_SECRET
  fastify.addHook('preValidation', async (request, reply) => {
    const secretHeader = request.headers['admin-secret'];
    if (secretHeader !== process.env.ADMIN_SECRET) {
      reply.code(401).send({ error: 'Admin access required' });
    }
  });
  // Overview
  fastify.get('/v1/admin/overview', async () => {
    const lobbyCount = await prisma.lobby.count();
    const coinflipCount = await prisma.coinFlip.count();
    const pendingPayouts = await prisma.payout.count({ where: { status: 'PENDING' } });
    return { lobbyCount, coinflipCount, pendingPayouts };
  });
  // Add to blocklist
  fastify.post('/v1/admin/blocklist', async (request) => {
    const { type, value, reason } = request.body as { type: string; value: string; reason?: string };
    if (!type || !value) return { error: 'type and value required' };
    const record = await prisma.blockList.upsert({
      where: { value },
      update: { type, reason },
      create: { type, value, reason },
    });
    return record;
  });
  // Remove from blocklist
  fastify.delete('/v1/admin/blocklist/:value', async (request) => {
    const { value } = request.params as { value: string };
    await prisma.blockList.delete({ where: { value } });
    return { deleted: true };
  });
};

export default adminRoutes;