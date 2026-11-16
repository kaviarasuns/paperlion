import { describe, expect, it } from "@effect/vitest";
import type { ChargeBreakup, Fill, OrderId, Product, Side } from "@paperlion/contracts";
import { foldFills, snapshot } from "../src/engine/portfolio.ts";

const noCharges: ChargeBreakup = {
  brokerage: 0,
  stt: 0,
  exchange: 0,
  sebi: 0,
  stampDuty: 0,
  gst: 0,
  total: 0,
};

const fill = (side: Side, qty: number, price: number, product: Product = "MIS", fee = 0): Fill => ({
  orderId: "o" as OrderId,
  side,
  product,
  qty,
  price,
  slippage: 0,
  charges: { ...noCharges, total: fee },
  minute: 0,
});

describe("portfolio", () => {
  it("averages the entry price across buys", () => {
    const { holdings } = foldFills([fill("BUY", 10, 100), fill("BUY", 30, 120)]);
    expect(holdings).toEqual([{ product: "MIS", qty: 40, avgPrice: 115, realisedPnl: 0 }]);
  });

  it("realises profit on a partial exit and keeps the entry average", () => {
    const { holdings } = foldFills([fill("BUY", 10, 100), fill("SELL", 4, 110)]);
    expect(holdings[0]).toMatchObject({ qty: 6, avgPrice: 100, realisedPnl: 40 });
  });

  it("realises profit on a short that is bought back lower", () => {
    const { holdings } = foldFills([fill("SELL", 10, 100), fill("BUY", 10, 90)]);
    expect(holdings[0]).toMatchObject({ qty: 0, avgPrice: 0, realisedPnl: 100 });
  });

  it("opens the remainder at the fill price when a trade flips the position", () => {
    const { holdings } = foldFills([fill("BUY", 10, 100), fill("SELL", 15, 110)]);
    expect(holdings[0]).toMatchObject({ qty: -5, avgPrice: 110, realisedPnl: 100 });
  });

  it("keeps delivery and intraday holdings apart", () => {
    const { holdings } = foldFills([fill("BUY", 5, 100, "CNC"), fill("SELL", 5, 100, "MIS")]);
    expect(holdings.map((h) => [h.product, h.qty])).toEqual([
      ["CNC", 5],
      ["MIS", -5],
    ]);
  });

  it("marks open positions at the last price and takes charges out of equity", () => {
    const view = snapshot(10_000, [fill("BUY", 10, 100, "MIS", 12.5)], 104);
    expect(view.cash).toBe(8987.5);
    expect(view.equity).toBe(10_027.5);
    expect(view.totalCharges).toBe(12.5);
    expect(view.positions[0]).toMatchObject({ qty: 10, avgPrice: 100, unrealisedPnl: 40 });
  });

  it("returns to starting cash minus charges after a flat round trip", () => {
    const view = snapshot(
      10_000,
      [fill("BUY", 10, 100, "MIS", 5), fill("SELL", 10, 100, "MIS", 7)],
      250,
    );
    expect(view.equity).toBe(9988);
    expect(view.cash).toBe(9988);
  });
});
