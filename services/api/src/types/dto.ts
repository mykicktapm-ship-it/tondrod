/**
 * Data transfer objects (DTOs)
 *
 * Define interfaces for request and response payloads. These are
 * currently unused in the stub implementation but can help
 * developers understand expected shapes and enable static type
 * checking in a more complete implementation.
 */

export interface CreateLobbyRequest {
  stakeNano: string | number;
  maxPlayers: number;
  minPlayersToRun: number;
  joinDeadline: string;
  revealDeadline: string;
  feeBps: number;
  feeRecipient: string;
}

export interface CreateLobbyResponse {
  id: string;
  contractAddress: string;
}

export interface JoinLobbyRequest {
  commitHash: string;
}

export interface TxResponse {
  tx: any;
}