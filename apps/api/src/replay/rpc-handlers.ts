import {
  DataUnavailable,
  type OrderId,
  OrderNotFound,
  OrderRejected,
  ReplayRpcs,
  SessionFinished,
  type SessionId,
  SessionNotFound,
} from "@paperlion/contracts";
import { Effect, Random } from "effect";
import { randomUUID } from "node:crypto";
import { cancelOrder, DEFAULT_ENGINE_CONFIG, EMPTY_BOOK, placeOrder } from "../engine/order-sim.ts";
import { PriceSource } from "../market/price-source.ts";
import { type SessionRecord, SessionStore } from "./session-store.ts";
import { advance, finish, lastVisibleBar, STARTING_CASH, toView, WARMUP_BARS } from "./session.ts";

const config = DEFAULT_ENGINE_CONFIG;
const newOrderId = () => randomUUID() as OrderId;

export const ReplayRpcsLive = ReplayRpcs.toLayer(
  Effect.gen(function* () {
    const prices = yield* PriceSource;
    const store = yield* SessionStore;

    const load = (sessionId: SessionId) =>
      Effect.gen(function* () {
        const record = yield* store.find(sessionId);
        if (record === null) return yield* new SessionNotFound({ sessionId });
        const dayBars = yield* prices.dayBars(record.instrumentId, record.date);
        return { record, dayBars };
      });

    const loadRunning = (sessionId: SessionId) =>
      Effect.gen(function* () {
        const loaded = yield* load(sessionId);
        if (loaded.record.status === "finished") return yield* new SessionFinished({ sessionId });
        return loaded;
      });

    const saveAndView = (record: SessionRecord, dayBars: Parameters<typeof toView>[1]) =>
      store.save(record).pipe(Effect.as(toView(record, dayBars)));

    return {
      ListSessionChoices: () => prices.catalogue,

      StartSession: ({ pick }) =>
        Effect.gen(function* () {
          const catalogue = yield* prices.catalogue;
          const days = catalogue.flatMap((c) =>
            c.dates.map((date) => ({ instrumentId: c.instrumentId, name: c.name, date })),
          );
          const chosen =
            pick === undefined
              ? days[yield* Random.nextIntBetween(0, Math.max(0, days.length - 1))]
              : days.find((d) => d.instrumentId === pick.instrumentId && d.date === pick.date);
          if (chosen === undefined) {
            return yield* new DataUnavailable({
              message: "No trading day is available to replay.",
            });
          }
          const dayBars = yield* prices.dayBars(chosen.instrumentId, chosen.date);
          if (dayBars.length === 0) {
            return yield* new DataUnavailable({ message: "That trading day has no bars." });
          }
          const record: SessionRecord = {
            id: randomUUID() as SessionId,
            instrumentId: chosen.instrumentId,
            instrumentName: chosen.name,
            date: chosen.date,
            mode: pick === undefined ? "blind" : "practice",
            status: "running",
            cursor: Math.min(WARMUP_BARS, dayBars.length),
            startingCash: STARTING_CASH,
            book: EMPTY_BOOK,
          };
          return yield* saveAndView(record, dayBars);
        }),

      GetSession: ({ sessionId }) =>
        load(sessionId).pipe(Effect.map(({ record, dayBars }) => toView(record, dayBars))),

      AdvanceSession: ({ sessionId, bars }) =>
        Effect.gen(function* () {
          const { record, dayBars } = yield* loadRunning(sessionId);
          return yield* saveAndView(advance(record, dayBars, bars, config, newOrderId), dayBars);
        }),

      PlaceOrder: ({ sessionId, ...request }) =>
        Effect.gen(function* () {
          const { record, dayBars } = yield* loadRunning(sessionId);
          const result = placeOrder(record.book, request, {
            id: newOrderId(),
            lastBar: lastVisibleBar(record, dayBars),
            startingCash: record.startingCash,
            config,
          });
          if (result._tag === "rejected")
            return yield* new OrderRejected({ reason: result.reason });
          return yield* saveAndView({ ...record, book: result.book }, dayBars);
        }),

      CancelOrder: ({ sessionId, orderId }) =>
        Effect.gen(function* () {
          const { record, dayBars } = yield* loadRunning(sessionId);
          const book = cancelOrder(record.book, orderId);
          if (book === null) return yield* new OrderNotFound({ orderId });
          return yield* saveAndView({ ...record, book }, dayBars);
        }),

      FinishSession: ({ sessionId }) =>
        Effect.gen(function* () {
          const { record, dayBars } = yield* load(sessionId);
          return yield* saveAndView(finish(record, dayBars, config, newOrderId), dayBars);
        }),
    };
  }),
);
