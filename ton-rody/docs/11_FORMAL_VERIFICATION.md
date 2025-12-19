# Formal Verification

This document summarizes how the smart contracts in TON‑RODY can be reasoned about and tested to provide confidence that they behave as intended. While fully automated formal verification for Tact contracts is still an evolving area, a combination of clear invariants, deterministic logic and comprehensive test suites enables a high degree of assurance.

## Key Invariants

The contracts enforce a number of invariants that ensure funds are safe and outcomes are fair. These invariants are documented in detail in `10_INVARIANTS_AND_SECURITY.md` and include:

* **On‑chain custody** – All stake and pot balances remain inside the game contract until distributed by the contract logic. The backend and UI can never move funds.
* **Deterministic winner selection** – The winner is derived from a commit–reveal scheme. Each commit binds a secret to the game ID and player address, and the random seed used to select a winner is computed only from the reveal hashes and immutable game parameters. If only one participant reveals, that participant wins by default; if none reveal, the game is canceled.
* **No double participation** – A player can only join a game once and reveal once. Duplicate joins or reveals are rejected.
* **No double payouts** – Payout and refund amounts are tracked in a `claimable` mapping. Once funds are sent or claimed, the mapping is zeroed to prevent re‑entrancy or double claims.
* **Progress is enforced** – Join and reveal deadlines ensure the game eventually locks and finalizes or cancels; games cannot be locked indefinitely.

These invariants are encoded directly in the Tact code using `require()` statements at the top of each receive handler. Formal verification efforts should focus on proving that these invariants hold in all reachable states of the contract.

## Commit–Reveal Correctness

The heart of the game logic is the commit–reveal protocol. Each player generates a secret off‑chain and computes a commitment as:

```
commit = hash(secret || gameId || playerAddress)
```

During the **Join** call, only the commitment is sent to the contract. During **Reveal**, the player provides the secret, and the contract recomputes the hash using the stored `gameId` and the sender’s address. This ensures that:

1. A commitment cannot be forged by another participant, because the player’s address is baked into the hash.
2. The contract does not need to store or expose the secret; it only stores `hash(secret)` as the reveal hash.
3. Changing the secret after committing is impossible, because any other secret will not hash to the same commitment.

Formal reasoning about this protocol involves showing that the only way to pass the reveal check is to provide the exact secret that produced the stored commitment.

## Randomness Derivation

When all participants have revealed, the contract derives a deterministic seed from on‑chain data:

```
seed = hash(gameId || revealHashP0 || revealHashP1 || joinDeadline || stakeNano)
```

The inclusion of immutable parameters (`joinDeadline` and `stakeNano`) ensures that the seed cannot be influenced by the order of transactions or by off‑chain actors. The use of `hash(secret)` rather than the raw secret preserves secrecy while still making the seed depend on both secrets. Because the seed is the output of a cryptographic hash function, it is unpredictable until all inputs are known.

If exactly one participant reveals, the winner is determined without computing the above seed: the revealed participant wins by default. If no one reveals, the contract cancels the game and allows refunds. These branches remove any incentive to withhold a reveal in the hope of a better outcome.

## State Transitions

The game contracts implement explicit state machines. For the coin flip, the states are `OPEN → LOCKED → FINALIZED` or `CANCELED`, while the lobby adds additional transitions for multiple players. The contracts enforce that:

* Transitions occur only in one direction (no loops back to OPEN).
* Each handler checks that it is called in the appropriate state and before the relevant deadline.
* Finalization and cancellation are mutually exclusive and can only occur once.

Formal verification should demonstrate that there are no reachable states where funds are lost, logic freezes, or payouts can occur multiple times.

## Double Spend and Re‑entrancy Prevention

All monetary transfers use a pull‑payment pattern. Payouts are first recorded in the `claimable` mapping and then sent via a push. If the push bounces, the `claimable` balance remains and can be claimed later. When a player calls `Claim`, the contract sets their `claimable` balance to zero before sending. This ordering prevents re‑entrancy attacks. A formal proof would show that the sum of all claimable balances plus the contract’s balance always equals the total pot plus any fees.

## Liveness and Safety

The deadlines `joinDeadline` and `revealDeadline` ensure liveness: the game cannot be stuck waiting for participants indefinitely. If players do not act in time, the contract automatically determines an outcome (winner by default or cancellation). Safety is maintained because players who do not reveal their secret forfeit their stake, discouraging denial‑of‑service by withholding reveals.

## Recommended Verification Practices

* **Model checking** – Encode the state machine and critical invariants in a model checker (e.g. [kwik](https://github.com/ton-community/kwik)) to explore all possible execution paths and verify invariants. Tact’s static type system and `require` statements help reduce the state space.
* **Property‑based tests** – Use Hardhat or blueprint to write property‑based tests that simulate random sequences of joins, reveals, cancellations and finalize calls. Assert that the pot is always conserved, winners match the specification and non‑revealers never win.
* **Manual audit** – Review the contract code line by line to ensure that each external call happens after state updates, that no hidden state changes occur and that all revert conditions match the intended logic.

By following these practices, developers and auditors can gain confidence that the TON‑RODY contracts implement a fair and deterministic gaming protocol and that any deviations from the specified behaviour would be caught during testing.