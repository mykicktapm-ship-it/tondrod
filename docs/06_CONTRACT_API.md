# Contract API

Both the lobby and coin‑flip contracts share a common message schema. Each message begins with a 32‑bit opcode followed by zero or more fields. Commits and reveal secrets are handled differently to guarantee fairness and bind randomness to the game context.

## Messages

| Message      | Opcode    | Payload                                                                                                                     |
|--------------|----------:|----------------------------------------------------------------------------------------------------------------------------|
| **Join**     | 0x4A4F494E| `commit:uint256` – The commitment for the player’s secret. A commitment is calculated off‑chain as `hash(secret || gameId || playerAddress)` and must be a 256‑bit integer. |
| **Lock**     | 0x4C4F434B| *(no additional fields)*. Locks the lobby or coin‑flip once enough players have joined or the join deadline has passed.     |
| **Reveal**   | 0x5245564C| `secret:slice` – The original secret used when computing the commitment. The secret may be any byte string; the contract recomputes `hash(secret || gameId || sender)` to verify the commitment and stores `hash(secret)` as the reveal hash. |
| **Finalize** | 0x46494E41| *(no additional fields)*. Finalizes the game. If both players reveal, a deterministic random value is derived from the reveal hashes and immutable game parameters to select a winner. If only one player reveals, that player wins by default and the non‑revealer forfeits their stake. If no one reveals, the game is canceled and players may refund their stakes. |
| **Cancel**   | 0x43414E43| *(owner only)*. Cancels the game and allows participants to refund their stakes.                                           |
| **Refund**   | 0x52454655| *(no additional fields)*. Claims back the stake when a game is canceled or when the join phase failed to fill.              |
| **Claim**    | 0x434C4149| *(no additional fields)*. Pulls any unpaid payout or refund that bounced during push delivery.                               |

## Payload Examples

The following snippets illustrate how to build payloads using `ton-core`’s cell builder:

```
// Join (commit is a 256‑bit integer)
beginCell()
  .storeUint(0x4A4F494E, 32)  // opcode
  .storeUint(commit, 256)
  .endCell();

// Reveal (secret is stored as a slice; length is encoded automatically)
beginCell()
  .storeUint(0x5245564C, 32)
  .storeSlice(secret)
  .endCell();

// Lock, Finalize, Cancel, Refund, Claim all have no payload beyond the opcode
beginCell().storeUint(opcode, 32).endCell();
```

Payloads are encoded in BOC (Bag of Cells) format and passed to the wallet via TON Connect. The frontend uses `ton-core` to construct these cells and encodes them in base64 for inclusion in the transaction.