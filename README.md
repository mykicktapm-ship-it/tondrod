# TON-RODY

TON‑RODY is a decentralized gaming platform built on the TON blockchain.  It includes a Telegram Mini App and a web application for lobby raffles and coin flip games using commit–reveal randomness.  This repository is a monorepo with separate packages for the frontend (Next.js) and the backend (Fastify) as well as smart contracts written in Tact.

## Prerequisites

- Node.js 20 or newer
- pnpm package manager
- Docker and Docker Compose
- A PostgreSQL database (can be run via Docker)

## Setup

1. Clone this repository.
2. Install dependencies for all packages:

```sh
pnpm install
```

3. Copy `.env.example` to `.env` and fill in the required environment variables such as database connection, Telegram bot token, JWT secret and TON API keys.
4. Run Prisma migrations to prepare the database:

```sh
pnpm --filter services/api prisma:generate
pnpm --filter services/api migrate
```

5. Start the database service (via Docker Compose) and run the backend and frontend:

```sh
docker-compose up -d db
pnpm --filter services/api dev
pnpm --filter apps/web dev
```

The API server will start on port 3001 by default and the Next.js app will start on port 3000.  The Telegram Mini App must point to your deployed web host and you must set the `NEXT_PUBLIC_TON_CONNECT_MANIFEST_URL` environment variable to the public URL of `tonconnect-manifest.json`.

### Running the registry indexer

This repository includes an **indexer** service that synchronises lobby metadata
from the on‑chain `TonRodyFactory` contract into a PostgreSQL table.  The
indexer exposes a REST API (`/lobbies`, `/lobbies/:id`, `/lobbies/:id/state`,
`/stats/global`) for the frontend to consume.  To run the indexer you need
to configure the TON RPC endpoint and the factory address in the environment.

1. Create a file `services/indexer/.env` with the following variables:

   ```
   # PostgreSQL connection string (the same database as the API or a separate one)
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tonrody

   # TON RPC endpoint and optional API key
   TON_RPC_ENDPOINT=https://toncenter.com/api/v2
   # TON_API_KEY=<your toncenter api key if required>

   # On‑chain factory contract address (friendly address)
   FACTORY_ADDRESS=<factory contract address>

   # HTTP port for the indexer
   PORT=3002

   # Polling interval in milliseconds
   INDEX_INTERVAL=30000
   ```

2. Install dependencies and build the indexer:

   ```sh
   pnpm --filter services/indexer install
   pnpm --filter services/indexer build
   ```

3. Start the indexer in development mode (or use the root script `pnpm indexer:dev`):

   ```sh
   pnpm --filter services/indexer dev
   ```

   Or from the repo root:

   ```sh
   pnpm indexer:dev
   ```

   The indexer will connect to the TON network, fetch lobby metadata from the
   factory and update the `lobbies` table in PostgreSQL.  The REST API is
   available at `http://localhost:3002` by default.

### Running the smart‑contract test suite

The `contracts` package contains the Tact smart contracts and Jest tests.
To build the contracts and run the test suite on a clean machine, execute:

```sh
pnpm install
pnpm -C contracts test
```

This command compiles all contracts using the pinned version of the Tact
compiler and then runs Jest.  The tests include economic invariants such
as pot conservation and prevention of double claims or finalisations.

## Repository structure

```
ton-rody/
  README.md              – this file
  .env.example          – example environment variables
  docker-compose.yml    – services for development (PostgreSQL)
  pnpm-workspace.yaml   – monorepo workspace configuration
  package.json          – root package configuration
  apps/
    web/                – Next.js frontend
  services/
    api/                – Fastify backend with Prisma
  contracts/
    tact/               – Smart contracts in Tact
  docs/                 – Documentation
```

See the documentation in the `docs` directory for more details about the architecture, state machines and security.