# Do-Not-Break Rules

This file documents the non-negotiable invariants that prevent a fix in one
area from silently breaking another.

## Contract ABI (frozen)

- Do not change the order or types in `getLobbyMeta()` or `getParams()`.
- Do not change the format of `getLobbyIds()` (must be a cell of 257-bit ints).
- Do not change winner encoding (either `Address?` or zero address, consistently).
- Do not remove `getCommit(addr)` from the lobby contract.

Factory getters:
- `getLobbyCount(): Int`
- `getLobbyIds(offset: Int, limit: Int): cell`
- `getLobbyMeta(id: Int): (Bool, Int, Address, Address, Int, Int, Int)`
- `getLatestLobbies(limit: Int): cell`

Lobby getters:
- `getState(): Int`
- `getParams(): (owner, stakeNano, maxPlayers, joinDeadline, revealDeadline, feeBps, feeRecipient, lobbyId, totalPotNano, playersCount)`
- `getWinner(): Address?` (or zero address, but be consistent)
- `getClaimable(addr): Int`
- `getCommit(addr): Int`

## Indexer decoding (single module)

- All TON stack decoding must live in `services/indexer/src/ton/getters.ts`.
- No ad-hoc `stack.pop()` or `instanceof Cell` decoding elsewhere.

## UI rules engine (single source of truth)

- UI action visibility must come from `apps/web/src/lib/lobbyRules.ts`.
- Components must not hardcode state checks for join/reveal/finalize/refund/claim.

## Mandatory checks before any PR

- `pnpm -C contracts test`
- Start the indexer and hit:
  - `/lobbies`
  - `/lobbies/:id/state`
- Open the web app and verify:
  - Join is not shown after the join deadline
  - Reveal is hidden without a local secret
  - Import validates secret against on-chain `getCommit()`
