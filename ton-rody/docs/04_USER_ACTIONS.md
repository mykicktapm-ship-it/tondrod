# User Actions

Players interact with TON‑RODY via the web or Telegram Mini App. The following actions are available:

## Authentication
1. **Login via Telegram** – The frontend reads Telegram `initData` and sends it to the API. The backend validates the data, creates or updates a User record and returns a JWT.
2. **Link wallet** – The user initiates a TON Connect proof flow. The backend verifies the proof and associates the wallet address with the user.

## Lobby Raffle
1. **Create lobby** – A logged‑in user calls `POST /v1/lobbies` with the stake and timing parameters. The backend records the lobby and returns its identifier and contract address. Deployment of the contract itself is handled off‑chain (either by a factory or a script).
2. **Join lobby** – Each participant locally generates a random **secret** (e.g. 32 bytes). Off‑chain the UI computes the commitment as `hash(secret || gameId || playerAddress)` and sends a `Join(commit)` transaction along with the stake via TON Connect. The backend stores only the commit and never sees the secret.
3. **Reveal secret** – After the lobby locks, participants reveal their secret by sending a `Reveal(secret)` transaction. The contract recomputes `hash(secret || gameId || sender)` to verify the commitment and records `hash(secret)` as the reveal hash. Secrets are never sent to the backend.
4. **Finalize** – Anyone may finalize a lobby once either all participants have revealed or the reveal deadline has passed. If all secrets are revealed, the contract derives a deterministic random value from the game ID, the reveal hashes and immutable game parameters to choose the winner. If exactly one participant reveals, that player wins automatically and non‑revealers forfeit their stake. If no one reveals, the game is canceled and stakes may be refunded.
5. **Refund** – If the lobby is canceled, the join phase does not attract enough players, or no secrets are revealed by the reveal deadline, participants can send a `Refund` transaction to reclaim their stake. Players who failed to reveal when required may forfeit their stake and cannot refund.
6. **Claim** – If a payout or refund fails because the recipient’s wallet was not ready to receive, the balance becomes claimable on the contract. Players may call `Claim` to pull their funds at any time.

## Coin Flip
The flow mirrors the lobby raffle but with two players. The first participant both creates and joins the game. Once the second player joins, the game is locked and proceeds to reveal and finalize.