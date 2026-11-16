import { describe, expect, it } from "@effect/vitest";
import type { InstrumentId } from "@paperlion/contracts";
import { Effect } from "effect";
import { FixturePriceSource, SESSION_MINUTES } from "../src/market/fixture-price-source.ts";
import { PriceSource } from "../src/market/price-source.ts";

const ALPHA = "FIX:ALPHA" as InstrumentId;

const dayBars = (instrumentId: InstrumentId, date: string) =>
  Effect.gen(function* () {
    const prices = yield* PriceSource;
    return yield* prices.dayBars(instrumentId, date);
  }).pipe(Effect.provide(FixturePriceSource));

describe("FixturePriceSource", () => {
  it.effect("produces a full session of well-formed one-minute bars", () =>
    Effect.gen(function* () {
      const bars = yield* dayBars(ALPHA, "2026-08-03");
      expect(bars).toHaveLength(SESSION_MINUTES);
      expect(bars.map((b) => b.minute)).toEqual(bars.map((_, i) => i));
      for (const b of bars) {
        expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
        expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
        expect(b.low).toBeGreaterThan(0);
      }
    }),
  );

  it.effect("returns the same bars every time for the same day", () =>
    Effect.gen(function* () {
      const first = yield* dayBars(ALPHA, "2026-08-04");
      const second = yield* dayBars(ALPHA, "2026-08-04");
      expect(second).toEqual(first);
    }),
  );

  it.effect("gives different days different prices", () =>
    Effect.gen(function* () {
      const monday = yield* dayBars(ALPHA, "2026-08-03");
      const tuesday = yield* dayBars(ALPHA, "2026-08-04");
      expect(tuesday.map((b) => b.close)).not.toEqual(monday.map((b) => b.close));
    }),
  );

  it.effect("fails with DataUnavailable for a day it does not have", () =>
    Effect.gen(function* () {
      const error = yield* dayBars(ALPHA, "1999-01-01").pipe(Effect.flip);
      expect(error._tag).toBe("DataUnavailable");
    }),
  );
});
