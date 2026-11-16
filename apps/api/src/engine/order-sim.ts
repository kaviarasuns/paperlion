import type { Bar, Fill, Order, OrderId, OrderType, Product, Side } from "@paperlion/contracts";
import { type ChargeRates, computeCharges, ZERODHA_LIKE_EQUITY } from "./charges.ts";
import { round2 } from "./money.ts";
import { foldFills, snapshot } from "./portfolio.ts";

export interface EngineConfig {
  /** Applied against the trader on market and stop-market fills. Limit fills have none. */
  readonly slippageBps: number;
  /** Share of position value that must be covered by equity. */
  readonly marginFraction: Record<Product, number>;
  readonly charges: ChargeRates;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  slippageBps: 5,
  marginFraction: { CNC: 1, MIS: 0.2 },
  charges: ZERODHA_LIKE_EQUITY,
};

/** Orders and fills of one session, oldest first. Positions and cash are derived from the fills. */
export interface Book {
  readonly orders: ReadonlyArray<Order>;
  readonly fills: ReadonlyArray<Fill>;
}

export const EMPTY_BOOK: Book = { orders: [], fills: [] };

export interface OrderRequest {
  readonly side: Side;
  readonly product: Product;
  readonly type: OrderType;
  readonly qty: number;
  readonly price?: number | undefined;
  readonly triggerPrice?: number | undefined;
}

export type PlaceResult =
  | { readonly _tag: "placed"; readonly book: Book }
  | { readonly _tag: "rejected"; readonly reason: string };

const reject = (reason: string): PlaceResult => ({ _tag: "rejected", reason });

const isPrice = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

const withSlippage = (price: number, side: Side, bps: number): number =>
  round2(side === "BUY" ? price * (1 + bps / 10_000) : price * (1 - bps / 10_000));

const fillOrder = (
  order: Order,
  price: number,
  slippage: number,
  minute: number,
  config: EngineConfig,
): Fill => ({
  orderId: order.id,
  side: order.side,
  product: order.product,
  qty: order.qty,
  price,
  slippage: round2(slippage),
  charges: computeCharges({ ...order, price }, config.charges),
  minute,
});

const marketFill = (
  order: Order,
  reference: number,
  minute: number,
  config: EngineConfig,
): Fill => {
  const price = withSlippage(reference, order.side, config.slippageBps);
  return fillOrder(order, price, Math.abs(price - reference), minute, config);
};

const validateShape = (req: OrderRequest, lastPrice: number): string | null => {
  if (!Number.isInteger(req.qty) || req.qty <= 0)
    return "Quantity must be a whole number above zero.";
  const needsPrice = req.type === "LIMIT" || req.type === "SL";
  const needsTrigger = req.type === "SL" || req.type === "SL-M";
  if (needsPrice && !isPrice(req.price)) return "This order type needs a limit price.";
  if (needsTrigger && !isPrice(req.triggerPrice)) return "This order type needs a trigger price.";
  if (needsTrigger && isPrice(req.triggerPrice)) {
    if (req.side === "BUY" && req.triggerPrice <= lastPrice) {
      return "A buy stop needs a trigger above the last price.";
    }
    if (req.side === "SELL" && req.triggerPrice >= lastPrice) {
      return "A sell stop needs a trigger below the last price.";
    }
  }
  if (req.type === "SL" && isPrice(req.price) && isPrice(req.triggerPrice)) {
    if (req.side === "BUY" && req.price < req.triggerPrice) {
      return "A buy stop-limit needs a limit price at or above its trigger.";
    }
    if (req.side === "SELL" && req.price > req.triggerPrice) {
      return "A sell stop-limit needs a limit price at or below its trigger.";
    }
  }
  return null;
};

const formatRupees = (value: number): string => `₹${round2(value).toFixed(2)}`;

/** Checks delivery holdings and margin as if the order filled in full at its reference price. */
const validateFunds = (
  book: Book,
  req: OrderRequest,
  referencePrice: number,
  lastPrice: number,
  startingCash: number,
  config: EngineConfig,
): string | null => {
  const holdings = foldFills(book.fills).holdings;
  const held = holdings.find((h) => h.product === req.product)?.qty ?? 0;
  const after = held + (req.side === "BUY" ? req.qty : -req.qty);

  if (req.product === "CNC" && req.side === "SELL") {
    const pendingSells = book.orders
      .filter((o) => o.status === "open" && o.product === "CNC" && o.side === "SELL")
      .reduce((sum, o) => sum + o.qty, 0);
    if (req.qty > held - pendingSells) {
      return "Delivery (CNC) can only sell shares you hold. Use MIS to short intraday.";
    }
  }

  if (Math.abs(after) <= Math.abs(held)) return null;

  const otherMargin = holdings
    .filter((h) => h.product !== req.product)
    .reduce((sum, h) => sum + Math.abs(h.qty) * lastPrice * config.marginFraction[h.product], 0);
  const required =
    otherMargin + Math.abs(after) * referencePrice * config.marginFraction[req.product];
  const { equity } = snapshot(startingCash, book.fills, lastPrice);
  if (required > equity) {
    return `Not enough funds: this needs ${formatRupees(required)} of margin and you have ${formatRupees(equity)}.`;
  }
  return null;
};

export interface PlaceContext {
  readonly id: OrderId;
  /** The latest bar the trader can see. Market orders fill at its close. */
  readonly lastBar: Bar;
  readonly startingCash: number;
  readonly config: EngineConfig;
}

export const placeOrder = (book: Book, req: OrderRequest, ctx: PlaceContext): PlaceResult => {
  const lastPrice = ctx.lastBar.close;
  const shapeError = validateShape(req, lastPrice);
  if (shapeError !== null) return reject(shapeError);

  const price = req.type === "LIMIT" || req.type === "SL" ? (req.price ?? null) : null;
  const triggerPrice = req.type === "SL" || req.type === "SL-M" ? (req.triggerPrice ?? null) : null;
  const referencePrice = price ?? triggerPrice ?? lastPrice;
  const fundsError = validateFunds(
    book,
    req,
    referencePrice,
    lastPrice,
    ctx.startingCash,
    ctx.config,
  );
  if (fundsError !== null) return reject(fundsError);

  const order: Order = {
    id: ctx.id,
    side: req.side,
    product: req.product,
    type: req.type,
    qty: req.qty,
    price,
    triggerPrice,
    status: "open",
    triggered: false,
    placedAtMinute: ctx.lastBar.minute,
  };

  const marketable =
    order.type === "LIMIT" &&
    price !== null &&
    (order.side === "BUY" ? price >= lastPrice : price <= lastPrice);
  const fill =
    order.type === "MARKET"
      ? marketFill(order, lastPrice, ctx.lastBar.minute, ctx.config)
      : marketable
        ? fillOrder(order, lastPrice, 0, ctx.lastBar.minute, ctx.config)
        : null;

  return {
    _tag: "placed",
    book:
      fill === null
        ? { orders: [...book.orders, order], fills: book.fills }
        : {
            orders: [...book.orders, { ...order, status: "filled" }],
            fills: [...book.fills, fill],
          },
  };
};

type BarOutcome =
  | { readonly _tag: "fill"; readonly fill: Fill }
  | { readonly _tag: "triggered" }
  | { readonly _tag: "none" };

const NONE: BarOutcome = { _tag: "none" };

/** A resting limit fills when the bar trades through it; a gap past the limit fills at the open. */
const limitFill = (order: Order, limit: number, bar: Bar, config: EngineConfig): BarOutcome => {
  const reached = order.side === "BUY" ? bar.low <= limit : bar.high >= limit;
  if (!reached) return NONE;
  const price = order.side === "BUY" ? Math.min(limit, bar.open) : Math.max(limit, bar.open);
  return { _tag: "fill", fill: fillOrder(order, price, 0, bar.minute, config) };
};

const evaluate = (order: Order, bar: Bar, config: EngineConfig): BarOutcome => {
  if (order.type === "LIMIT" || order.triggered) {
    return order.price === null ? NONE : limitFill(order, order.price, bar, config);
  }
  if (order.triggerPrice === null) return NONE;
  const trigger = order.triggerPrice;
  const hit = order.side === "BUY" ? bar.high >= trigger : bar.low <= trigger;
  if (!hit) return NONE;
  // A bar that opens beyond the trigger stops out at the open, not at the trigger.
  const stopPrice =
    order.side === "BUY" ? Math.max(trigger, bar.open) : Math.min(trigger, bar.open);
  if (order.type === "SL-M") {
    return { _tag: "fill", fill: marketFill(order, stopPrice, bar.minute, config) };
  }
  const limit = order.price;
  if (limit === null) return NONE;
  const withinLimit = order.side === "BUY" ? stopPrice <= limit : stopPrice >= limit;
  return withinLimit
    ? { _tag: "fill", fill: fillOrder(order, stopPrice, 0, bar.minute, config) }
    : { _tag: "triggered" };
};

/** Runs every open order against one new bar. Call once per bar, in bar order. */
export const applyBar = (book: Book, bar: Bar, config: EngineConfig): Book => {
  const fills = [...book.fills];
  const orders = book.orders.map((order): Order => {
    if (order.status !== "open") return order;
    const outcome = evaluate(order, bar, config);
    if (outcome._tag === "fill") {
      fills.push(outcome.fill);
      return { ...order, status: "filled" };
    }
    return outcome._tag === "triggered" ? { ...order, triggered: true } : order;
  });
  return { orders, fills };
};

/** Returns null when the order does not exist or is no longer open. */
export const cancelOrder = (book: Book, orderId: OrderId): Book | null => {
  const target = book.orders.find((o) => o.id === orderId);
  if (target === undefined || target.status !== "open") return null;
  return {
    orders: book.orders.map((o) => (o.id === orderId ? { ...o, status: "cancelled" } : o)),
    fills: book.fills,
  };
};

/** Cancels everything still open and closes every position with a market order at the last close. */
export const squareOff = (
  book: Book,
  lastBar: Bar,
  config: EngineConfig,
  nextId: () => OrderId,
): Book => {
  const orders: Array<Order> = book.orders.map((o) =>
    o.status === "open" ? { ...o, status: "cancelled" } : o,
  );
  const fills = [...book.fills];
  for (const holding of foldFills(book.fills).holdings) {
    if (holding.qty === 0) continue;
    const order: Order = {
      id: nextId(),
      side: holding.qty > 0 ? "SELL" : "BUY",
      product: holding.product,
      type: "MARKET",
      qty: Math.abs(holding.qty),
      price: null,
      triggerPrice: null,
      status: "filled",
      triggered: false,
      placedAtMinute: lastBar.minute,
    };
    orders.push(order);
    fills.push(marketFill(order, lastBar.close, lastBar.minute, config));
  }
  return { orders, fills };
};
