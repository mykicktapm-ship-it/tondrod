# TON‑RODY Contract Package

This package contains the smart contracts for the TON‑RODY protocol and a
test harness built around [Tact](https://github.com/tact-lang/tact) and
the [`@ton-community/sandbox`](https://github.com/ton-community/sandbox).
The goal of this package is to be entirely self‑contained so that it can
be cloned and executed on a clean machine without any additional
configuration.

## Requirements

- **Node.js LTS** (version 20 or newer).
- [**pnpm**](https://pnpm.io/) package manager (version 9.x).  The
  project uses a `pnpm-workspace.yaml` at the monorepo root, but you
  can work on the contracts package in isolation by passing `-C
  contracts` to `pnpm`.

## Installation

Install the dependencies once:

```sh
pnpm install
```

> The `package.json` pins the versions of **tact** (via
> `@tact-lang/compiler`), **ton?core** and **@ton-community** packages
> so that contract compilation and tests are reproducible.  Do not update
> these dependencies without a thorough audit.

## Building the contracts

Compile the Tact sources into TypeScript wrappers and ABI using:

```sh
pnpm -C contracts build
```

The compiled files will be emitted into the `build/` directory.  A
pre‑test check ensures that these artefacts exist; if they are
missing the tests will fail immediately.

## Running tests

Tests are written with Jest and exercise the full state machine of
`TonRodyLobby` as well as economic invariants.  To execute all tests
run:

```sh
pnpm -C contracts test
```

This command will compile the contracts (via the `build` script) and
then run Jest.  The test harness uses the Blueprint sandbox from
`@ton-community/sandbox`, so no external TON node is required.  If the
`build/` directory is missing any artefacts the test suite will
immediately fail.

## Notes

- **Do not use `npm`** in this package.  All scripts are designed to be
  executed with **pnpm** and rely on its workspace features.
- You can run individual tests or enable watch mode via `pnpm -C
  contracts jest --watch`.
- When adding new contracts ensure they are registered in
  `tact.config.json` so that the `build` script picks them up.
