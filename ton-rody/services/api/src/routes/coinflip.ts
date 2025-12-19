import { FastifyPluginAsync } from 'fastify';
import coinflipService from '../services/coinflipService';

/**
 * CoinFlip routes
 */
const coinflipRoutes: FastifyPluginAsync = async (fastify) => {
  // list
  fastify.get('/v1/coinflip', async () => {
    return await coinflipService.listCoinFlips();
  });
  // create
  fastify.post('/v1/coinflip', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as any;
    const userId = (request.user as any).sub as string;
    const { stakeNano, joinDeadline, revealDeadline, feeBps, feeRecipient } = body;
    if (
      stakeNano === undefined ||
      !joinDeadline ||
      !revealDeadline ||
      feeBps === undefined ||
      !feeRecipient
    ) {
      return reply.code(400).send({ error: 'missing params' });
    }
    const result = await coinflipService.createCoinFlip({
      createdByUserId: userId,
      stakeNano: BigInt(stakeNano),
      joinDeadline: new Date(joinDeadline),
      revealDeadline: new Date(revealDeadline),
      feeBps: Number(feeBps),
      feeRecipient,
    });
    return result;
  });
  // get
  fastify.get('/v1/coinflip/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const flip = await coinflipService.getCoinFlip(id);
    if (!flip) return reply.code(404).send({ error: 'not found' });
    return flip;
  });
  // join
  fastify.post('/v1/coinflip/:id/join', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { commitHash } = request.body as { commitHash?: string };
    if (!commitHash) return reply.code(400).send({ error: 'commitHash required' });
    try {
      const userId = (request.user as any).sub as string;
      const result = await coinflipService.joinCoinFlip(userId, id, commitHash);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });
  // reveal
  fastify.post('/v1/coinflip/:id/reveal', { preValidation: [fastify.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any).sub as string;
    const result = await coinflipService.revealCoinFlip(userId, id);
    return result;
  });
  // finalize
  fastify.post('/v1/coinflip/:id/finalize', async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any)?.sub as string;
    const result = await coinflipService.finalizeCoinFlip(userId ?? '', id);
    return result;
  });
  // refund
  fastify.post('/v1/coinflip/:id/refund', { preValidation: [fastify.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any).sub as string;
    const result = await coinflipService.refundCoinFlip(userId, id);
    return result;
  });
  // proof
  fastify.get('/v1/coinflip/:id/proof', async (request, reply) => {
    const { id } = request.params as { id: string };
    const proof = await coinflipService.proofCoinFlip(id);
    if (!proof) return reply.code(404).send({ error: 'not found' });
    return proof;
  });
};

export default coinflipRoutes;