import Fastify from 'fastify';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import TonRodyRegistry from './ton';
import Indexer from './indexer';
import { ZERO_ADDRESS } from './ton/getters';

dotenv.config();

function clampNonNegative(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function mapLobbyRow(row: any) {
  return {
    lobbyId: Number(row.lobby_id),
    address: row.address,
    creator: row.creator,
    createdAt: Number(row.created_at),
    stakeNano: row.stake_nano?.toString() ?? '0',
    maxPlayers: Number(row.max_players),
    joinDeadline: row.join_deadline ? Number(row.join_deadline) : 0,
    revealDeadline: row.reveal_deadline ? Number(row.reveal_deadline) : 0,
    feeBps: row.fee_bps ?? 0,
    feeRecipient: row.fee_recipient ?? ZERO_ADDRESS,
    state: row.state ?? 0,
    playersCount: row.players_count ?? 0,
    potNano: row.pot_nano?.toString() ?? '0',
    winner: row.winner ?? ZERO_ADDRESS,
  };
}

async function main() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const endpoint = process.env.TON_RPC_ENDPOINT;
  if (!endpoint) {
    throw new Error('TON_RPC_ENDPOINT not set');
  }
  const factory = process.env.FACTORY_ADDRESS;
  if (!factory) {
    throw new Error('FACTORY_ADDRESS not set');
  }

  const registry = new TonRodyRegistry(factory);
  const indexer = new Indexer(db, registry);
  await indexer.init();

  const fastify = Fastify({ logger: true });

  fastify.get('/lobbies', async (request) => {
    const query = request.query as any;
    const stateParam = query?.state;
    const limit = clampNonNegative(Number(query?.limit ?? 50), 50);
    const offset = clampNonNegative(Number(query?.offset ?? 0), 0);

    const params: any[] = [];
    let where = '';
    if (stateParam !== undefined) {
      const stateValue = Number(stateParam);
      if (!Number.isNaN(stateValue)) {
        params.push(stateValue);
        where = 'WHERE state = $1';
      }
    }

    const totalRes = await db.query(`SELECT COUNT(*) AS count FROM lobbies ${where}`, params);
    const total = Number(totalRes.rows[0].count);

    const limitOffsetParams = [...params, limit, offset];
    const limitOffsetSql = params.length === 0 ? 'LIMIT $1 OFFSET $2' : 'LIMIT $2 OFFSET $3';

    const rowsRes = await db.query(
      `SELECT * FROM lobbies ${where} ORDER BY created_at DESC ${limitOffsetSql}`,
      limitOffsetParams
    );

    return { items: rowsRes.rows.map(mapLobbyRow), total };
  });

  fastify.get('/lobbies/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    if (Number.isNaN(id)) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    const { rows } = await db.query('SELECT * FROM lobbies WHERE lobby_id = $1', [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    return mapLobbyRow(rows[0]);
  });

  fastify.get('/lobbies/:id/state', async (request, reply) => {
    const id = Number((request.params as any).id);
    if (Number.isNaN(id)) {
      return reply.code(400).send({ error: 'invalid id' });
    }
    const { rows } = await db.query(
      'SELECT state, players_count, pot_nano, winner FROM lobbies WHERE lobby_id = $1',
      [id]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    const row = rows[0];
    return {
      state: row.state ?? 0,
      playersCount: row.players_count ?? 0,
      potNano: row.pot_nano?.toString() ?? '0',
      winner: row.winner ?? ZERO_ADDRESS,
    };
  });

  fastify.get('/stats/global', async () => {
    const { rows } = await db.query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN state IN (1, 2) THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN state = 3 THEN 1 ELSE 0 END) AS finalized,
        SUM(CASE WHEN state = 4 THEN 1 ELSE 0 END) AS canceled,
        COALESCE(SUM(pot_nano), 0) AS pot_nano
      FROM lobbies`
    );
    const row = rows[0];
    return {
      total: Number(row.total),
      active: Number(row.active),
      finalized: Number(row.finalized),
      canceled: Number(row.canceled),
      potNano: row.pot_nano?.toString() ?? '0',
    };
  });

  const port = Number(process.env.PORT || 3002);
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Indexer API listening on ${port}`);
}

main().catch((err) => {
  console.error('Failed to start indexer', err);
});
