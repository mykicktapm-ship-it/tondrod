# TON‑RODY Web

This package contains the Next.js frontend for the TON‑RODY protocol.  It
displays a list of active lobbies, lobby details and provides a safe
commit–reveal user experience.  The UI derives allowed actions from
on‑chain state and local secret storage via `lobbyRules.ts`.

## Environment

Create a `.env.local` file in this directory with the following variables:

```env
# Base URL of the indexer service
NEXT_PUBLIC_API_BASE_URL=http://localhost:3002

# TON Connect manifest URL (used by tonconnect-ui)
NEXT_PUBLIC_TON_CONNECT_MANIFEST_URL=https://your.domain/tonconnect-manifest.json
```

## Development

Install dependencies and start the development server:

```sh
pnpm install
pnpm dev
```

The app will run at `http://localhost:3000`.  It will fetch lobby
lists from the indexer specified in `NEXT_PUBLIC_API_BASE_URL`.  If the
indexer is unavailable the UI can fall back to querying the
factory contract directly.

## Production

To build for production:

```sh
pnpm install
pnpm build
pnpm start
```

This will generate an optimised build in `.next/` and start a
production server.