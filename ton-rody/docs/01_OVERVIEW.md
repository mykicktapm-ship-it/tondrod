# Overview

TON‑RODY is a monorepo implementing a provably‑fair gaming platform on TON. It comprises:

* **Smart contracts** written in Tact that implement the game logic for lobby raffles and coin flips.
* **Backend API** built with Fastify and Prisma, providing REST endpoints for authentication, lobby management and on‑chain transaction orchestration.
* **Frontend applications** built with Next.js and React. These include a Telegram Mini App and a browser‑friendly web interface. The UI integrates TON Connect for wallet interactions and a local **secret vault** to keep user secrets safe. Secrets are generated client‑side and never leave the user’s device.
* **Infrastructure** scripts and configuration, including Docker, PNPM workspaces and Prisma migrations.

At a high level, the smart contracts are the single source of truth for all game funds and outcomes. The backend is responsible for verifying users (via Telegram and TON proofs), coordinating off‑chain data (such as lobby lists and commitment hashes) and indexing contract transactions. The frontend presents a clean user interface, generates commits and **secrets** locally, builds TON transaction payloads and guides the user through the game lifecycle without ever exposing the secrets to the backend.