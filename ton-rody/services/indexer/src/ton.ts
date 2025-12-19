import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import TonGetters, { ZERO_ADDRESS } from './ton/getters';

/**
 * TonRodyRegistry
 *
 * This class wraps the low‑level TON getter functions exposed by
 * `TonGetters` and provides high‑level methods for the indexer to
 * retrieve information about lobbies.  All decoding of stack values
 * is delegated to the decoders defined in `ton/getters.ts`.  No
 * manual stack manipulation takes place here.
 */
export class TonRodyRegistry {
  private factory: Address;
  private getters: TonGetters;
  constructor(private client: TonClient, factoryAddress: string) {
    this.factory = Address.parse(factoryAddress);
    this.getters = new TonGetters(client);
  }

  /** Retrieve the number of lobbies deployed via the factory. */
  async getLobbyCount(): Promise<number> {
    const stack = await this.getters.runGet(this.factory, 'getLobbyCount');
    return this.getters.decodeFactoryLobbyCount(stack);
  }

  /** Retrieve a list of lobby IDs from the factory. */
  async getLobbyIds(offset: number, limit: number): Promise<number[]> {
    const stack = await this.getters.runGet(this.factory, 'getLobbyIds', [ { type: 'int', value: BigInt(offset) }, { type: 'int', value: BigInt(limit) } ]);
    return this.getters.decodeFactoryLobbyIdsCell(stack);
  }

  /** Retrieve metadata for a given lobby ID.  Returns null if the
   * lobby does not exist in the registry. */
  async getLobbyMeta(id: number): Promise<{ lobbyId: number; address: string; creator: string; createdAt: number; stakeNano: number; maxPlayers: number } | null> {
    const stack = await this.getters.runGet(this.factory, 'getLobbyMeta', [ { type: 'int', value: BigInt(id) } ]);
    const meta = this.getters.decodeFactoryLobbyMetaTuple(stack);
    if (!meta) return null;
    // destructure and rename keys for consistency
    return {
      lobbyId: meta.lobbyId,
      address: meta.lobbyAddress,
      creator: meta.creator,
      createdAt: meta.createdAt,
      stakeNano: meta.stakeNano,
      maxPlayers: meta.maxPlayers,
    };
  }

  /** Retrieve lobby state (enum value) by lobby address. */
  async getLobbyState(address: string): Promise<number> {
    const addr = Address.parse(address);
    const stack = await this.getters.runGet(addr, 'getState');
    return this.getters.decodeLobbyState(stack);
  }

  /** Retrieve lobby parameters. */
  async getLobbyParams(address: string) {
    const addr = Address.parse(address);
    const stack = await this.getters.runGet(addr, 'getParams');
    return this.getters.decodeLobbyParams(stack);
  }

  /** Retrieve the winner of a lobby; returns ZERO_ADDRESS if none. */
  async getLobbyWinner(address: string): Promise<string> {
    const addr = Address.parse(address);
    const stack = await this.getters.runGet(addr, 'getWinner');
    return this.getters.decodeLobbyWinner(stack);
  }

}

export default TonRodyRegistry;