/*
 * Tests for TonRodyLobby
 *
 * These tests exercise the behaviour of the N-player lobby raffle
 * contract using the commit-reveal scheme. They use the Blueprint
 * sandbox environment provided by @ton-community/sandbox. Each test
 * deploys a fresh instance of the contract and simulates players
 * joining, revealing and finalising the game. The scenarios cover
 * the happy path as well as a variety of edge cases (late joins,
 * missing reveals, early finalise, double finalise) to ensure the
 * contract enforces its state machine and invariants correctly.
 */

import { Address, beginCell, toNano } from 'ton-core';
import { Blockchain, SandboxContract } from '@ton-community/sandbox';
import { expect } from '@ton-community/test-utils';

// Import the compiled contract wrappers. The Tact compiler generates
// these in the `build` directory when you run `pnpm build`.
import { TonRodyLobby } from '../build/TonRodyLobby';

/**
 * Helper to compute a commit off-chain. The contract defines
 * commit = hash(secret || lobbyId || playerAddress). The secret is
 * encoded into a cell and stored as a slice. We then append the
 * lobbyId and the address to the cell before hashing. This helper
 * mirrors the on-chain computeCommit function.
 */
function computeCommit(secret: Buffer, lobbyId: number, addr: Address): bigint {
  const sc = beginCell();
  sc.storeBuffer(secret);
  sc.storeInt(lobbyId, 257);
  sc.storeAddress(addr);
  const c = sc.endCell();
  return c.hash();
}

/**
 * Helper to advance blockchain time. The sandbox exposes a mutable
 * `now` property on the blockchain that can be incremented to
 * simulate deadlines. Use this helper to move the clock forward.
 */
function advanceTime(blockchain: Blockchain, seconds: number) {
  // eslint-disable-next-line no-param-reassign
  blockchain.now += seconds;
}

describe('TonRodyLobby', () => {
  // Parameters for the lobby used in tests
  const stake = toNano('1');
  const maxPlayers = 3;
  const feeBps = 0;

  // Create a fresh sandbox for each test
  let blockchain: Blockchain;
  let deployer: SandboxContract;
  let players: SandboxContract[];

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    // Predefined treasury accounts provided by the sandbox
    deployer = await blockchain.treasury('deployer');
    players = [await blockchain.treasury('alice'), await blockchain.treasury('bob'), await blockchain.treasury('carol')];
  });

  /**
   * Deploy a fresh lobby with the specified deadlines. Join and
   * reveal deadlines are relative to blockchain.now. A lobbyId is
   * derived from the current timestamp to avoid collisions across
   * tests.
   */
  async function deployLobby(joinDuration: number, revealDuration: number) {
    const now = blockchain.now;
    const joinDeadline = now + joinDuration;
    const revealDeadline = joinDeadline + revealDuration;
    // Use a fixed lobbyId so tests are deterministic.  Changing this value
    // across tests would affect commit values and cause non-deterministic
    // behaviour.  A constant provides stable commits and reproducible
    // results.
    const lobbyId = 12345;
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

  test('happy path: all players join, reveal and finalize', async () => {
    const { lobby, lobbyId, joinDeadline, revealDeadline } = await deployLobby(10, 10);
    // Each player generates a secret and computes a commit
    const secrets: Buffer[] = [Buffer.from('secretA'), Buffer.from('secretB'), Buffer.from('secretC')];
    const commits = players.map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    // Players join and commit
    for (let i = 0; i < players.length; i++) {
      const res = await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
      expect(res.exitCode).toBeUndefined();
    }
    // At this point lobby should be in REVEALING state
    let state = await lobby.getState();
    expect(state).toBe(2);
    // Players reveal their secrets
    for (let i = 0; i < players.length; i++) {
      const res = await lobby.send(players[i], { value: toNano('0.1') }, { $$type: 'Reveal', secret: secrets[i] });
      expect(res.exitCode).toBeUndefined();
    }
    // Finalize after revealDeadline
    advanceTime(blockchain, 20);
    const resFin = await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    expect(resFin.exitCode).toBeUndefined();
    // Winner should be one of the players who revealed
    const winner = await lobby.getWinner();
    const winnerAddr = winner as Address;
    const isParticipant = players.some((p) => p.address.equals(winnerAddr));
    expect(isParticipant).toBe(true);
    // Claimable balances sum up to total pot
    const totalPot = stake * BigInt(players.length);
    let sumClaimable = 0n;
    for (const p of players) {
      sumClaimable += BigInt(await lobby.getClaimable(p.address));
    }
    sumClaimable += BigInt(await lobby.getClaimable(deployer.address));
    expect(sumClaimable).toBe(totalPot);
  });

  test('auto-lock when maxPlayers reached', async () => {
    const { lobby, lobbyId } = await deployLobby(10, 10);
    const secrets: Buffer[] = [Buffer.from('s1'), Buffer.from('s2'), Buffer.from('s3')];
    const commits = players.map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    for (let i = 0; i < players.length; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    const state = await lobby.getState();
    expect(state).toBe(2); // REVEALING
  });

  test('join after deadline should revert', async () => {
    const { lobby, lobbyId } = await deployLobby(1, 10);
    const secret = Buffer.from('late');
    const commit = computeCommit(secret, lobbyId, players[0].address);
    // Move time past joinDeadline
    advanceTime(blockchain, 5);
    const res = await lobby.send(players[0], { value: stake + toNano('0.1') }, { $$type: 'Join', commit });
    expect(res.exitCode).not.toBeUndefined();
  });

  test('reveal without commit should revert', async () => {
    const { lobby } = await deployLobby(10, 10);
    const res = await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Reveal', secret: Buffer.from('nope') });
    expect(res.exitCode).not.toBeUndefined();
  });

  test('finalize too early should revert', async () => {
    const { lobby, lobbyId } = await deployLobby(10, 10);
    // Two players join
    const secrets: Buffer[] = [Buffer.from('a'), Buffer.from('b')];
    const commits = players.slice(0, 2).map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    // Try finalise before revealDeadline and not all revealed
    const res = await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    expect(res.exitCode).not.toBeUndefined();
  });

  test('non-revealed players lose stake', async () => {
    const { lobby, lobbyId } = await deployLobby(10, 10);
    // Two players join and commit
    const secrets: Buffer[] = [Buffer.from('sa'), Buffer.from('sb')];
    const commits = players.slice(0, 2).map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    // Only the first player reveals
    await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Reveal', secret: secrets[0] });
    // Advance time to finalize
    advanceTime(blockchain, 20);
    await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    const winner = (await lobby.getWinner()) as Address;
    expect(winner.equals(players[0].address)).toBe(true);
    // Second player should have zero claimable (lost stake)
    const claim2 = await lobby.getClaimable(players[1].address);
    expect(claim2).toBe(0);
  });

  test('all players no reveal leads to cancel and refunds', async () => {
    const { lobby, lobbyId } = await deployLobby(10, 10);
    const secrets: Buffer[] = [Buffer.from('x'), Buffer.from('y')];
    const commits = players.slice(0, 2).map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    // Two players join
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    // No reveals; advance time and finalize
    advanceTime(blockchain, 20);
    await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    // State should be canceled (4)
    const state = await lobby.getState();
    expect(state).toBe(4);
    // Both players should be able to refund
    for (let i = 0; i < 2; i++) {
      const status = await lobby.getPlayerStatus(players[i].address);
      // tuple: (hasJoined, revealed, refundAllowed)
      expect(status[2]).toBe(true);
      await lobby.send(players[i], { value: toNano('0.1') }, { $$type: 'Refund' });
      const claim = await lobby.getClaimable(players[i].address);
      expect(claim).toBe(stake);
    }
  });

  test('double finalize should revert', async () => {
    const { lobby, lobbyId } = await deployLobby(10, 10);
    const secrets: Buffer[] = [Buffer.from('aa'), Buffer.from('bb')];
    const commits = players.slice(0, 2).map((p, i) => computeCommit(secrets[i], lobbyId, p.address));
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: stake + toNano('0.1') }, { $$type: 'Join', commit: commits[i] });
    }
    // Both reveal
    for (let i = 0; i < 2; i++) {
      await lobby.send(players[i], { value: toNano('0.1') }, { $$type: 'Reveal', secret: secrets[i] });
    }
    advanceTime(blockchain, 20);
    await lobby.send(players[0], { value: toNano('0.1') }, { $$type: 'Finalize' });
    // Second finalize should fail
    const res = await lobby.send(players[1], { value: toNano('0.1') }, { $$type: 'Finalize' });
    expect(res.exitCode).not.toBeUndefined();
  });
});
