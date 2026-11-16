import type { Bar, OrderId, SessionView } from "@paperlion/contracts";
import { applyBar, type EngineConfig, squareOff } from "../engine/order-sim.ts";
import { snapshot } from "../engine/portfolio.ts";
import type { SessionRecord } from "./session-store.ts";

/** Bars shown before the trader makes a first decision, so the chart is not empty. */
export const WARMUP_BARS = 15;

export const STARTING_CASH = 100_000;

export const lastVisibleBar = (record: SessionRecord, dayBars: ReadonlyArray<Bar>): Bar => {
  const bar = dayBars[record.cursor - 1];
  if (bar === undefined) throw new Error(`Session ${record.id} has no bar at its cursor`);
  return bar;
};

/** Closes the session: open orders are cancelled and open positions squared off at the last visible close. */
export const finish = (
  record: SessionRecord,
  dayBars: ReadonlyArray<Bar>,
  config: EngineConfig,
  nextId: () => OrderId,
): SessionRecord =>
  record.status === "finished"
    ? record
    : {
        ...record,
        status: "finished",
        book: squareOff(record.book, lastVisibleBar(record, dayBars), config, nextId),
      };

/**
 * Moves the clock forward one bar at a time, filling orders each bar crosses.
 * Reaching the last bar of the day finishes the session.
 */
export const advance = (
  record: SessionRecord,
  dayBars: ReadonlyArray<Bar>,
  bars: number,
  config: EngineConfig,
  nextId: () => OrderId,
): SessionRecord => {
  const target = Math.min(dayBars.length, record.cursor + Math.max(0, Math.floor(bars)));
  let book = record.book;
  for (const bar of dayBars.slice(record.cursor, target)) {
    book = applyBar(book, bar, config);
  }
  const moved: SessionRecord = { ...record, cursor: target, book };
  return target >= dayBars.length ? finish(moved, dayBars, config, nextId) : moved;
};

/** What the trader is allowed to see: nothing past the clock, and no identity while blind and running. */
export const toView = (record: SessionRecord, dayBars: ReadonlyArray<Bar>): SessionView => {
  const portfolio = snapshot(
    record.startingCash,
    record.book.fills,
    lastVisibleBar(record, dayBars).close,
  );
  const hidden = record.mode === "blind" && record.status === "running";
  return {
    id: record.id,
    mode: record.mode,
    status: record.status,
    bars: dayBars.slice(0, record.cursor),
    totalBars: dayBars.length,
    startingCash: record.startingCash,
    cash: portfolio.cash,
    equity: portfolio.equity,
    totalCharges: portfolio.totalCharges,
    orders: record.book.orders,
    fills: record.book.fills,
    positions: portfolio.positions,
    reveal: hidden
      ? null
      : { instrumentId: record.instrumentId, name: record.instrumentName, date: record.date },
  };
};
