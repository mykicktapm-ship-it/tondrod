# AUDIT_SOURCE_OF_TRUTH.md
(Truth source for agent. If anything conflicts, THIS file wins.)

## 0) Goal
Fix audit issues and make repo build+tests pass WITHOUT changing the overall architecture.
No “refactors for beauty”. Only auditable, minimal diffs.

## 1) Do-Not-Break Rules (non-negotiable)

### 1.1 Contract ABI (frozen)
- Do not change the order or types in `getLobbyMeta()` or `getParams()`.
- Do not change the format of `getLobbyIds()` (must be a cell of 257-bit ints).
- Do not remove `getCommit(addr)` from the lobby contract.
- Winner encoding must remain consistent everywhere (either `Address?` or zero-address, but do not mix).

Factory getters (must exist and keep signatures):
- `getLobbyCount(): Int`
- `getLobbyIds(offset: Int, limit: Int): cell`
- `getLobbyMeta(id: Int): (Bool, Int, Address, Address, Int, Int, Int)`
- `getLatestLobbies(limit: Int): cell`

Lobby getters (must exist and keep signatures):
- `getState(): Int`
- `getParams(): (owner, stakeNano, maxPlayers, joinDeadline, revealDeadline, feeBps, feeRecipient, lobbyId, totalPotNano, playersCount)`
- `getWinner(): Address?` (or zero address, but be consistent)
- `getClaimable(addr): Int`
- `getCommit(addr): Int`

### 1.2 Indexer decoding (single module)
- All TON stack decoding must live in `services/indexer/src/ton/getters.ts`.
- No ad-hoc stack decoding elsewhere.

### 1.3 UI rules engine (single source of truth)
- UI action visibility must come from `apps/web/src/lib/lobbyRules.ts`.
- Components must not hardcode state checks for join/reveal/finalize/refund/claim.

### 1.4 Tooling invariants (to prevent install failures)
- Root `package.json` MUST use a semver `packageManager`, e.g. `pnpm@9.12.3` (NOT `pnpm@8`).
- `pnpm-workspace.yaml` package paths MUST match the real folder structure on disk.

## 2) Audit requirements to implement (ordered)

### 2.1 Smart-contract rules
- Commit formula is FIXED and documented:
  `commit = SHA-256(secret || lobbyId || playerAddress)`
  Use one canonical serialization everywhere (contract + tests + UI).
- Reject weak secrets: secret length MUST be >= 32 bytes (enforced by contract, validated by UI).
- Cancel rules:
  - `cancel()` only in `OPEN`
  - and must be disallowed after the first join (or equivalent clear restriction).
- Fee logic:
  - `feeBps` must be clamped/validated in `[50, 200]` (if this is the spec in docs).
  - Payouts must be pull-based, with no double-finalize / double-claim / drain paths.
- Must expose `getCommit(address)` getter for UI validation.

### 2.2 Contract tests
- Economic invariants:
  - `sum(claimable) == totalPot`
  - `deposits == fee + payouts`
  - cannot double finalize / double claim / drain
- Tests for weak secret rejection.
- Tests for cancel window.
- Tests verifying deterministic commit hash and `getCommit()`.

### 2.3 Backend / indexer (read-only)
- Implement TON Proof validation and Telegram payload validation (wallet↔telegram 1:1).
- Add Idempotency-Key handling, replay protection, and rate-limits for create/join.
- Expose getters needed by UI validation (read-only).

### 2.4 Frontend / UI
- Use `getCommit()` to validate import.
- Reveal is hidden if no local secret exists.
- Secret storage:
  - store in IndexedDB (optionally encrypted) keyed by `${lobbyAddress}:${walletAddress}`
  - export (text/QR) and import with validation vs on-chain commit.
- UI must clearly show that join is blocked without proofs.

## 3) Definition of Done (must pass)
- `pnpm -C contracts test` passes.
- Indexer endpoints work:
  - `/lobbies`
  - `/lobbies/:id/state`
- Web app checks:
  - Join not shown after join deadline
  - Reveal hidden without local secret
  - Import validates secret against on-chain `getCommit()`
