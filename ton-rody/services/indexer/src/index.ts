import Fastify from 'fastify';
import dotenv from 'dotenv';
import { Pool } from 'pg';
// Use TonClient from @ton/ton.  This library provides a high‑level
// client for interacting with the TON RPC API.  Do not import
// TonClient from ton-core.
import { TonClient } from '@ton/ton';
import TonRodyRegistry from './ton';
import { ZERO_ADDRESS } from './ton/getters';
import Indexer from './indexer';

// Load environment variables from .env if present
dotenv.config();

async function main() {
  // Initialise Postgres connection pool
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  // Create TON client
  const endpoint = process.env.TON_RPC_ENDPOINT;
  if (!endpoint) {
    throw new Error('TON_RPC_ENDPOINT not set');
  }
  const client = new TonClient({ endpoint });
  const factory = process.env.FACTORY_ADDRESS;
  if (!factory) {
    throw new Error('FACTORY_ADDRESS not set');
  }
  const registry = new TonRodyRegistry(client, factory);
  // Start indexer
  const indexer = new Indexer(db, registry);
  await indexer.init();
  // Create Fastify server
  const fastify = Fastify({ logger: true });
  // List lobbies with optional state filter, limit and offset.  Returns
  // an object containing the items array and total count.  Join and
  // reveal deadlines are returned as Unix seconds.  stakeNano and
  // potNano are returned as strings to avoid precision loss.
  fastify.get('/lobbies', async (request, reply) => {
    const q = request.query as any;
    const limit = q?.limit ? Math.min(parseInt(q.limit, 10) || 20, 100) : 20;
    const offset = q?.offset ? parseInt(q.offset, 10) || 0 : 0;
    const stateFilter = q?.state ? parseInt(q.state, 10) : null;
    const params: any[] = [];
    let where = '';
    if (stateFilter !== null && !isNaN(stateFilter)) {
      where = `WHERE state = $${params.length + 1}`;
      params.push(stateFilter);
    }
    // total count for pagination
    const totalRes = await db.query(`SELECT COUNT(*) AS count FROM lobbies ${where}`, params);
    const total = parseInt(totalRes.rows[0].count, 10);
    // build query with limit/offset
    const query = `
      SELECT * FROM lobbies
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    const runParams = params.slice();
    runParams.push(limit);
    runParams.push(offset);
    const { rows } = await db.query(query, runParams);
    const items = rows.map((r) => ({
      lobbyId: r.lobby_id,
      address: r.address,
      creator: r.creator,
      createdAt: Math.floor(new Date(r.created_at).getTime() / 1000),
      joinDeadline: r.join_deadline ? Math.floor(new Date(r.join_deadline).getTime() / 1000) : null,
      revealDeadline: r.reveal_deadline ? Math.floor(new Date(r.reveal_deadline).getTime() / 1000) : null,
      stakeNano: r.stake_nano ? r.stake_nano.toString() : (r.stake ? r.stake.toString() : '0'),
      maxPlayers: r.max_players,
      feeBps: r.fee_bps,
      feeRecipient: r.fee_recipient,
      state: r.state,
      playersCount: r.players_count,
      potNano: r.pot_nano ? r.pot_nano.toString() : (r.pot ? r.pot.toString() : '0'),
      winner: r.winner || ZERO_ADDRESS.toString(),
    }));
    return { items, total };
  });
  // Get lobby by id.  Return a Lobby object with numeric and string
  // fields aligned with the list.  If not found returns 404.
  fastify.get('/lobbies/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const { rows } = await db.query('SELECT * FROM lobbies WHERE lobby_id = $1', [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    const r = rows[0];
    return {
      lobbyId: r.lobby_id,
      address: r.address,
      creator: r.creator,
      createdAt: Math.floor(new Date(r.created_at).getTime() / 1000),
      joinDeadline: r.join_deadline ? Math.floor(new Date(r.join_deadline).getTime() / 1000) : null,
      revealDeadline: r.reveal_deadline ? Math.floor(new Date(r.reveal_deadline).getTime() / 1000) : null,
      stakeNano: r.stake_nano ? r.stake_nano.toString() : (r.stake ? r.stake.toString() : '0'),
      maxPlayers: r.max_players,
      feeBps: r.fee_bps,
      feeRecipient: r.fee_recipient,
      state: r.state,
      playersCount: r.players_count,
      potNano: r.pot_nano ? r.pot_nano.toString() : (r.pot ? r.pot.toString() : '0'),
      winner: r.winner || ZERO_ADDRESS.toString(),
    };
  });
  // Get on‑chain state for a lobby by id.  This queries the chain
  // directly rather than the DB for up‑to‑date status.  Returns
  // object with state, playersCount, totalPot and winner.
  fastify.get('/lobbies/:id/state', async (request, reply) => {
    const id = Number((request.params as any).id);
    const { rows } = await db.query('SELECT address FROM lobbies WHERE lobby_id = $1', [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    const addr: string = rows[0].address;
    try {
      const state = await registry.getLobbyState(addr);
      const params = await registry.getLobbyParams(addr);
      const winner = await registry.getLobbyWinner(addr);
      return {
        state,
        playersCount: params.playersCount,
        potNano: params.totalPotNano.toString(),
        winner: winner || ZERO_ADDRESS.toString(),
      };
    } catch (err) {
      return reply.code(500).send({ error: 'failed to fetch state' });
    }
  });
  // Global statistics: number of lobbies, number active, total pot, number finalised
  fastify.get('/stats/global', async () => {
    const totalRes = await db.query('SELECT COUNT(*) FROM lobbies');
    const total = parseInt(totalRes.rows[0].count, 10);
    const activeRes = await db.query('SELECT COUNT(*) FROM lobbies WHERE state IN (1,2)');
    const active = parseInt(activeRes.rows[0].count, 10);
    const finalizedRes = await db.query('SELECT COUNT(*) FROM lobbies WHERE state = 3');
    const finalized = parseInt(finalizedRes.rows[0].count, 10);
    const canceledRes = await db.query('SELECT COUNT(*) FROM lobbies WHERE state = 4');
    const canceled = parseInt(canceledRes.rows[0].count, 10);
    const potRes = await db.query('SELECT COALESCE(SUM(pot_nano),0) AS pot FROM lobbies');
    const potNano = BigInt(potRes.rows[0].pot).toString();
    return { total, active, finalized, canceled, potNano };
  });
  const port = Number(process.env.PORT || 3001);
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Indexer API listening on ${port}`);
}

main().catch((err) => {
  console.error('Failed to start indexer', err);
});