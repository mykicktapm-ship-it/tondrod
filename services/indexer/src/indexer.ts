import { Pool } from 'pg';
import TonRodyRegistry from './ton';

const DEFAULT_SYNC_INTERVAL = 30000;

export class Indexer {
  private syncInterval: number;

  constructor(private db: Pool, private registry: TonRodyRegistry) {
    this.syncInterval = Number(process.env.INDEX_INTERVAL || DEFAULT_SYNC_INTERVAL);
  }

  async init() {
    await this.ensureTables();
    await this.sync();
    setInterval(() => this.sync().catch((err) => console.error(err)), this.syncInterval);
  }

  private async ensureTables() {
    await this.db.query(`CREATE TABLE IF NOT EXISTS lobbies (
      lobby_id BIGINT PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      creator TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      stake_nano BIGINT NOT NULL,
      max_players INTEGER NOT NULL,
      join_deadline BIGINT,
      reveal_deadline BIGINT,
      fee_bps INTEGER,
      fee_recipient TEXT,
      state INTEGER NOT NULL DEFAULT 0,
      players_count INTEGER NOT NULL DEFAULT 0,
      pot_nano BIGINT NOT NULL DEFAULT 0,
      winner TEXT,
      updated_at BIGINT NOT NULL
    )`);
  }

  private nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  private async upsertLobbyMeta(meta: { lobbyId: number; address: string; creator: string; createdAt: number; stakeNano: bigint; maxPlayers: number }) {
    const updatedAt = this.nowSeconds();
    await this.db.query(
      `INSERT INTO lobbies (lobby_id, address, creator, created_at, stake_nano, max_players, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (lobby_id) DO UPDATE SET
         address = EXCLUDED.address,
         creator = EXCLUDED.creator,
         created_at = EXCLUDED.created_at,
         stake_nano = EXCLUDED.stake_nano,
         max_players = EXCLUDED.max_players,
         updated_at = EXCLUDED.updated_at`,
      [meta.lobbyId, meta.address, meta.creator, meta.createdAt, meta.stakeNano.toString(), meta.maxPlayers, updatedAt]
    );
  }

  private async syncRegistry() {
    const count = await this.registry.getLobbyCount();
    const batchSize = 25;
    let offset = 0;
    while (offset < count) {
      const ids = await this.registry.getLobbyIds(offset, Math.min(batchSize, count - offset));
      for (const id of ids) {
        const meta = await this.registry.getLobbyMeta(id);
        if (!meta) continue;
        await this.upsertLobbyMeta(meta);
      }
      offset += batchSize;
    }
  }

  private async syncState() {
    const { rows } = await this.db.query('SELECT lobby_id, address FROM lobbies');
    for (const row of rows) {
      const address: string = row.address;
      const lobbyId: number = Number(row.lobby_id);
      try {
        const state = await this.registry.getLobbyState(address);
        const params = await this.registry.getLobbyParams(address);
        const winner = await this.registry.getLobbyWinner(address);
        const updatedAt = this.nowSeconds();
        await this.db.query(
          `UPDATE lobbies SET
            state = $1,
            players_count = $2,
            pot_nano = $3,
            winner = $4,
            join_deadline = $5,
            reveal_deadline = $6,
            fee_bps = $7,
            fee_recipient = $8,
            stake_nano = $9,
            max_players = $10,
            updated_at = $11
          WHERE lobby_id = $12`,
          [
            state,
            Number(params.playersCount),
            params.totalPotNano.toString(),
            winner,
            Number(params.joinDeadline),
            Number(params.revealDeadline),
            Number(params.feeBps),
            params.feeRecipient,
            params.stakeNano.toString(),
            Number(params.maxPlayers),
            updatedAt,
            lobbyId,
          ]
        );
      } catch (err) {
        console.error('failed to sync state for lobby', lobbyId, err);
      }
    }
  }

  public async sync() {
    try {
      await this.syncRegistry();
      await this.syncState();
    } catch (err) {
      console.error('sync error', err);
    }
  }
}

export default Indexer;
