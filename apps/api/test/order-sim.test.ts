import { describe, expect, it } from "@effect/vitest";
import type { OrderId } from "@paperlion/contracts";
import {
  applyBar,
  type Book,
  cancelOrder,
  DEFAULT_ENGINE_CONFIG,
  EMPTY_BOOK,
  type EngineConfig,
  type OrderRequest,
  placeOrder,
  squareOff,
} from "../src/engine/order-sim.ts";
import { foldFills } from "../src/engine/portfolio.ts";
import { bar, flat, sequentialIds } from "./support/bars.ts";

const config: EngineConfig = { ...DEFAULT_ENGINE_CONFIG, slippageBps: 10 };
const STARTING_CASH = 100_000;

const place = (book: Book, req: OrderRequest, lastPrice = 100, id = "order-a") => {
  const result = placeOrder(book, req, {
    id: id as OrderId,
    lastBar: flat(0, lastPrice),
    startingCash: STARTING_CASH,
    config,
  });
  if (result._tag === "rejected") throw new Error(`unexpected rejection: ${result.reason}`);
  return result.book;
};

const rejection = (book: Book, req: OrderRequest, lastPrice = 100) => {
  const result = placeOrder(book, req, {
    id: "order-x" as OrderId,
    lastBar: flat(0, lastPrice),
    startingCash: STARTING_CASH,
    config,
  });
  return result._tag === "rejected" ? result.reason : null;
};

const buy = (overrides: Partial<OrderRequest>): OrderRequest => ({
  side: "BUY",
  product: "MIS",
  type: "MARKET",
  qty: 10,
  ...overrides,
});
const sell = (overrides: Partial<OrderRequest>): OrderRequest =>
  buy({ side: "SELL", ...overrides });

describe("market orders", () => {
  it("fill at once at the last close, with slippage against the buyer", () => {
    const book = place(EMPTY_BOOK, buy({}));
    expect(book.orders[0]?.status).toBe("filled");
    expect(book.fills[0]).toMatchObject({ price: 100.1, slippage: 0.1, qty: 10, minute: 0 });
  });

  it("fill below the last close for a seller", () => {
    const book = place(EMPTY_BOOK, sell({}));
    expect(book.fills[0]?.price).toBe(99.9);
  });

  it("carry a charge break-up on the fill", () => {
    const book = place(EMPTY_BOOK, buy({}));
    expect(book.fills[0]?.charges.total).toBeGreaterThan(0);
  });
});

describe("limit orders", () => {
  it("rest until a bar trades down to the limit, then fill at the limit", () => {
    const resting = place(EMPTY_BOOK, buy({ type: "LIMIT", price: 98 }));
    expect(resting.orders[0]?.status).toBe("open");

    const missed = applyBar(resting, bar(1, [100, 101, 98.5, 99]), config);
    expect(missed.fills).toHaveLength(0);

    const filled = applyBar(missed, bar(2, [99, 99.5, 97.5, 98.2]), config);
    expect(filled.orders[0]?.status).toBe("filled");
    expect(filled.fills[0]).toMatchObject({ price: 98, slippage: 0, minute: 2 });
  });

  it("fill at the open when the bar gaps through the limit", () => {
    const resting = place(EMPTY_BOOK, buy({ type: "LIMIT", price: 98 }));
    const filled = applyBar(resting, bar(1, [96, 97, 95, 96.5]), config);
    expect(filled.fills[0]?.price).toBe(96);
  });

  it("fill a sell limit at the limit when the bar trades up to it", () => {
    const held = place(EMPTY_BOOK, buy({}));
    const resting = place(held, sell({ type: "LIMIT", price: 103 }), 100, "order-b");
    const filled = applyBar(resting, bar(1, [100, 104, 99, 103.5]), config);
    expect(filled.fills[1]).toMatchObject({ side: "SELL", price: 103 });
  });

  it("fill at once without slippage when the limit is already marketable", () => {
    const book = place(EMPTY_BOOK, buy({ type: "LIMIT", price: 101 }));
    expect(book.fills[0]).toMatchObject({ price: 100, slippage: 0 });
  });
});

describe("stop orders", () => {
  it("stop-market sells at the trigger with slippage once the bar trades down to it", () => {
    const held = place(EMPTY_BOOK, buy({}));
    const stopped = place(held, sell({ type: "SL-M", triggerPrice: 97 }), 100, "order-b");
    const quiet = applyBar(stopped, bar(1, [100, 101, 97.5, 98]), config);
    expect(quiet.fills).toHaveLength(1);

    const hit = applyBar(quiet, bar(2, [98, 98.5, 96, 96.5]), config);
    expect(hit.fills[1]).toMatchObject({ side: "SELL", price: 96.9, minute: 2 });
  });

  it("stop-market fills at the open when the bar gaps past the trigger", () => {
    const held = place(EMPTY_BOOK, buy({}));
    const stopped = place(held, sell({ type: "SL-M", triggerPrice: 97 }), 100, "order-b");
    const hit = applyBar(stopped, bar(1, [94, 95, 93, 94.5]), config);
    expect(hit.fills[1]?.price).toBe(93.91);
  });

  it("stop-limit fills at the trigger when it is inside the limit", () => {
    const book = place(EMPTY_BOOK, buy({ type: "SL", triggerPrice: 102, price: 103 }));
    const hit = applyBar(book, bar(1, [100, 102.5, 99.5, 102]), config);
    expect(hit.fills[0]).toMatchObject({ price: 102, slippage: 0 });
  });

  it("stop-limit that gaps past its limit waits as a limit order", () => {
    const book = place(EMPTY_BOOK, buy({ type: "SL", triggerPrice: 102, price: 103 }));
    const gapped = applyBar(book, bar(1, [105, 106, 104, 105]), config);
    expect(gapped.fills).toHaveLength(0);
    expect(gapped.orders[0]).toMatchObject({ status: "open", triggered: true });

    const back = applyBar(gapped, bar(2, [105, 105, 102.5, 103]), config);
    expect(back.fills[0]?.price).toBe(103);
  });
});

describe("order validation", () => {
  it("rejects a quantity that is not a positive whole number", () => {
    expect(rejection(EMPTY_BOOK, buy({ qty: 0 }))).toMatch(/whole number/);
    expect(rejection(EMPTY_BOOK, buy({ qty: 1.5 }))).toMatch(/whole number/);
  });

  it("rejects a limit order without a price and a stop without a trigger", () => {
    expect(rejection(EMPTY_BOOK, buy({ type: "LIMIT" }))).toMatch(/limit price/);
    expect(rejection(EMPTY_BOOK, sell({ type: "SL-M" }))).toMatch(/trigger price/);
  });

  it("rejects a stop whose trigger is on the wrong side of the last price", () => {
    expect(rejection(EMPTY_BOOK, buy({ type: "SL-M", triggerPrice: 99 }))).toMatch(/above/);
    expect(rejection(EMPTY_BOOK, sell({ type: "SL-M", triggerPrice: 101 }))).toMatch(/below/);
  });

  it("rejects a buy stop-limit whose limit is below its trigger", () => {
    expect(rejection(EMPTY_BOOK, buy({ type: "SL", triggerPrice: 102, price: 101 }))).toMatch(
      /at or above/,
    );
  });

  it("rejects a delivery sell of shares that are not held", () => {
    expect(rejection(EMPTY_BOOK, sell({ product: "CNC" }))).toMatch(/only sell shares you hold/);
  });

  it("counts resting delivery sells against the holding", () => {
    const held = place(EMPTY_BOOK, buy({ product: "CNC", qty: 10 }));
    const resting = place(
      held,
      sell({ product: "CNC", qty: 8, type: "LIMIT", price: 110 }),
      100,
      "b",
    );
    expect(rejection(resting, sell({ product: "CNC", qty: 3 }))).toMatch(/only sell shares/);
    expect(rejection(resting, sell({ product: "CNC", qty: 2 }))).toBeNull();
  });

  it("rejects a delivery buy larger than the cash available", () => {
    expect(rejection(EMPTY_BOOK, buy({ product: "CNC", qty: 1001 }))).toMatch(/Not enough funds/);
    expect(rejection(EMPTY_BOOK, buy({ product: "CNC", qty: 1000 }))).toBeNull();
  });

  it("lets intraday orders use five times leverage and no more", () => {
    expect(rejection(EMPTY_BOOK, buy({ qty: 5000 }))).toBeNull();
    expect(rejection(EMPTY_BOOK, buy({ qty: 5001 }))).toMatch(/Not enough funds/);
    expect(rejection(EMPTY_BOOK, sell({ qty: 5001 }))).toMatch(/Not enough funds/);
  });

  it("always allows an order that only reduces a position", () => {
    const held = place(EMPTY_BOOK, buy({ qty: 4900 }));
    expect(rejection(held, sell({ qty: 4900 }), 50)).toBeNull();
  });
});

describe("cancel and square-off", () => {
  it("cancels an open order and refuses a filled or unknown one", () => {
    const resting = place(EMPTY_BOOK, buy({ type: "LIMIT", price: 98 }));
    const cancelled = cancelOrder(resting, "order-a" as OrderId);
    expect(cancelled?.orders[0]?.status).toBe("cancelled");
    expect(cancelOrder(place(EMPTY_BOOK, buy({})), "order-a" as OrderId)).toBeNull();
    expect(cancelOrder(resting, "missing" as OrderId)).toBeNull();
  });

  it("does not fill a cancelled order on later bars", () => {
    const resting = place(EMPTY_BOOK, buy({ type: "LIMIT", price: 98 }));
    const cancelled = cancelOrder(resting, "order-a" as OrderId);
    expect(applyBar(cancelled ?? resting, flat(1, 90), config).fills).toHaveLength(0);
  });

  it("square-off cancels resting orders and closes long and short positions", () => {
    const long = place(EMPTY_BOOK, buy({ product: "CNC", qty: 10 }));
    const short = place(long, sell({ product: "MIS", qty: 4 }), 100, "order-b");
    const resting = place(short, buy({ type: "LIMIT", price: 90 }), 100, "order-c");

    const closed = squareOff(resting, flat(5, 105), config, sequentialIds());

    expect(closed.orders.find((o) => o.id === "order-c")?.status).toBe("cancelled");
    expect(foldFills(closed.fills).holdings.map((h) => h.qty)).toEqual([0, 0]);
    expect(closed.fills.slice(-2).map((f) => [f.side, f.product, f.qty, f.minute])).toEqual([
      ["SELL", "CNC", 10, 5],
      ["BUY", "MIS", 4, 5],
    ]);
  });
});
