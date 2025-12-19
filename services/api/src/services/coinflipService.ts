import prisma from '../db/prisma';
import { v4 as uuidv4 } from 'uuid';

/**
 * CoinFlip service stub
 */

export async function createCoinFlip(params: {
  createdByUserId: string;
  stakeNano: bigint;
  joinDeadline: Date;
  revealDeadline: Date;
  feeBps: number;
  feeRecipient: string;
}): Promise<{ id: string; contractAddress: string }> {
  const id = uuidv4();
  const contractAddress = `0:${id.replace(/-/g, '').slice(0, 64)}`;
  await prisma.coinFlip.create({
    data: {
      id,
      contractAddress,
      version: 1,
      stakeNano: BigInt(params.stakeNano.toString()),
      joinDeadline: params.joinDeadline,
      revealDeadline: params.revealDeadline,
      feeBps: params.feeBps,
      feeRecipient: params.feeRecipient,
      createdByUserId: params.createdByUserId,
    },
  });
  return { id, contractAddress };
}

export async function listCoinFlips(): Promise<any[]> {
  const flips = await prisma.coinFlip.findMany();
  return flips.map((f) => ({
    id: f.id,
    contractAddress: f.contractAddress,
    stakeNano: f.stakeNano.toString(),
    joinDeadline: f.joinDeadline,
    revealDeadline: f.revealDeadline,
    feeBps: f.feeBps,
    feeRecipient: f.feeRecipient,
    state: f.state,
  }));
}

export async function getCoinFlip(id: string): Promise<any | null> {
  const flip = await prisma.coinFlip.findUnique({ where: { id } });
  if (!flip) return null;
  const participants = await prisma.coinFlipParticipant.findMany({ where: { coinflipId: id } });
  return {
    ...flip,
    stakeNano: flip.stakeNano.toString(),
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

export async function joinCoinFlip(userId: string, coinflipId: string, commitHash: string): Promise<{ tx: any }> {
  const exists = await prisma.coinFlipParticipant.findFirst({ where: { coinflipId, userId } });
  if (exists) throw new Error('duplicate');
  // Insert participant with commit hash.  walletAddress is unknown at this stage, so we reuse commitHash as a placeholder.
  await prisma.coinFlipParticipant.create({
    data: {
      coinflipId,
      userId,
      walletAddress: commitHash, // placeholder; real wallet address is client-side
      commitHash,
    },
  });
  // Return skeleton transaction.  The client will build the actual payload using ton-core.
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function revealCoinFlip(userId: string, coinflipId: string): Promise<{ tx: any }> {
  // Mark participant as revealed by updating revealedAt
  const now = new Date();
  await prisma.coinFlipParticipant.updateMany({
    where: { coinflipId, userId, revealedAt: null },
    data: { revealedAt: now },
  });
  // Return skeleton transaction (no payload).  Client will attach seed payload.
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function finalizeCoinFlip(userId: string, coinflipId: string): Promise<{ tx: any }> {
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function refundCoinFlip(userId: string, coinflipId: string): Promise<{ tx: any }> {
  return { tx: { messages: [], validUntil: Math.floor(Date.now() / 1000) + 300 } };
}

export async function proofCoinFlip(id: string): Promise<any> {
  const flip = await prisma.coinFlip.findUnique({ where: { id } });
  if (!flip) return null;
  const participants = await prisma.coinFlipParticipant.findMany({ where: { coinflipId: id } });
  return {
    coinflipId: id,
    contractAddress: flip.contractAddress,
    commits: participants.map((p) => p.commitHash),
    revealedFlags: participants.map((p) => Boolean(p.revealedAt)),
    finalHash: null,
    winnerIndex: null,
  };
}

export default {
  createCoinFlip,
  listCoinFlips,
  getCoinFlip,
  joinCoinFlip,
  revealCoinFlip,
  finalizeCoinFlip,
  refundCoinFlip,
  proofCoinFlip,
};