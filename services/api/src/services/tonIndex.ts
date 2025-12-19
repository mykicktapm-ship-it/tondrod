import TonProvider from './tonProvider';
import logger from '../logger';

/**
 * TON Indexer stub.
 *
 * Periodically polls the TON blockchain for updates to known game
 * contracts. In this stub, nothing happens. A real implementation
 * would maintain cursors per contract and emit events on state
 * transitions (join, reveal, finalize, refund).
 */
export class TonIndexer {
  private provider: TonProvider;
  private contracts: Set<string>;

  constructor(provider: TonProvider) {
    this.provider = provider;
    this.contracts = new Set();
  }
  registerContract(addr: string) {
    this.contracts.add(addr);
  }
  async poll() {
    // stub: log that a poll occurred
    logger.info({ msg: 'Index poll tick', contracts: Array.from(this.contracts) });
  }
}

export default {
  TonIndexer,
};