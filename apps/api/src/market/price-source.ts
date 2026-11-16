import type { Bar, DataUnavailable, InstrumentId } from "@paperlion/contracts";
import { Context, type Effect } from "effect";

export interface TradingDays {
  readonly instrumentId: InstrumentId;
  readonly name: string;
  /** yyyy-mm-dd, oldest first. */
  readonly dates: ReadonlyArray<string>;
}

/**
 * Where prices come from. The engine only ever sees one-minute bars of a single
 * trading day, so a live feed and a replayed day look the same to it.
 */
export class PriceSource extends Context.Service<
  PriceSource,
  {
    readonly id: "fixture";
    /** Every instrument and day a session can be started on. */
    readonly catalogue: Effect.Effect<ReadonlyArray<TradingDays>, DataUnavailable>;
    /** All bars of one day, oldest first, `minute` counted from the session open. */
    readonly dayBars: (
      instrumentId: InstrumentId,
      date: string,
    ) => Effect.Effect<ReadonlyArray<Bar>, DataUnavailable>;
  }
>()("PriceSource") {}
