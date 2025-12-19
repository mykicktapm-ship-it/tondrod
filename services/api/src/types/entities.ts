/**
 * Entity type definitions.
 *
 * These interfaces mirror the Prisma models for use in services and
 * controllers. You may import the generated Prisma types instead
 * if you prefer (`@prisma/client`). These are provided here for
 * illustration.
 */

export interface User {
  id: string;
  telegramId: bigint;
  username: string | null;
  createdAt: Date;
  lastSeen: Date;
}

export interface WalletLink {
  id: string;
  userId: string;
  walletAddress: string;
  linkedAt: Date;
  lastChangedAt: Date;
  relinkCooldownUntil: Date | null;
}

export interface Lobby {
  id: string;
  contractAddress: string;
  version: number;
  stakeNano: bigint;
  maxPlayers: number;
  minPlayersToRun: number;
  joinDeadline: Date;
  revealDeadline: Date;
  feeBps: number;
  feeRecipient: string;
  state: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}