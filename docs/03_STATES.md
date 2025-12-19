# State Machines

## Lobby Raffle

The lobby contract progresses through these states:

| State     | Description                                                                                                          |
|-----------|----------------------------------------------------------------------------------------------------------------------|
| **OPEN**  | The lobby is accepting players. Participants send `Join(commit)` messages with their stake and a commit computed from their secret, the game ID and their address. |
| **LOCKED**| Either the join deadline has passed or the maximum number of players has been reached. Participants may reveal their secrets during this phase by providing the original secret used in the commit. |
| **FINALIZED** | The reveal period has ended and the contract has either selected a winner or canceled the game. If all players reveal, a deterministic random value derived from the reveal hashes and immutable game parameters selects the winner. If only some players reveal, those players win by default and non‑revealers forfeit their stake. |
| **CANCELED** | The owner canceled the lobby or not enough players joined before the deadline, or no one revealed their secret by the reveal deadline. Participants may refund their stake. |

## Coin Flip

| State     | Description                                                                                                                          |
|-----------|--------------------------------------------------------------------------------------------------------------------------------------|
| **OPEN**  | Waiting for the first and second player to join. Each must provide a commit and stake.                                              |
| **LOCKED**| Both players have joined. Participants may reveal their secrets during this phase by sending `Reveal(secret)` messages.              |
| **FINALIZED** | The reveal period has ended. If both players reveal, a deterministic random value derived from their secret hashes and game parameters determines the winner. If exactly one player reveals, that player wins automatically and the non‑revealer forfeits their stake. |
| **CANCELED** | The owner canceled the game, the join deadline expired with only one player, or neither player revealed their secret by the reveal deadline. Players can refund their stake. |

State transitions are enforced by the smart contracts, ensuring a deterministic progression and preventing double actions.