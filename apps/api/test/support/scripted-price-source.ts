import { type Bar, DataUnavailable, type InstrumentId } from "@paperlion/contracts";
import { Effect, Layer } from "effect";
import { PriceSource } from "../../src/market/price-source.ts";

export const SCRIPTED_INSTRUMENT = "TEST:ONE" as InstrumentId;
export const SCRIPTED_DATE = "2001-01-01";

/** One made-up instrument with one day of hand-written bars. */
export const scriptedPriceSource = (bars: ReadonlyArray<Bar>) =>
  Layer.succeed(
    PriceSource,
    PriceSource.of({
      id: "fixture",
      catalogue: Effect.succeed([
        { instrumentId: SCRIPTED_INSTRUMENT, name: "Test One", dates: [SCRIPTED_DATE] },
      ]),
      dayBars: (instrumentId, date) =>
        instrumentId === SCRIPTED_INSTRUMENT && date === SCRIPTED_DATE
          ? Effect.succeed(bars)
          : Effect.fail(new DataUnavailable({ message: "unknown day" })),
    }),
  );
