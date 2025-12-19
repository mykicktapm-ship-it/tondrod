/**
 * TonProvider stub
 *
 * Provides basic abstraction for interacting with TON network. The
 * real implementation should call TONAPI or toncenter. Here we
 * provide no-op implementations for compilation.
 */
export default class TonProvider {
  async getTransactions(address: string, fromLt?: string, limit: number = 20): Promise<any[]> {
    return [];
  }
  async getAccountState(address: string): Promise<any> {
    return {};
  }
  async getJettonBalance(address: string, jettonAddress: string): Promise<string> {
    return '0';
  }
}