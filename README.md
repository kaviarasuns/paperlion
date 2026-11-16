# PaperLion

Paper trading on virtual money, built around replaying one past market session bar by bar.

This is step 1 of the build: the engine and a replay screen running on **synthetic fixture
prices**. There is no market data, no Kite connection, no accounts and no database yet.

## Run it

Needs Node 24.22.1 (see `.node-version`) and pnpm 10 via corepack.

```sh
corepack enable
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. The API listens on http://127.0.0.1:4000. Both bind to loopback only.

Sessions live in the API's memory, so they are lost whenever the API restarts.

## Checks

```sh
pnpm exec vp fmt --check
pnpm exec vp lint
pnpm -r typecheck
pnpm -r test
```

## Layout

| Path | What it holds |
|---|---|
| `packages/contracts` | Shared types, errors and the RPC contract |
| `packages/client` | Browser RPC client |
| `apps/api/src/engine` | Order simulator, charges, portfolio. Pure functions, no I/O |
| `apps/api/src/market` | `PriceSource` and the fixture implementation |
| `apps/api/src/replay` | Replay session: clock, store, RPC handlers |
| `apps/web` | Start page and the session screen |

## How fills work

- **Market** fills at once at the last visible close, with 5 bps of slippage against you.
- **Limit** fills when a later bar trades through the price; a gap past it fills at the open.
- **SL-M** fills at the trigger (or the open, on a gap) with slippage.
- **SL** fills at the trigger if that is inside the limit; otherwise it waits as a limit order.
- Charges follow a Zerodha-like NSE equity schedule in `apps/api/src/engine/charges.ts`.
  The rates are unverified against the current schedule.
- Intraday (MIS) needs 20% margin and allows shorting. Delivery (CNC) needs full cash and cannot short.
