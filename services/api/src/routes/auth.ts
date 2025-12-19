import { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma';
import telegramAuth from '../services/telegramAuth';
import tonVerify from '../services/tonVerify';

/**
 * Auth routes.
 *
 * Provides endpoints for Telegram initData verification, wallet linking
 * via TON proof, and a simple `me` endpoint to return the current
 * authenticated user's info.
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/auth/telegram
  fastify.post('/v1/auth/telegram', async (request, reply) => {
    const { initData } = request.body as { initData?: string };
    if (!initData) {
      return reply.code(400).send({ error: 'initData required' });
    }
    // validate initData and extract user info
    const tgUser = await telegramAuth.verifyInitData(initData);
    if (!tgUser) {
      return reply.code(401).send({ error: 'Invalid initData' });
    }
    // upsert user in database
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      update: { username: tgUser.username, lastSeen: new Date() },
      create: {
        telegramId: BigInt(tgUser.id),
        username: tgUser.username ?? null,
      },
    });
    const accessToken = reply.signUser({ id: user.id, telegramId: user.telegramId, username: user.username ?? undefined });
    return { accessToken, user: { id: user.id, telegramId: user.telegramId.toString(), username: user.username } };
  });

  // POST /v1/auth/link-wallet
  fastify.post('/v1/auth/link-wallet', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const { tonProof } = request.body as { tonProof?: any };
    if (!tonProof) {
      return reply.code(400).send({ error: 'tonProof required' });
    }
    // verify ton proof and extract wallet address
    const proofResult = await tonVerify.verifyProof(tonProof);
    if (!proofResult || !proofResult.walletAddress) {
      return reply.code(401).send({ error: 'Invalid tonProof' });
    }
    const walletAddress: string = proofResult.walletAddress;
    // link wallet to user (one per user). If existing link belongs to another user, reject.
    const userId = (request.user as any).sub as string;
    const existing = await prisma.walletLink.findFirst({ where: { walletAddress } });
    if (existing && existing.userId !== userId) {
      return reply.code(409).send({ error: 'wallet already linked' });
    }
    await prisma.walletLink.upsert({
      where: { userId },
      update: { walletAddress, lastChangedAt: new Date(), relinkCooldownUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      create: {
        userId,
        walletAddress,
      },
    });
    return { wallet: walletAddress };
  });

  // GET /v1/me
  fastify.get('/v1/me', { preValidation: [fastify.authenticate] }, async (request) => {
    const userId = (request.user as any).sub as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const wallet = await prisma.walletLink.findUnique({ where: { userId } });
    return {
      user: user ? { id: user.id, telegramId: user.telegramId.toString(), username: user.username } : null,
      wallet: wallet ? wallet.walletAddress : null,
    };
  });
};

export default authRoutes;