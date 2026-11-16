import type { Fill, Position, Product } from "@paperlion/contracts";
import { round2 } from "./money.ts";

export interface Holding {
  readonly product: Product;
  /** Signed: negative is short. */
  readonly qty: number;
  readonly avgPrice: number;
  readonly realisedPnl: number;
}

export interface Ledger {
  /** Net cash moved by the fills, charges included. Negative when cash went out. */
  readonly cashDelta: number;
  readonly totalCharges: number;
  readonly holdings: ReadonlyArray<Holding>;
}

const PRODUCTS: ReadonlyArray<Product> = ["CNC", "MIS"];

const applyFill = (holding: Holding, fill: Fill): Holding => {
  const signed = fill.side === "BUY" ? fill.qty : -fill.qty;
  const next = holding.qty + signed;
  const adding = holding.qty === 0 || Math.sign(holding.qty) === Math.sign(signed);
  if (adding) {
    const cost = holding.avgPrice * Math.abs(holding.qty) + fill.price * fill.qty;
    return { ...holding, qty: next, avgPrice: cost / Math.abs(next) };
  }
  const closed = Math.min(Math.abs(holding.qty), fill.qty);
  const realised = (fill.price - holding.avgPrice) * closed * Math.sign(holding.qty);
  const flipped = Math.sign(next) !== 0 && Math.sign(next) !== Math.sign(holding.qty);
  return {
    ...holding,
    qty: next,
    avgPrice: next === 0 ? 0 : flipped ? fill.price : holding.avgPrice,
    realisedPnl: holding.realisedPnl + realised,
  };
};

/** Folds fills into cash movement and one holding per product. Fills are the only source of truth. */
export const foldFills = (fills: ReadonlyArray<Fill>): Ledger => {
  const byProduct = new Map<Product, Holding>();
  let cashDelta = 0;
  let totalCharges = 0;
  for (const fill of fills) {
    const current = byProduct.get(fill.product) ?? {
      product: fill.product,
      qty: 0,
      avgPrice: 0,
      realisedPnl: 0,
    };
    byProduct.set(fill.product, applyFill(current, fill));
    const value = fill.qty * fill.price;
    cashDelta += (fill.side === "BUY" ? -value : value) - fill.charges.total;
    totalCharges += fill.charges.total;
  }
  return {
    cashDelta,
    totalCharges,
    holdings: PRODUCTS.flatMap((product) => byProduct.get(product) ?? []),
  };
};

export interface PortfolioSnapshot {
  readonly cash: number;
  readonly equity: number;
  readonly totalCharges: number;
  readonly positions: ReadonlyArray<Position>;
}

/** Marks every holding at `lastPrice`. Realised P&L is before charges; equity is after them. */
export const snapshot = (
  startingCash: number,
  fills: ReadonlyArray<Fill>,
  lastPrice: number,
): PortfolioSnapshot => {
  const ledger = foldFills(fills);
  const cash = startingCash + ledger.cashDelta;
  const openValue = ledger.holdings.reduce((sum, h) => sum + h.qty * lastPrice, 0);
  return {
    cash: round2(cash),
    equity: round2(cash + openValue),
    totalCharges: round2(ledger.totalCharges),
    positions: ledger.holdings.map((h) => ({
      product: h.product,
      qty: h.qty,
      avgPrice: round2(h.avgPrice),
      realisedPnl: round2(h.realisedPnl),
      unrealisedPnl: round2((lastPrice - h.avgPrice) * h.qty),
    })),
  };
};
