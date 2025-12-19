# UI ↔ Contract Mapping

This document maps high‑level user actions in the frontend to the underlying API endpoints and smart contract messages. Only the most important flows are included.

| UI action             | API endpoint                    | Wallet transaction                                   | Contract message                 |
|-----------------------|---------------------------------|----------------------------------------------------|----------------------------------|
| Create lobby          | `POST /v1/lobbies`              | *(none – contract deployed off‑chain or via factory)* | *(deployment via scripts or factory)* |
| Join lobby            | `POST /v1/lobbies/:id/join`     | to: contract, amount: stake + gas, payload: `JOIN(commit)` | `Join(commit)`                  |
| Reveal secret         | `POST /v1/lobbies/:id/reveal`   | to: contract, amount: gas, payload: `REVEAL(secret)` | `Reveal(secret)`               |
| Lock lobby            | `POST /v1/lobbies/:id/lock`     | to: contract, amount: gas, payload: `LOCK`         | `Lock()`                      |
| Finalize lobby        | `POST /v1/lobbies/:id/finalize` | to: contract, amount: gas, payload: `FINALIZE`     | `Finalize()`                  |
| Refund stake          | `POST /v1/lobbies/:id/refund`   | to: contract, amount: gas, payload: `REFUND`       | `Refund()`                    |
| Claim payout/refund   | *(no API call; user clicks Claim)* | to: contract, amount: gas, payload: `CLAIM`       | `Claim()`                     |
| View proof            | `GET /v1/lobbies/:id/proof`     | *(none)*                                           | *(contract getters)*           |

## Conditions

Each contract call has conditions enforced by the smart contract and mirrored by the backend:

- **Join** – Allowed only while the lobby state is **OPEN** and the current time is before `joinDeadline`. A participant must not have already joined and must provide a commitment computed from their secret, the game ID and their wallet address.
- **Reveal** – Allowed only when the lobby state is **LOCKED** and the current time is before `revealDeadline`. A participant must have previously joined and not yet revealed. The provided secret must recompute to the stored commit. Participants who fail to reveal by the deadline forfeit their stake and cannot win.
- **Lock** – Anyone can lock a lobby once either `joinDeadline` has passed or the number of participants has reached `maxPlayers`. Lock transitions the lobby to the reveal phase.
- **Finalize** – Anyone can finalize once the `revealDeadline` has passed or all participants have revealed. If all players reveal, the contract derives a deterministic random value from the reveal hashes and immutable parameters to select a winner. If exactly one player reveals, that player wins automatically and non‑revealers’ stakes are forfeited. If no one reveals, the game is canceled and stakes may be refunded.
- **Refund** – Allowed only if the lobby has been canceled by the owner or the join phase ended with fewer than `minPlayersToRun`, or no one revealed their secret. Each participant can refund only once and only if they have not forfeited their stake.
- **Claim** – Allows recipients to claim any unpaid payouts or refunds if the initial push transfer bounced. Can be called after finalization or cancellation.

CoinFlip actions mirror those of lobbies but use `/v1/coinflip` routes.