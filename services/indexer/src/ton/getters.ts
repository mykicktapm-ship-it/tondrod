import { Address, Cell, beginCell } from 'ton-core';

export const ZERO_ADDRESS = '0:0';

export type StackArg =
  | { type: 'int'; value: bigint }
  | { type: 'address'; value: Address };

type StackEntry = {
  '@type': string;
  [key: string]: any;
};

function normalizeEndpoint(raw: string): string {
  let endpoint = raw.trim();
  if (!endpoint) {
    throw new Error('TON_RPC_ENDPOINT is not set');
  }
  if (endpoint.endsWith('/')) {
    endpoint = endpoint.slice(0, -1);
  }
  if (endpoint.endsWith('/jsonRPC')) {
    endpoint = endpoint.slice(0, -'/jsonRPC'.length);
  }
  if (!endpoint.endsWith('/api/v2')) {
    endpoint = `${endpoint}/api/v2`;
  }
  return endpoint;
}

function entryNumber(value: bigint): StackEntry {
  return {
    '@type': 'tvm.stackEntryNumber',
    number: {
      '@type': 'tvm.numberDecimal',
      number: value.toString(),
    },
  };
}

function entrySlice(cell: Cell): StackEntry {
  return {
    '@type': 'tvm.stackEntrySlice',
    slice: {
      '@type': 'tvm.slice',
      bytes: cell.toBoc().toString('base64'),
    },
  };
}

function toStackEntry(arg: StackArg): StackEntry {
  if (arg.type === 'int') {
    return entryNumber(arg.value);
  }
  if (arg.type === 'address') {
    const cell = beginCell().storeAddress(arg.value).endCell();
    return entrySlice(cell);
  }
  throw new Error('Unsupported stack arg');
}

function decodeNumber(entry: StackEntry): bigint {
  if (entry['@type'] !== 'tvm.stackEntryNumber') {
    throw new Error(`Expected number stack entry, got ${entry['@type']}`);
  }
  const value = entry.number?.number;
  if (typeof value !== 'string') {
    throw new Error('Invalid number stack entry');
  }
  return BigInt(value);
}

function decodeCell(entry: StackEntry): Cell {
  const type = entry['@type'];
  if (type !== 'tvm.stackEntryCell' && type !== 'tvm.stackEntrySlice') {
    throw new Error(`Expected cell or slice, got ${type}`);
  }
  const bytes = type === 'tvm.stackEntryCell'
    ? entry.cell?.bytes
    : entry.slice?.bytes;
  if (typeof bytes !== 'string') {
    throw new Error('Invalid cell bytes');
  }
  const cells = Cell.fromBoc(Buffer.from(bytes, 'base64'));
  if (cells.length === 0) {
    throw new Error('Empty cell stack entry');
  }
  return cells[0];
}

function decodeAddress(entry: StackEntry): Address | null {
  const cell = decodeCell(entry);
  const slice = cell.beginParse();
  if (slice.remainingBits === 0 && slice.remainingRefs === 0) {
    return null;
  }
  return slice.loadAddress();
}

export class StackReader {
  private index = 0;
  constructor(private stack: StackEntry[]) {}

  readInt(): bigint {
    return decodeNumber(this.next());
  }

  readBool(): boolean {
    return this.readInt() !== 0n;
  }

  readCell(): Cell {
    return decodeCell(this.next());
  }

  readAddress(): Address | null {
    return decodeAddress(this.next());
  }

  private next(): StackEntry {
    if (this.index >= this.stack.length) {
      throw new Error('Stack underflow');
    }
    const entry = this.stack[this.index];
    this.index += 1;
    return entry;
  }
}

export async function runGet(address: string, method: string, args: StackArg[] = []): Promise<StackReader> {
  const endpointRaw = process.env.TON_RPC_ENDPOINT;
  if (!endpointRaw) {
    throw new Error('TON_RPC_ENDPOINT not set');
  }
  const endpoint = normalizeEndpoint(endpointRaw);
  const body = {
    address,
    method,
    stack: args.map(toStackEntry),
  };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (process.env.TON_API_KEY) {
    headers['X-API-Key'] = process.env.TON_API_KEY;
  }
  const res = await fetch(`${endpoint}/runGetMethodStd`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`runGetMethodStd failed with ${res.status}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error('TON RPC returned ok=false');
  }
  const result = json.result;
  if (!result || !Array.isArray(result.stack)) {
    throw new Error('Invalid TON RPC result');
  }
  return new StackReader(result.stack as StackEntry[]);
}

export function intArg(value: bigint | number): StackArg {
  return { type: 'int', value: BigInt(value) };
}

export function addressArg(value: string | Address): StackArg {
  return { type: 'address', value: typeof value === 'string' ? Address.parse(value) : value };
}

export function decodeFactoryLobbyCount(reader: StackReader): number {
  return Number(reader.readInt());
}

export function decodeFactoryLobbyIdsCell(reader: StackReader): number[] {
  const cell = reader.readCell();
  const ids: number[] = [];
  const slice = cell.beginParse();
  while (slice.remainingBits > 0) {
    try {
      const id = slice.loadInt(257);
      ids.push(Number(id));
    } catch {
      break;
    }
  }
  return ids;
}

export function decodeFactoryLobbyMetaTuple(reader: StackReader) {
  const found = reader.readBool();
  const lobbyId = reader.readInt();
  const lobbyAddress = reader.readAddress();
  const creator = reader.readAddress();
  const createdAt = reader.readInt();
  const stakeNano = reader.readInt();
  const maxPlayers = reader.readInt();
  return {
    found,
    lobbyId,
    lobbyAddress: lobbyAddress ? lobbyAddress.toString() : ZERO_ADDRESS,
    creator: creator ? creator.toString() : ZERO_ADDRESS,
    createdAt,
    stakeNano,
    maxPlayers,
  };
}

export function decodeLobbyParams(reader: StackReader) {
  const owner = reader.readAddress();
  const stakeNano = reader.readInt();
  const maxPlayers = reader.readInt();
  const joinDeadline = reader.readInt();
  const revealDeadline = reader.readInt();
  const feeBps = reader.readInt();
  const feeRecipient = reader.readAddress();
  const lobbyId = reader.readInt();
  const totalPotNano = reader.readInt();
  const playersCount = reader.readInt();
  return {
    owner: owner ? owner.toString() : ZERO_ADDRESS,
    stakeNano,
    maxPlayers,
    joinDeadline,
    revealDeadline,
    feeBps,
    feeRecipient: feeRecipient ? feeRecipient.toString() : ZERO_ADDRESS,
    lobbyId,
    totalPotNano,
    playersCount,
  };
}

export function decodeLobbyState(reader: StackReader): number {
  return Number(reader.readInt());
}

export function decodeLobbyWinner(reader: StackReader): string {
  const winner = reader.readAddress();
  return winner ? winner.toString() : ZERO_ADDRESS;
}

export function decodeLobbyClaimable(reader: StackReader): bigint {
  return reader.readInt();
}

export function decodeLobbyCommit(reader: StackReader): bigint {
  return reader.readInt();
}
