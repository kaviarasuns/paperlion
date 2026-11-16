import { type Bar, DataUnavailable, type InstrumentId } from "@paperlion/contracts";
import { Effect, Layer } from "effect";
import { PriceSource, type TradingDays } from "./price-source.ts";

/** 09:15 to 15:30 IST. */
export const SESSION_MINUTES = 375;

const TICK = 0.05;

interface FixtureInstrument {
  readonly id: InstrumentId;
  readonly name: string;
  readonly basePrice: number;
  /** Standard deviation of one sub-minute step, as a fraction of price. */
  readonly volatility: number;
}

// Synthetic instruments: invented names and generated prices, not market data.
const INSTRUMENTS: ReadonlyArray<FixtureInstrument> = [
  { id: "FIX:ALPHA" as InstrumentId, name: "Fixture Alpha", basePrice: 1480, volatility: 0.0004 },
  { id: "FIX:BRAVO" as InstrumentId, name: "Fixture Bravo", basePrice: 312, volatility: 0.0007 },
  {
    id: "FIX:CHARLIE" as InstrumentId,
    name: "Fixture Charlie",
    basePrice: 6240,
    volatility: 0.0003,
  },
];

const DATES: ReadonlyArray<string> = [
  "2026-08-03",
  "2026-08-04",
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
];

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const toTick = (price: number): number => Math.round(Math.round(price / TICK) * TICK * 100) / 100;

/** The same instrument and date always produce the same bars. */
export const generateDay = (instrument: FixtureInstrument, date: string): ReadonlyArray<Bar> => {
  const random = mulberry32(hash(`${instrument.id}|${date}`));
  // Sum of uniforms: close enough to normal for a price path.
  const noise = () => random() + random() + random() + random() - 2;
  const drift = (random() - 0.5) * instrument.volatility * 0.4;
  let price = instrument.basePrice * (1 + (random() - 0.5) * 0.06);
  const bars: Array<Bar> = [];
  for (let minute = 0; minute < SESSION_MINUTES; minute++) {
    const open = toTick(price);
    let high = open;
    let low = open;
    for (let step = 0; step < 4; step++) {
      price *= 1 + drift + noise() * instrument.volatility;
      high = Math.max(high, toTick(price));
      low = Math.min(low, toTick(price));
    }
    bars.push({
      minute,
      open,
      high,
      low,
      close: toTick(price),
      volume: Math.round(2000 + random() * 18000),
    });
  }
  return bars;
};

const catalogue: ReadonlyArray<TradingDays> = INSTRUMENTS.map((i) => ({
  instrumentId: i.id,
  name: i.name,
  dates: DATES,
}));

export const FixturePriceSource = Layer.sync(PriceSource, () => {
  const cache = new Map<string, ReadonlyArray<Bar>>();
  return PriceSource.of({
    id: "fixture",
    catalogue: Effect.succeed(catalogue),
    dayBars: (instrumentId, date) =>
      Effect.suspend(() => {
        const instrument = INSTRUMENTS.find((i) => i.id === instrumentId);
        if (instrument === undefined || !DATES.includes(date)) {
          return Effect.fail(
            new DataUnavailable({ message: `No fixture data for ${instrumentId} on ${date}.` }),
          );
        }
        const key = `${instrumentId}|${date}`;
        const bars = cache.get(key) ?? generateDay(instrument, date);
        cache.set(key, bars);
        return Effect.succeed(bars);
      }),
  });
});
