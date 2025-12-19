# Events

The current Tact contracts do not emit explicit events. All state changes are observable via transactions and contract storage. An indexer can watch for specific opcodes and internal transfers to detect the following events:

* **Join** – A participant sent a `Join` message with sufficient stake.
* **Lock** – The lobby accepted no more players and entered the reveal phase.
* **Reveal** – A participant revealed their secret via a `Reveal` message. The contract verifies the commitment and records the hash of the secret.
* **Finalize** – The game was finalized. If all participants reveal, a deterministic random value is derived from their secret hashes and immutable parameters to pick a winner. If exactly one participant reveals by the deadline, that player wins automatically and non‑revealers forfeit their stake. If no one reveals, the game is canceled and players can refund their stake. Payouts and fees are sent or scheduled via claimable balances.
* **Refund** – A participant claimed their stake back after a cancel or failed join.
* **Claim** – A participant manually pulled their pending balance.

These events can be reconstructed by parsing inbound messages and checking the opcodes. In a future version, explicit event cells may be emitted for easier indexing.