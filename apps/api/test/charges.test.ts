import { describe, expect, it } from "@effect/vitest";
import { computeCharges, ZERODHA_LIKE_EQUITY } from "../src/engine/charges.ts";

const rates = ZERODHA_LIKE_EQUITY;

describe("equity charges", () => {
  it("caps intraday brokerage at twenty rupees and charges stamp duty on the buy", () => {
    expect(computeCharges({ side: "BUY", product: "MIS", qty: 100, price: 1000 }, rates)).toEqual({
      brokerage: 20,
      stt: 0,
      exchange: 2.97,
      sebi: 0.1,
      stampDuty: 3,
      gst: 4.15,
      total: 30.22,
    });
  });

  it("charges STT on the intraday sell and no stamp duty", () => {
    expect(computeCharges({ side: "SELL", product: "MIS", qty: 100, price: 1000 }, rates)).toEqual({
      brokerage: 20,
      stt: 25,
      exchange: 2.97,
      sebi: 0.1,
      stampDuty: 0,
      gst: 4.15,
      total: 52.22,
    });
  });

  it("uses the percentage brokerage when it is below the cap", () => {
    const charges = computeCharges({ side: "BUY", product: "MIS", qty: 10, price: 1000 }, rates);
    expect(charges.brokerage).toBe(3);
  });

  it("charges no brokerage on delivery but STT on both sides", () => {
    const buy = computeCharges({ side: "BUY", product: "CNC", qty: 100, price: 1000 }, rates);
    const sell = computeCharges({ side: "SELL", product: "CNC", qty: 100, price: 1000 }, rates);
    expect(buy).toMatchObject({ brokerage: 0, stt: 100, stampDuty: 15 });
    expect(sell).toMatchObject({ brokerage: 0, stt: 100, stampDuty: 0 });
  });

  it("adds the lines up to the total", () => {
    const c = computeCharges({ side: "SELL", product: "MIS", qty: 37, price: 412.35 }, rates);
    const sum = c.brokerage + c.stt + c.exchange + c.sebi + c.stampDuty + c.gst;
    expect(c.total).toBeCloseTo(sum, 2);
  });
});
