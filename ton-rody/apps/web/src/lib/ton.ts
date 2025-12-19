import { beginCell, Cell } from 'ton-core';
import { OPCODES } from './constants';

export function toNano(ton: number | string): bigint {
  const [i, f = ''] = String(ton).split('.');
  const frac = (f + '000000000').slice(0, 9);
  return BigInt(i) * 1_000_000_000n + BigInt(frac);
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