import { describe, expect, it } from "@effect/vitest";
import { type OrderId, ReplayRpcs, type SessionId } from "@paperlion/contracts";
import { Effect, Layer } from "effect";
import { RpcTest } from "effect/rpc";
import { ReplayRpcsLive } from "../src/replay/rpc-handlers.ts";
import { SessionStoreInMemory } from "../src/replay/session-store.ts";
import { WARMUP_BARS } from "../src/replay/session.ts";
import { bar, flat } from "./support/bars.ts";
import {
  SCRIPTED_DATE,
  SCRIPTED_INSTRUMENT,
  scriptedPriceSource,
} from "./support/scripted-price-source.ts";

// A flat warm-up at 100, then a dip to 95, a rally to 110, and a flat close at 108.
const DAY = [
  ...Array.from({ length: WARMUP_BARS }, (_, i) => flat(i, 100)),
  bar(WARMUP_BARS, [100, 100, 95, 96]),
  bar(WARMUP_BARS + 1, [96, 110, 96, 109]),
  flat(WARMUP_BARS + 2, 108),
  flat(WARMUP_BARS + 3, 108),
];

const makeClient = () => RpcTest.makeClient(ReplayRpcs);

const run = <A, E>(
  f: (client: Effect.Success<ReturnType<typeof makeClient>>) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const client = yield* makeClient();
    return yield* f(client);
  }).pipe(
    Effect.provide(
      ReplayRpcsLive.pipe(Layer.provide([scriptedPriceSource(DAY), SessionStoreInMemory])),
    ),
  );

const practice = { pick: { instrumentId: SCRIPTED_INSTRUMENT, date: SCRIPTED_DATE } };

describe("ReplayRpcs", () => {
  it.effect("starts a blind session that shows only the warm-up bars and hides the stock", () =>
    Effect.gen(function* () {
      const view = yield* run((client) => client.StartSession({}));
      expect(view.mode).toBe("blind");
      expect(view.status).toBe("running");
      expect(view.bars).toHaveLength(WARMUP_BARS);
      expect(view.totalBars).toBe(DAY.length);
      expect(view.reveal).toBeNull();
      expect(view.equity).toBe(view.startingCash);
    }),
  );

  it.effect("shows the stock and date at once in a practice session", () =>
    Effect.gen(function* () {
      const view = yield* run((client) => client.StartSession(practice));
      expect(view.mode).toBe("practice");
      expect(view.reveal).toEqual({
        instrumentId: SCRIPTED_INSTRUMENT,
        name: "Test One",
        date: SCRIPTED_DATE,
      });
    }),
  );

  it.effect("fails with DataUnavailable when the picked day does not exist", () =>
    Effect.gen(function* () {
      const error = yield* run((client) =>
        client.StartSession({ pick: { instrumentId: SCRIPTED_INSTRUMENT, date: "1999-01-01" } }),
      ).pipe(Effect.flip);
      expect(error._tag).toBe("DataUnavailable");
    }),
  );

  it.effect("never returns bars past the clock", () =>
    Effect.gen(function* () {
      const views = yield* run((client) =>
        Effect.gen(function* () {
          const started = yield* client.StartSession({});
          const advanced = yield* client.AdvanceSession({ sessionId: started.id, bars: 1 });
          const reloaded = yield* client.GetSession({ sessionId: started.id });
          return { advanced, reloaded };
        }),
      );
      expect(views.advanced.bars).toHaveLength(WARMUP_BARS + 1);
      expect(views.advanced.bars.at(-1)?.close).toBe(96);
      expect(views.reloaded).toEqual(views.advanced);
    }),
  );

  it.effect("fills a resting limit when the clock crosses it and marks the position", () =>
    Effect.gen(function* () {
      const view = yield* run((client) =>
        Effect.gen(function* () {
          const { id: sessionId } = yield* client.StartSession({});
          yield* client.PlaceOrder({
            sessionId,
            side: "BUY",
            product: "MIS",
            type: "LIMIT",
            qty: 10,
            price: 97,
          });
          return yield* client.AdvanceSession({ sessionId, bars: 2 });
        }),
      );
      expect(view.orders[0]?.status).toBe("filled");
      expect(view.fills[0]).toMatchObject({ price: 97, minute: WARMUP_BARS });
      expect(view.positions[0]).toMatchObject({ qty: 10, avgPrice: 97, unrealisedPnl: 120 });
      expect(view.equity).toBe(view.cash + 10 * 109);
    }),
  );

  it.effect("rejects an order the engine refuses and leaves the session untouched", () =>
    Effect.gen(function* () {
      const outcome = yield* run((client) =>
        Effect.gen(function* () {
          const { id: sessionId } = yield* client.StartSession({});
          const error = yield* client
            .PlaceOrder({ sessionId, side: "SELL", product: "CNC", type: "MARKET", qty: 1 })
            .pipe(Effect.flip);
          const view = yield* client.GetSession({ sessionId });
          return { error, view };
        }),
      );
      expect(outcome.error).toMatchObject({ _tag: "OrderRejected" });
      expect(outcome.view.orders).toHaveLength(0);
    }),
  );

  it.effect("cancels an open order and reports an unknown one", () =>
    Effect.gen(function* () {
      const outcome = yield* run((client) =>
        Effect.gen(function* () {
          const { id: sessionId } = yield* client.StartSession({});
          const placed = yield* client.PlaceOrder({
            sessionId,
            side: "BUY",
            product: "MIS",
            type: "LIMIT",
            qty: 10,
            price: 90,
          });
          const orderId = placed.orders[0]?.id ?? ("" as OrderId);
          const cancelled = yield* client.CancelOrder({ sessionId, orderId });
          const again = yield* client.CancelOrder({ sessionId, orderId }).pipe(Effect.flip);
          return { cancelled, again };
        }),
      );
      expect(outcome.cancelled.orders[0]?.status).toBe("cancelled");
      expect(outcome.again._tag).toBe("OrderNotFound");
    }),
  );

  it.effect("finishes on request: squares off, reveals the stock, and stops taking orders", () =>
    Effect.gen(function* () {
      const outcome = yield* run((client) =>
        Effect.gen(function* () {
          const { id: sessionId } = yield* client.StartSession({});
          yield* client.PlaceOrder({
            sessionId,
            side: "BUY",
            product: "MIS",
            type: "MARKET",
            qty: 10,
          });
          yield* client.AdvanceSession({ sessionId, bars: 2 });
          const finished = yield* client.FinishSession({ sessionId });
          const late = yield* client
            .PlaceOrder({ sessionId, side: "BUY", product: "MIS", type: "MARKET", qty: 1 })
            .pipe(Effect.flip);
          const stuck = yield* client.AdvanceSession({ sessionId, bars: 1 }).pipe(Effect.flip);
          return { finished, late, stuck };
        }),
      );
      expect(outcome.finished.status).toBe("finished");
      expect(outcome.finished.reveal?.name).toBe("Test One");
      expect(outcome.finished.positions[0]?.qty).toBe(0);
      expect(outcome.finished.fills).toHaveLength(2);
      expect(outcome.finished.equity).toBe(outcome.finished.cash);
      expect(outcome.late._tag).toBe("SessionFinished");
      expect(outcome.stuck._tag).toBe("SessionFinished");
    }),
  );

  it.effect("finishes by itself when the clock reaches the end of the day", () =>
    Effect.gen(function* () {
      const view = yield* run((client) =>
        Effect.gen(function* () {
          const { id: sessionId } = yield* client.StartSession({});
          yield* client.PlaceOrder({
            sessionId,
            side: "SELL",
            product: "MIS",
            type: "MARKET",
            qty: 5,
          });
          return yield* client.AdvanceSession({ sessionId, bars: 999 });
        }),
      );
      expect(view.status).toBe("finished");
      expect(view.bars).toHaveLength(DAY.length);
      expect(view.positions[0]?.qty).toBe(0);
      expect(view.reveal).not.toBeNull();
    }),
  );

  it.effect("fails with SessionNotFound for an unknown session", () =>
    Effect.gen(function* () {
      const error = yield* run((client) =>
        client.GetSession({ sessionId: "missing" as SessionId }),
      ).pipe(Effect.flip);
      expect(error._tag).toBe("SessionNotFound");
    }),
  );
});
