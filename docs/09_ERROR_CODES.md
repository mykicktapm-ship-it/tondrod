# Error Codes

The API returns JSON objects with an `error` field when requests fail. The value is a human‑readable string, not a machine code. Below are common error messages:

| Error message             | HTTP status | Description                                                                             |
|---------------------------|-------------|-----------------------------------------------------------------------------------------|
| `Unauthorized`            | 401         | The JWT is missing or invalid.                                                         |
| `Too Many Requests`       | 429         | Rate limiting was triggered.                                                           |
| `initData required`       | 400         | The Telegram `initData` was not provided in the request.                               |
| `Invalid initData`        | 401         | Telegram auth failed.                                                                  |
| `tonProof required`       | 400         | A wallet linking request did not include a proof.                                      |
| `Invalid tonProof`        | 401         | The TON proof could not be verified.                                                  |
| `wallet already linked`   | 409         | The provided wallet address is linked to a different user.                            |
| `missing params`          | 400         | A create or join request is missing required fields.                                   |
| `not found`               | 404         | The requested resource (lobby, coin flip, proof) does not exist.                      |
| `duplicate`               | 400         | A user attempted to join a lobby or coin flip twice.                                   |
| `commitHash required`     | 400         | A join request did not include the commit hash.                                        |

In addition to these application‑level errors, smart contracts may revert transactions if conditions are not met (e.g. insufficient stake, duplicate join, reveal after deadline). These reverts manifest as bounced messages on‑chain and result in pending claimable balances.