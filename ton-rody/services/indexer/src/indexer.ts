import { Pool } from 'pg';
import TonRodyRegistry from './ton';

/**
 * Indexer
 *
 * Continuously synchronises on‑chain lobby metadata and state into a
 * PostgreSQL database.  The indexer polls the factory contract for
 * new lobbyIds and inserts them into the `lobbies` table.  It also
 * polls individual lobby contracts (via the registry) to update
 * mutable state such as the number of participants, pot size,
 * current state and winner.
 */
export class Indexer {
  private syncInterval: number;
  constructor(private db: Pool, private registry: TonRodyRegistry) {
    // default to 30 seconds
    this.syncInterval = parseInt(process.env.INDEX_INTERVAL || '30000');
  }
  async init() {
    await this.ensureTables();
    // Kick off a sync immediately
    await this.sync();
    // Schedule periodic sync
    setInterval(() => this.sync().catch((err) => console.error(err)), this.syncInterval);
  }
  private async ensureTables() {
    await this.db.query(`CREATE TABLE IF NOT EXISTS lobbies (
      lobby_id INTEGER PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      creator TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL,
      stake_nano BIGINT NOT NULL,
      max_players INTEGER NOT NULL,
      join_deadline INTEGER,
      reveal_deadline INTEGER,
      fee_bps INTEGER,
      fee_recipient TEXT,
      state INTEGER,
      players_count INTEGER,
      pot_nano BIGINT,
      winner TEXT,
      updated_at TIMESTAMP DEFAULT now()
    )`);
  }
  private async lobbyExists(lobbyId: number): Promise<boolean> {
    const res = await this.db.query('SELECT 1 FROM lobbies WHERE lobby_id = $1', [lobbyId]);
    return res.rowCount > 0;
  }
  private async insertLobby(meta: { lobbyId: number; address: string; creator: string; createdAt: number; stakeNano: number; maxPlayers: number }) {
    await this.db.query(
      `INSERT INTO lobbies (
        lobby_id, address, creator, created_at, stake_nano, max_players
      ) VALUES (
        $1, $2, $3, to_timestamp($4), $5, $6
      )`,
      [
        meta.lobbyId,
        meta.address,
        meta.creator,
        meta.createdAt,
        meta.stakeNano,
        meta.maxPlayers,
      ]
    );
  }
  /** Poll new lobby IDs and insert metadata */
  private async syncRegistry() {
    const count = await this.registry.getLobbyCount();
    const batchSize = 10;
    let offset = 0;
    while (offset < count) {
      const ids = await this.registry.getLobbyIds(offset, Math.min(batchSize, count - offset));
      for (const id of ids) {
        const exists = await this.lobbyExists(id);
        if (!exists) {
          const meta = await this.registry.getLobbyMeta(id);
          if (meta) {
            await this.insertLobby(meta);
          }
        }
      }
      offset += batchSize;
    }
  }
  /** Placeholder: update lobby state.  In a real implementation this
   * would call each lobby contract getter (getParams, getState,
   * getWinner) and update players_count, pot, state and winner
   * columns accordingly.  Because these getters are not exposed
   * through the registry wrapper, this function is left as a
   * no‑op.  It still demonstrates the pattern of iterating over
   * stored lobbies.
   */
  private async syncState() {
    const res = await this.db.query('SELECT lobby_id, address FROM lobbies');
    for (const row of res.rows) {
      const id: number = row.lobby_id;
      const addr: string = row.address;
      try {
        const state = await this.registry.getLobbyState(addr);
        const params = await this.registry.getLobbyParams(addr);
        const winner = await this.registry.getLobbyWinner(addr);
        await this.db.query(
          `UPDATE lobbies
           SET state = $1,
               players_count = $2,
               pot_nano = $3,
               winner = $4,
               join_deadline = $5,
               reveal_deadline = $6,
               fee_bps = $7,
               fee_recipient = $8,
               updated_at = NOW()
           WHERE lobby_id = $9`,
          [
            state,
            params.playersCount,
            params.totalPotNano,
            winner,
            params.joinDeadline || null,
            params.revealDeadline || null,
            params.feeBps,
            params.feeRecipient,
            id,
          ]
        );
      } catch (err) {
        console.error('failed to sync state for lobby', id, err);
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