import { GAS_BUFFER_NANO } from './constants';
import {
  buildJoinPayload,
  buildRevealPayload,
  buildLockPayload,
  buildFinalizePayload,
  buildRefundPayload,
  buildClaimPayload,
} from './ton';

export function joinTx(addr: string, stake: bigint, commit: bigint) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: addr,
        amount: (stake + GAS_BUFFER_NANO).toString(),
        payload: buildJoinPayload(commit),
      },
    ],
  };
}

export function revealTx(addr: string, seed: bigint) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: addr,
        amount: GAS_BUFFER_NANO.toString(),
        payload: buildRevealPayload(seed),
      },
    ],
  };
}

export function lockTx(addr: string) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: addr,
        amount: GAS_BUFFER_NANO.toString(),
        payload: buildLockPayload(),
      },
    ],
  };
}

export function finalizeTx(addr: string) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: addr,
        amount: GAS_BUFFER_NANO.toString(),
        payload: buildFinalizePayload(),
      },
    ],
  };
}

export function refundTx(addr: string) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: addr,
        amount: GAS_BUFFER_NANO.toString(),
        payload: buildRefundPayload(),
      },
    ],
  };
}

export function claimTx(addr: string) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: addr,
        amount: GAS_BUFFER_NANO.toString(),
        payload: buildClaimPayload(),
      },
    ],
  };
}