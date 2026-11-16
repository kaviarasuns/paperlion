import type { ChargeBreakup, Product, Side } from "@paperlion/contracts";
import { round2 } from "./money.ts";

/** Rates are fractions of turnover unless noted. They change; keep them here, not in the logic. */
export interface ChargeRates {
  /** Per executed order: `rate` of turnover, capped at `cap` rupees. */
  readonly brokerage: Record<Product, { readonly rate: number; readonly cap: number }>;
  readonly stt: Record<Product, Record<Side, number>>;
  readonly exchange: number;
  readonly sebi: number;
  /** Charged on the buy side only. */
  readonly stampDuty: Record<Product, number>;
  /** Applied to brokerage + exchange + SEBI charges. */
  readonly gst: number;
}

/**
 * NSE cash-equity charges in the shape Zerodha publishes them. Unverified against
 * the current schedule: recheck before trusting a P&L to the rupee.
 */
export const ZERODHA_LIKE_EQUITY: ChargeRates = {
  brokerage: { CNC: { rate: 0, cap: 0 }, MIS: { rate: 0.0003, cap: 20 } },
  stt: { CNC: { BUY: 0.001, SELL: 0.001 }, MIS: { BUY: 0, SELL: 0.00025 } },
  exchange: 0.0000297,
  sebi: 0.000001,
  stampDuty: { CNC: 0.00015, MIS: 0.00003 },
  gst: 0.18,
};

export interface Trade {
  readonly side: Side;
  readonly product: Product;
  readonly qty: number;
  readonly price: number;
}

export const computeCharges = (trade: Trade, rates: ChargeRates): ChargeBreakup => {
  const turnover = trade.qty * trade.price;
  const { rate, cap } = rates.brokerage[trade.product];
  const brokerage = round2(Math.min(turnover * rate, cap));
  const stt = round2(turnover * rates.stt[trade.product][trade.side]);
  const exchange = round2(turnover * rates.exchange);
  const sebi = round2(turnover * rates.sebi);
  const stampDuty = trade.side === "BUY" ? round2(turnover * rates.stampDuty[trade.product]) : 0;
  const gst = round2((brokerage + exchange + sebi) * rates.gst);
  return {
    brokerage,
    stt,
    exchange,
    sebi,
    stampDuty,
    gst,
    total: round2(brokerage + stt + exchange + sebi + stampDuty + gst),
  };
};
