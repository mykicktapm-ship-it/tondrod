import { FastifyPluginAsync } from 'fastify';
import prisma from '../db/prisma';
import lobbyService from '../services/lobbyService';

/**
 * Lobby routes
 */
const lobbiesRoutes: FastifyPluginAsync = async (fastify) => {
  // list lobbies
  fastify.get('/v1/lobbies', async () => {
    return await lobbyService.listLobbies();
  });

  // create lobby
  fastify.post('/v1/lobbies', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as any;
    const userId = (request.user as any).sub as string;
    // validate required params
    const {
      stakeNano,
      maxPlayers,
      minPlayersToRun,
      joinDeadline,
      revealDeadline,
      feeBps,
      feeRecipient,
    } = body;
    if (
      stakeNano === undefined ||
      maxPlayers === undefined ||
      minPlayersToRun === undefined ||
      !joinDeadline ||
      !revealDeadline ||
      feeBps === undefined ||
      !feeRecipient
    ) {
      return reply.code(400).send({ error: 'missing params' });
    }
    // convert times to Date
    const joinD = new Date(joinDeadline);
    const revealD = new Date(revealDeadline);
    const result = await lobbyService.createLobby({
      createdByUserId: userId,
      stakeNano: BigInt(stakeNano),
      maxPlayers: Number(maxPlayers),
      minPlayersToRun: Number(minPlayersToRun),
      joinDeadline: joinD,
      revealDeadline: revealD,
      feeBps: Number(feeBps),
      feeRecipient,
    });
    return result;
  });

  // get lobby
  fastify.get('/v1/lobbies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const lobby = await lobbyService.getLobby(id);
    if (!lobby) return reply.code(404).send({ error: 'not found' });
    return lobby;
  });

  // join lobby
  fastify.post('/v1/lobbies/:id/join', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { commitHash } = request.body as { commitHash?: string };
    if (!commitHash) return reply.code(400).send({ error: 'commitHash required' });
    try {
      const userId = (request.user as any).sub as string;
      const result = await lobbyService.joinLobby(userId, id, commitHash);
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // reveal lobby
  fastify.post('/v1/lobbies/:id/reveal', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any).sub as string;
    const result = await lobbyService.revealLobby(userId, id);
    return result;
  });

  // lock lobby
  fastify.post('/v1/lobbies/:id/lock', async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any)?.sub as string;
    const result = await lobbyService.lockLobby(userId ?? '', id);
    return result;
  });

  // finalize lobby
  fastify.post('/v1/lobbies/:id/finalize', async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any)?.sub as string;
    const result = await lobbyService.finalizeLobby(userId ?? '', id);
    return result;
  });

  // refund lobby
  fastify.post('/v1/lobbies/:id/refund', { preValidation: [fastify.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as any).sub as string;
    const result = await lobbyService.refundLobby(userId, id);
    return result;
  });

  // proof
  fastify.get('/v1/lobbies/:id/proof', async (request, reply) => {
    const { id } = request.params as { id: string };
    const proof = await lobbyService.proofLobby(id);
    if (!proof) return reply.code(404).send({ error: 'not found' });
    return proof;
  });
};

export default lobbiesRoutes;