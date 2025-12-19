import { Address, beginCell, Cell } from 'ton-core';
import { OPCODES } from './constants';

export function toNano(ton: number | string): bigint {
  const [i, f = ''] = String(ton).split('.');
  const frac = (f + '000000000').slice(0, 9);
  return BigInt(i) * 1_000_000_000n + BigInt(frac);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function computeCommit(secretHex: string, lobbyId: number, walletAddress: string): bigint {
  const cell = beginCell();
  cell.storeBuffer(hexToBytes(secretHex));
  cell.storeInt(BigInt(lobbyId), 257);
  cell.storeAddress(Address.parse(walletAddress));
  return cell.endCell().hash();
}

export function secretToBigInt(secretHex: string): bigint {
  const clean = secretHex.startsWith('0x') ? secretHex.slice(2) : secretHex;
  return BigInt(`0x${clean}`);
}

function cellToB64(cell: Cell): string {
  return cell.toBoc().toString('base64');
}

export function buildJoinPayload(commit: bigint): string {
  const cell = beginCell()
    .storeUint(OPCODES.JOIN, 32)
    .storeUint(commit, 256)
    .endCell();
  return cellToB64(cell);
}

export function buildRevealPayload(seed: bigint): string {
  const cell = beginCell()
    .storeUint(OPCODES.REVEAL, 32)
    .storeUint(seed, 256)
    .endCell();
  return cellToB64(cell);
}

export function buildLockPayload(): string {
  return cellToB64(beginCell().storeUint(OPCODES.LOCK, 32).endCell());
}

export function buildFinalizePayload(): string {
  return cellToB64(beginCell().storeUint(OPCODES.FINALIZE, 32).endCell());
}

export function buildRefundPayload(): string {
  return cellToB64(beginCell().storeUint(OPCODES.REFUND, 32).endCell());
}

export function buildClaimPayload(): string {
  return cellToB64(beginCell().storeUint(OPCODES.CLAIM, 32).endCell());
}
