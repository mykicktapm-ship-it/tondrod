import { Address, Cell, beginCell } from 'ton-core';

export type StackArg =
  | { type: 'int'; value: bigint }
  | { type: 'address'; value: Address };

type StackEntry = {
  '@type': string;
  [key: string]: any;
};

function normalizeEndpoint(raw: string): string {
  let endpoint = raw.trim();
  if (!endpoint) throw new Error('NEXT_PUBLIC_TON_RPC_ENDPOINT is not set');
  if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
  if (endpoint.endsWith('/jsonRPC')) endpoint = endpoint.slice(0, -'/jsonRPC'.length);
  if (!endpoint.endsWith('/api/v2')) endpoint = `${endpoint}/api/v2`;
  return endpoint;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
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
      bytes: bytesToBase64(cell.toBoc()),
    },
  };
}

function toStackEntry(arg: StackArg): StackEntry {
  if (arg.type === 'int') return entryNumber(arg.value);
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
  if (typeof value !== 'string') throw new Error('Invalid number stack entry');
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
  const cells = Cell.fromBoc(base64ToBytes(bytes));
  if (cells.length === 0) throw new Error('Empty cell');
  return cells[0];
}

function decodeAddress(entry: StackEntry): Address | null {
  const cell = decodeCell(entry);
  const slice = cell.beginParse();
  if (slice.remainingBits === 0 && slice.remainingRefs === 0) return null;
  return slice.loadAddress();
}

class StackReader {
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
    if (this.index >= this.stack.length) throw new Error('Stack underflow');
    const entry = this.stack[this.index];
    this.index += 1;
    return entry;
  }
}

async function runGet(address: string, method: string, args: StackArg[] = []): Promise<StackReader> {
  const endpointRaw = process.env.NEXT_PUBLIC_TON_RPC_ENDPOINT || '';
  const endpoint = normalizeEndpoint(endpointRaw);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.NEXT_PUBLIC_TON_API_KEY) {
    headers['X-API-Key'] = process.env.NEXT_PUBLIC_TON_API_KEY;
  }
  const res = await fetch(`${endpoint}/runGetMethodStd`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      address,
      method,
      stack: args.map(toStackEntry),
    }),
  });
  if (!res.ok) throw new Error(`TON RPC error ${res.status}`);
  const json = await res.json();
  if (!json.ok || !json.result?.stack) {
    throw new Error('Invalid TON RPC result');
  }
  return new StackReader(json.result.stack as StackEntry[]);
}

export async function getLobbyCommit(lobbyAddress: string, walletAddress: string): Promise<bigint> {
  const reader = await runGet(lobbyAddress, 'getCommit', [
    { type: 'address', value: Address.parse(walletAddress) },
  ]);
  return reader.readInt();
}

export async function getLobbyParams(lobbyAddress: string): Promise<{ lobbyId: bigint; joinDeadline: bigint; revealDeadline: bigint; feeBps: bigint; feeRecipient: string }> {
  const reader = await runGet(lobbyAddress, 'getParams');
  reader.readAddress();
  reader.readInt();
  reader.readInt();
  const joinDeadline = reader.readInt();
  const revealDeadline = reader.readInt();
  const feeBps = reader.readInt();
  const feeRecipient = reader.readAddress();
  const lobbyId = reader.readInt();
  return {
    lobbyId,
    joinDeadline,
    revealDeadline,
    feeBps,
    feeRecipient: feeRecipient ? feeRecipient.toString() : '0:0',
  };
}

export async function getPlayerStatus(lobbyAddress: string, walletAddress: string): Promise<{ joined: boolean; revealed: boolean; canRefund: boolean }> {
  const reader = await runGet(lobbyAddress, 'getPlayerStatus', [
    { type: 'address', value: Address.parse(walletAddress) },
  ]);
  const joined = reader.readBool();
  const revealed = reader.readBool();
  const canRefund = reader.readBool();
  return { joined, revealed, canRefund };
}

export async function getClaimable(lobbyAddress: string, walletAddress: string): Promise<bigint> {
  const reader = await runGet(lobbyAddress, 'getClaimable', [
    { type: 'address', value: Address.parse(walletAddress) },
  ]);
  return reader.readInt();
}
