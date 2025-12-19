import prisma from '../db/prisma';
import { v4 as uuidv4 } from 'uuid';

/**
 * Lobby service
 *
 * Provides basic operations for creating and managing lobby raffles. In
 * this MVP implementation, methods do not perform full on-chain
 * interactions; they simply update the database and return stub
 * responses. A production implementation would interact with the
 * TON blockchain, build and sign payloads, and index events.
 */

// Create a new lobby configuration and optionally deploy contract
export async function createLobby(params: {
  createdByUserId: string;
  stakeNano: bigint;
  maxPlayers: number;
  minPlayersToRun: number;
  joinDeadline: Date;
  revealDeadline: Date;
  feeBps: number;
  feeRecipient: string;
}): Promise<{ id: string; contractAddress: string }> {
  // For MVP we store a random UUID as lobby ID and stub address
  const id = uuidv4();
  const contractAddress = `0:${id.replace(/-/g, '').slice(0, 64)}`;
  await prisma.lobby.create({
    data: {
      id,
      contractAddress,
      version: 1,
      stakeNano: BigInt(params.stakeNano.toString()),
      maxPlayers: params.maxPlayers,
      minPlayersToRun: params.minPlayersToRun,
      joinDeadline: params.joinDeadline,
      revealDeadline: params.revealDeadline,
      feeBps: params.feeBps,
      feeRecipient: params.feeRecipient,
      createdByUserId: params.createdByUserId,
    },
  });
  return { id, contractAddress };
}

export async function listLobbies(): Promise<any[]> {
  const lobbies = await prisma.lobby.findMany({});
  return lobbies.map((l) => ({
    id: l.id,
    contractAddress: l.contractAddress,
    stakeNano: l.stakeNano.toString(),
    maxPlayers: l.maxPlayers,
    minPlayersToRun: l.minPlayersToRun,
    joinDeadline: l.joinDeadline,
    revealDeadline: l.revealDeadline,
    feeBps: l.feeBps,
    feeRecipient: l.feeRecipient,
    state: l.state,
  }));
}

export async function getLobby(id: string): Promise<any | null> {
  const lobby = await prisma.lobby.findUnique({ where: { id } });
  if (!lobby) return null;
  const participants = await prisma.lobbyParticipant.findMany({ where: { lobbyId: id } });
  return {
    ...lobby,
    stakeNano: lobby.stakeNano.toString(),
    participants: participants.map((p) => ({
      userId: p.userId,
      walletAddress: p.walletAddress,
      commitHash: p.commitHash,
      joinedAt: p.joinedAt,
      revealedAt: p.revealedAt,
      refunded: p.refunded,
    })),
  };
}

export async function joinLobby(userId: string, lobbyId: string, commitHash: string): Promise<{ tx: any }> {
  // Check that user is not already a participant
  const exists = await prisma.lobbyParticipant.findFirst({ where: { lobbyId, userId } });
  if (exists) throw new Error('duplicate');
  // Insert participant with commit hash.  walletAddress is unknown at this stage, so we reuse commitHash as a placeholder.
  await prisma.lobbyParticipant.create({
    data: {
      lobbyId,
      userId,
      walletAddress: commitHash, // placeholder; real wallet address is handled client side
      commitHash,
    },
  });
  // Return skeleton transaction.  The client will build the actual payload using ton-core.
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function revealLobby(userId: string, lobbyId: string): Promise<{ tx: any }> {
  // Mark participant as revealed by updating revealedAt
  const now = new Date();
  await prisma.lobbyParticipant.updateMany({
    where: { lobbyId, userId, revealedAt: null },
    data: { revealedAt: now },
  });
  // Return skeleton transaction (no payload).  Client will attach seed payload.
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function lockLobby(userId: string, lobbyId: string): Promise<{ tx: any }> {
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function finalizeLobby(userId: string, lobbyId: string): Promise<{ tx: any }> {
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function refundLobby(userId: string, lobbyId: string): Promise<{ tx: any }> {
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function proofLobby(id: string): Promise<any> {
  // Provide stub proof structure. A real implementation would gather commits, reveal flags, seeds and compute final hash.
  const lobby = await prisma.lobby.findUnique({ where: { id } });
  if (!lobby) return null;
  const participants = await prisma.lobbyParticipant.findMany({ where: { lobbyId: id } });
  return {
    lobbyId: id,
    contractAddress: lobby.contractAddress,
    commits: participants.map((p) => p.commitHash),
    revealedFlags: participants.map((p) => Boolean(p.revealedAt)),
    finalHash: null,
    winnerIndex: null,
  };
}

export default {
  createLobby,
  listLobbies,
  getLobby,
  joinLobby,
  revealLobby,
  lockLobby,
  finalizeLobby,
  refundLobby,
  proofLobby,
};