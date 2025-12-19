/*
 * Economic invariant tests for TonRodyLobby
 *
 * These tests complement the behavioural tests in `lobby.spec.ts` by
 * asserting global economic properties of the commit–reveal raffle.
 * The invariants tested are:
 *
 * 1. After a game is finalised, the sum of all claimable balances
 *    (including the fee recipient) equals the total pot.  No TON is
 *    lost or created by the contract.
 * 2. The fee plus the winner payout equals the total deposits.  The
 *    deposit is simply the stake multiplied by the number of
 *    participants.
 * 3. Claim messages cannot be executed twice by the same party.  A
 *    second claim must revert.
 */

import { Address, beginCell, toNano } from 'ton-core';
import { Blockchain, SandboxContract } from '@ton-community/sandbox';
import { expect } from '@ton-community/test-utils';
import fs from 'fs';
import path from 'path';

// Import compiled wrapper
import { TonRodyLobby } from '../build/TonRodyLobby';

function computeCommit(secret: Buffer, lobbyId: number, addr: Address): bigint {
  const sc = beginCell();
  sc.storeBuffer(secret);
  sc.storeInt(lobbyId, 257);
  sc.storeAddress(addr);
  const c = sc.endCell();
  return c.hash();
}

function advanceTime(blockchain: Blockchain, seconds: number) {
  blockchain.now += seconds;
}

describe('economic invariants', () => {
  const stake = toNano('1');
  const maxPlayers = 3;
  // choose a non‑zero fee to exercise fee logic
  const feeBps = 100; // 1%

  let blockchain: Blockchain;
  let deployer: SandboxContract;
  let players: SandboxContract[];

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    players = [await blockchain.treasury('alice'), await blockchain.treasury('bob'), await blockchain.treasury('carol')];
  });

  async function deployLobby(joinDuration: number, revealDuration: number) {
    const now = blockchain.now;
    const joinDeadline = now + joinDuration;
    const revealDeadline = joinDeadline + revealDuration;
    const lobbyId = 54321;
    const lobby = await TonRodyLobby.fromInit(
      deployer.address,
      stake,
      maxPlayers,
      joinDeadline,
      revealDeadline,
      feeBps,
      deployer.address,
      lobbyId
    ).deploy(deployer, toNano('1'));
    return { lobby, lobbyId, joinDeadline, revealDeadline };
  }

  test('sum of claimables equals total pot and fee+payout=deposit', async () => {
    const { lobby, lobbyId } = await deployLobby(10, 10);
    const secrets = [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')];
    const commits = players.map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    // players join
    for (let i = 0; i < players.length; i++) {
      const res = await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
      expect(res.exitCode).toBeUndefined();
    }
    // reveal secrets
    for (let i = 0; i < players.length; i++) {
      const res = await lobby.send(players[i], { value: toNano('0.1') }, { $$type: 'Reveal', secret: secrets[i] });
      expect(res.exitCode).toBeUndefined();
    }
    // finalise
    advanceTime(blockchain, 20);
    const resFin = await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    expect(resFin.exitCode).toBeUndefined();
    // compute totals
    const totalPot = stake * BigInt(players.length);
    // sum claimables of all players and fee recipient
    let sumClaimable = 0n;
    for (const p of players) {
      sumClaimable += BigInt(await lobby.getClaimable(p.address));
    }
    sumClaimable += BigInt(await lobby.getClaimable(deployer.address));
    expect(sumClaimable).toBe(totalPot);
    // verify fee+payout = deposit (total pot)
    const fee = (totalPot * BigInt(feeBps)) / 10000n;
    const payout = totalPot - fee;
    // payout should equal claimable of winner
    const winnerAddr = (await lobby.getWinner()) as Address;
    const winnerClaim = BigInt(await lobby.getClaimable(winnerAddr));
    expect(fee + winnerClaim).toBe(totalPot);
  });

  test('no double claim', async () => {
    const { lobby, lobbyId } = await deployLobby(10, 10);
    const secrets = [Buffer.from('d'), Buffer.from('e'), Buffer.from('f')];
    const commits = players.map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    for (let i = 0; i < players.length; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    for (let i = 0; i < players.length; i++) {
      await lobby.send(players[i], { value: toNano('0.1') }, { $$type: 'Reveal', secret: secrets[i] });
    }
    advanceTime(blockchain, 20);
    await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    // Winner claims their payout
    const winner = (await lobby.getWinner()) as Address;
    const winnerIdx = players.findIndex((p) => p.address.equals(winner));
    const winnerContract = players[winnerIdx];
    // first claim should succeed
    const res1 = await lobby.send(winnerContract, { value: toNano('0.1') }, { $$type: 'Claim' });
    expect(res1.exitCode).toBeUndefined();
    // second claim should fail (nothing left)
    const res2 = await lobby.send(winnerContract, { value: toNano('0.1') }, { $$type: 'Claim' });
    expect(res2.exitCode).not.toBeUndefined();
  });

  test('no double finalize', async () => {
    // Deploy lobby and have two players join and reveal
    const { lobby, lobbyId } = await deployLobby(5, 5);
    const secrets = [Buffer.from('g'), Buffer.from('h')];
    const commits = players.slice(0, 2).map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    // join first two players
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    // reveal
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: toNano('0.1') }, { $$type: 'Reveal', secret: secrets[i] });
    }
    // advance time and finalize once
    advanceTime(blockchain, 20);
    const res1 = await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    expect(res1.exitCode).toBeUndefined();
    // try finalizing again; should fail
    const res2 = await lobby.send(players[1], { value: toNano('0.1') }, { $$type: 'Finalize' });
    expect(res2.exitCode).not.toBeUndefined();
  });

  test('no drain after finalisation', async () => {
    const { lobby, lobbyId } = await deployLobby(5, 5);
    // Only two players join to keep test simple
    const secrets = [Buffer.from('i'), Buffer.from('j')];
    const commits = players.slice(0, 2).map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: toNano('0.1') }, { $$type: 'Reveal', secret: secrets[i] });
    }
    advanceTime(blockchain, 20);
    // Finalize and claim by winner
    await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    const winnerAddr = (await lobby.getWinner()) as Address;
    const winnerIdx = players.findIndex((p) => p.address.equals(winnerAddr));
    const win = players[winnerIdx];
    await lobby.send(win, { value: toNano('0.1') }, { $$type: 'Claim' });
    // After claim, claimable of winner should be zero
    const remaining = BigInt(await lobby.getClaimable(winnerAddr));
    expect(remaining).toBe(0n);
    // Attempting to claim again should revert (tested above).  Additionally,
    // claimable for an arbitrary address should remain zero, preventing
    // draining leftover funds.
    const random = await blockchain.treasury('random');
    const otherClaimable = BigInt(await lobby.getClaimable(random.address));
    expect(otherClaimable).toBe(0n);
  });
});