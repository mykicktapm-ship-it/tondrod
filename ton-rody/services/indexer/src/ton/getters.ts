import { TonClient } from '@ton/ton';
import { Address, Cell } from '@ton/core';

/**
 * ZERO_ADDRESS is the canonical zero address used to represent the
 * absence of a participant on TON.  It is encoded as 0:0 and
 * corresponds to the basechain address with no bits set.  When the
 * factory getter `getLobbyMeta` returns `found = false` we fill the
 * lobbyAddress and creator fields with this value.  Consumers
 * should not treat ZERO_ADDRESS as a valid wallet.
 */
export const ZERO_ADDRESS = Address.parse('0:0');

/**
 * TonGetters encapsulates all calls to the TON blockchain for the
 * indexer.  It provides a single method to run get methods and a
 * collection of decoders to parse the results into JavaScript
 * primitives.  No part of the indexer may manually pop from the
 * returned stack; instead, call a decoder from this module.
 */
export class TonGetters {
  constructor(private client: TonClient) {}

  /**
   * Perform a `runGetMethod` call on the given contract address and
   * return the resulting stack.  Arguments must already be
   * prepared (e.g. as `{ type: 'int', value: BigInt(n) }`).  The
   * returned value is the raw stack array from the RPC.
   */
  async runGet(address: Address, method: string, args: any[] = []): Promise<any[]> {
    const result = await this.client.callGetMethod(address, method, args);
    return result.stack;
  }

  /**
   * Convert a single stack item into a JavaScript number.  TON
   * get-method results can be numbers, bigints or Cells.  When
   * provided a Cell we attempt to read a 257-bit integer from it.
   */
  private toNumber(item: any): number {
    if (typeof item === 'number') return item;
    if (typeof item === 'bigint') return Number(item);
    if (item instanceof Cell) {
      const slice = item.beginParse();
      return Number(slice.loadInt(257));
    }
    // Fallback to native conversion
    return Number(item);
  }

  /**
   * Decode the result of `getLobbyCount()`.  Expects the stack to
   * contain a single Int on top.
   */
  decodeFactoryLobbyCount(stack: any[]): number {
    const top = stack.pop();
    return this.toNumber(top);
  }

  /**
   * Decode the cell returned by `getLobbyIds(offset, limit)`.  The cell
   * encodes a sequence of 257-bit lobbyId integers stored back-to-back.
   * Returns an array of numbers.  If the cell is empty or not a Cell
   * instance an empty array is returned.
   */
  decodeFactoryLobbyIdsCell(stack: any[]): number[] {
    const cellRef = stack.pop();
    const ids: number[] = [];
    if (cellRef instanceof Cell) {
      const reader = cellRef.beginParse();
      while (reader.remainingBits > 0) {
        try {
          const id = reader.loadInt(257);
          ids.push(Number(id));
        } catch {
          break;
        }
      }
    }
    return ids;
  }

  /**
   * Decode the tuple returned by `getLobbyMeta(lobbyId)`.  The tuple
   * layout is `(Bool found, Int lobbyId, Address lobbyAddress,
   * Address creator, Int createdAt, Int stakeNano, Int maxPlayers)`.  If
   * `found` is false the remaining values are still present but are
   * considered invalid; we replace lobbyAddress and creator with
   * ZERO_ADDRESS and numeric fields with zero.  Returns a plain
   * object or `null` when not found.
   */
  decodeFactoryLobbyMetaTuple(stack: any[]): { found: boolean; lobbyId: number; lobbyAddress: string; creator: string; createdAt: number; stakeNano: number; maxPlayers: number } | null {
    const foundVal = stack.pop();
    const found = Boolean(this.toNumber(foundVal));
    const id = this.toNumber(stack.pop());
    const addrCell = stack.pop();
    const creatorCell = stack.pop();
    const createdAt = this.toNumber(stack.pop());
    const stakeNano = this.toNumber(stack.pop());
    const maxPlayers = this.toNumber(stack.pop());
    if (!found) {
      return null;
    }
    let lobbyAddress = ZERO_ADDRESS.toString();
    let creator = ZERO_ADDRESS.toString();
    // decode lobbyAddress
    if (addrCell instanceof Cell) {
      const slice = addrCell.beginParse();
      if (slice.remainingBits > 0) {
        lobbyAddress = Address.parse(slice.loadAddress().toString()).toString();
      }
    } else if (addrCell) {
      lobbyAddress = Address.parse(addrCell.toString()).toString();
    }
    // decode creator
    if (creatorCell instanceof Cell) {
      const slice2 = creatorCell.beginParse();
      if (slice2.remainingBits > 0) {
        creator = Address.parse(slice2.loadAddress().toString()).toString();
      }
    } else if (creatorCell) {
      creator = Address.parse(creatorCell.toString()).toString();
    }
    return { found, lobbyId: id, lobbyAddress, creator, createdAt, stakeNano, maxPlayers };
  }

  /**
   * Decode the result of `getParams()` on a lobby.  Returns an object
   * with owner, stakeNano, maxPlayers, joinDeadline, revealDeadline,
   * feeBps, feeRecipient, lobbyId, totalPotNano and playersCount.
   */
  decodeLobbyParams(stack: any[]): { owner: string; stakeNano: number; maxPlayers: number; joinDeadline: number; revealDeadline: number; feeBps: number; feeRecipient: string; lobbyId: number; totalPotNano: number; playersCount: number } {
    const ownerCell = stack.pop();
    let owner = ZERO_ADDRESS.toString();
    if (ownerCell instanceof Cell) {
      const s = ownerCell.beginParse();
      owner = Address.parse(s.loadAddress().toString()).toString();
    } else if (ownerCell) {
      owner = Address.parse(ownerCell.toString()).toString();
    }
    const stakeNano = this.toNumber(stack.pop());
    const maxPlayers = this.toNumber(stack.pop());
    const joinDeadline = this.toNumber(stack.pop());
    const revealDeadline = this.toNumber(stack.pop());
    const feeBps = this.toNumber(stack.pop());
    const feeRecCell = stack.pop();
    let feeRecipient = ZERO_ADDRESS.toString();
    if (feeRecCell instanceof Cell) {
      const s2 = feeRecCell.beginParse();
      feeRecipient = Address.parse(s2.loadAddress().toString()).toString();
    } else if (feeRecCell) {
      feeRecipient = Address.parse(feeRecCell.toString()).toString();
    }
    const lobbyId = this.toNumber(stack.pop());
    const totalPotNano = this.toNumber(stack.pop());
    const playersCount = this.toNumber(stack.pop());
    return { owner, stakeNano, maxPlayers, joinDeadline, revealDeadline, feeBps, feeRecipient, lobbyId, totalPotNano, playersCount };
  }

  /**
   * Decode the result of `getState()` on a lobby.  Returns the
   * numeric state as defined by the LobbyState enum (1=OPEN,2=REVEALING,
   * 3=FINALIZED,4=CANCELED).
   */
  decodeLobbyState(stack: any[]): number {
    const state = this.toNumber(stack.pop());
    return state;
  }

  /**
   * Decode the result of `getWinner()` on a lobby.  Returns a
   * friendly address string or the ZERO_ADDRESS string if the winner
   * cell is empty.
   */
  decodeLobbyWinner(stack: any[]): string {
    const cell = stack.pop();
    if (cell instanceof Cell) {
      const slice = cell.beginParse();
      if (slice.remainingBits === 0) return ZERO_ADDRESS.toString();
      const winnerAddr = slice.loadAddress().toString();
      return Address.parse(winnerAddr).toString();
    }
    return ZERO_ADDRESS.toString();
  }

  /**
   * Decode the result of `getClaimable(addr)` on a lobby.  Returns the
   * claimable amount in nanoTON as a number.
   */
  decodeLobbyClaimable(stack: any[]): number {
    const val = this.toNumber(stack.pop());
    return val;
  }

  /**
   * Decode the result of `getCommit(addr)` on a lobby.  Returns the
   * commit integer value (256-bit) represented as a string.  If no
   * commit exists for the given participant the contract returns 0.
   */
  decodeLobbyCommit(stack: any[]): string {
    const val = stack.pop();
    // Int may be bigint or number; convert to bigint then to decimal string
    let bn: bigint;
    if (typeof val === 'bigint') {
      bn = val;
    } else if (typeof val === 'number') {
      bn = BigInt(val);
    } else if (val instanceof Cell) {
      const slice = val.beginParse();
      bn = slice.loadInt(257);
    } else {
      bn = BigInt(0);
    }
    return bn.toString();
  }
}

export default TonGetters;