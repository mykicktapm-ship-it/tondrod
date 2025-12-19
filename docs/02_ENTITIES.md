# Entities

The database schema is defined in Prisma and includes the following entities:

| Entity         | Description                                                                                                                                                                          |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **User**       | Represents a Telegram user. Identified by a UUID and stores the Telegram ID and username. A user may have one linked wallet.                                                         |
| **WalletLink** | Links a user to a TON wallet address. Stores timestamps for when the link was created and last changed and enforces a 24‑hour cooldown on relinking.                                 |
| **Lobby**      | Configuration and state for a lobby raffle game. Contains the stake amount, maximum and minimum player counts, deadlines, fee parameters and state machine status.                   |
| **LobbyParticipant** | Represents a user’s participation in a lobby. Stores the commitment hash computed from the player’s secret, game ID and address, timestamps for join and reveal, refund status and transaction hashes for join and reveal messages. The actual secret is never stored on the backend or contract; only the commitment and the hash of the revealed secret are recorded on‑chain.         |
| **CoinFlip**   | Similar to Lobby but simplified for two players. Stores stake and deadlines.                                                                                                         |
| **CoinFlipParticipant** | Stores commitment and reveal information for a coin flip participant. Similar to lobby participants, the commit binds the secret to the game ID and address. The reveal records the hash of the secret to enable deterministic winner selection. |
| **Payout**     | Tracks payout and refund transactions. Indicates whether a payout is pending, paid, failed or claimed and its kind (fee, win or refund).                                             |
| **AuditLog**   | Records sensitive actions and metadata for debugging and compliance.                                                                                                                 |
| **BlockList**  | Stores blocked IPs, wallet addresses or Telegram IDs with an optional reason.                                                                                                        |

Refer to `services/api/prisma/schema.prisma` for the authoritative schema definition.