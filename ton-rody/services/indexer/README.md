# TON‑RODY Indexer

The indexer is a read‑only service that synchronises lobby metadata and
state from the on‑chain `TonRodyFactory` and individual `TonRodyLobby`
contracts into a PostgreSQL database.  It exposes a REST API to
provide the frontend with a list of active lobbies and their
properties without requiring direct chain access.

## Features

- Polls the factory contract for new lobby IDs and inserts
  corresponding metadata into the database
- Polls each lobby contract for dynamic state (state, players
  count, deadlines, pot, winner) and updates the database
- Exposes REST endpoints:
  - `GET /lobbies` – list lobbies with optional query parameters:
    - `state`: filter by lobby state (1=OPEN, 2=REVEALING, 3=FINALIZED, 4=CANCELED)
    - `limit`: number of lobbies to return (default 20, max 100)
    - `offset`: pagination offset
  - `GET /lobbies/:id` – return lobby metadata by ID
  - `GET /lobbies/:id/state` – query on‑chain state directly
  - `GET /stats/global` – aggregate statistics across lobbies
- No secret storage and no transaction signing; all operations are
  read‑only

## Environment

Create a `.env` file in this directory with the following variables:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tonrody
TON_RPC_ENDPOINT=https://toncenter.com/api/v2/jsonRPC
TON_API_KEY= # optional API key for toncenter
FACTORY_ADDRESS=<factory contract address>
PORT=3002
INDEX_INTERVAL=30000
```

You may run a local Postgres instance using the root `docker-compose.yml`
file:

```sh
docker-compose up -d db
```

## Usage

Install dependencies and build the TypeScript sources:

```sh
pnpm install
pnpm build
```

To run in development mode with TypeScript:

```sh
pnpm dev
```

To run the compiled JavaScript:

```sh
pnpm start
```

The indexer API will listen on `http://localhost:3002` by default.