import { Address } from 'ton-core';
import {
  addressArg,
  decodeFactoryLobbyCount,
  decodeFactoryLobbyIdsCell,
  decodeFactoryLobbyMetaTuple,
  decodeLobbyClaimable,
  decodeLobbyCommit,
  decodeLobbyParams,
  decodeLobbyState,
  decodeLobbyWinner,
  intArg,
  runGet,
} from './ton/getters';

/**
 * TonRodyRegistry
 *
 * Read-only wrapper around factory and lobby getters. All stack
 * decoding is delegated to the functions in `ton/getters.ts`.
 */
export class TonRodyRegistry {
  private factory: string;
  constructor(factoryAddress: string) {
    this.factory = Address.parse(factoryAddress).toString();
  }

  async getLobbyCount(): Promise<number> {
    const reader = await runGet(this.factory, 'getLobbyCount');
    return decodeFactoryLobbyCount(reader);
  }

  async getLobbyIds(offset: number, limit: number): Promise<number[]> {
    const reader = await runGet(this.factory, 'getLobbyIds', [intArg(offset), intArg(limit)]);
    return decodeFactoryLobbyIdsCell(reader);
  }

  async getLobbyMeta(id: number): Promise<{ lobbyId: number; address: string; creator: string; createdAt: number; stakeNano: bigint; maxPlayers: number } | null> {
    const reader = await runGet(this.factory, 'getLobbyMeta', [intArg(id)]);
    const meta = decodeFactoryLobbyMetaTuple(reader);
    if (!meta.found) return null;
    return {
      lobbyId: Number(meta.lobbyId),
      address: meta.lobbyAddress,
      creator: meta.creator,
      createdAt: Number(meta.createdAt),
      stakeNano: meta.stakeNano,
      maxPlayers: Number(meta.maxPlayers),
    };
  }

  async getLobbyState(address: string): Promise<number> {
    const reader = await runGet(Address.parse(address).toString(), 'getState');
    return decodeLobbyState(reader);
  }

  async getLobbyParams(address: string) {
    const reader = await runGet(Address.parse(address).toString(), 'getParams');
    return decodeLobbyParams(reader);
  }

  async getLobbyWinner(address: string): Promise<string> {
    const reader = await runGet(Address.parse(address).toString(), 'getWinner');
    return decodeLobbyWinner(reader);
  }

  async getLobbyClaimable(address: string, walletAddress: string): Promise<bigint> {
    const reader = await runGet(Address.parse(address).toString(), 'getClaimable', [addressArg(walletAddress)]);
    return decodeLobbyClaimable(reader);
  }

  async getLobbyCommit(address: string, walletAddress: string): Promise<bigint> {
    const reader = await runGet(Address.parse(address).toString(), 'getCommit', [addressArg(walletAddress)]);
    return decodeLobbyCommit(reader);
  }
}

export default TonRodyRegistry;
