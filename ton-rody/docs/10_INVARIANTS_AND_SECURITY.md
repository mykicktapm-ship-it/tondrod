# Invariants and Security Assumptions

The TON‑RODY system is designed to be non‑custodial and fair. The following invariants should always hold:

1. **Funds remain on‑chain** – Stake and pot balances are held in the game contract and cannot be moved by the backend or UI. Only the contract’s logic dictates how funds are distributed.
2. **Deterministic winner selection** – The winner is derived from a robust commit–reveal scheme. Each player generates a secret locally and computes a commitment off‑chain as `hash(secret || gameId || playerAddress)`. On reveal, the contract recomputes the hash to verify the commitment and records `hash(secret)` as the reveal hash. When all players reveal, the random value used to pick the winner is the hash of the concatenation of the game ID, the reveal hashes and immutable game parameters (such as the join deadline and stake). If exactly one player reveals before the reveal deadline, that player wins automatically and the non‑revealer forfeits their stake. This approach prevents manipulation by miners or the contract owner and encourages honest participation. If no players reveal, the game is canceled and stakes can be refunded.
3. **No double joins/reveals** – Contracts enforce that an address can only join once and reveal once per game.
4. **No double payouts** – The contracts track payouts via a `claimable` mapping. If a push payment bounces, the recipient must explicitly claim the funds. Payouts and refunds cannot be claimed twice.
5. **Deadlines enforce progress** – Join and reveal deadlines ensure games cannot remain in limbo. After deadlines expire the next phase can be triggered by any user.
6. **Backend cannot steal** – The backend never holds private keys for user funds or contract balances. Its only privileged operations are to register games and help build transaction payloads.

## Security Considerations

* **Secret management** – Players must store their secrets locally and never share them with the backend. Loss of the secret means forfeiting the right to influence randomness and may lead to forfeiting their stake.
* **Replay protection** – The API should enforce idempotency using the `Idempotency-Key` header to avoid double creations or joins.
* **Rate limiting** – API endpoints are rate‑limited per IP. Additional checks can be implemented using Telegram ID and wallet address to mitigate spam or Sybil attacks.
* **Telegram initData verification** – The backend must verify the Telegram payload using the bot secret to prevent spoofing of user identities.
* **TON proof verification** – Wallet linking must validate that the user controls the wallet address. The stub implementation should be replaced with a proper TON proof verification.