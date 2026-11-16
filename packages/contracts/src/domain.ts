import { Schema } from "effect";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export const OrderId = Schema.String.pipe(Schema.brand("OrderId"));
export type OrderId = typeof OrderId.Type;

export const InstrumentId = Schema.String.pipe(Schema.brand("InstrumentId"));
export type InstrumentId = typeof InstrumentId.Type;

export const Side = Schema.Literals(["BUY", "SELL"]);
export type Side = typeof Side.Type;

/** CNC is delivery (full cash, no shorting). MIS is intraday (leveraged, shorting allowed). */
export const Product = Schema.Literals(["CNC", "MIS"]);
export type Product = typeof Product.Type;

/** Same names as Kite: SL is stop-limit, SL-M is stop-market. */
export const OrderType = Schema.Literals(["MARKET", "LIMIT", "SL", "SL-M"]);
export type OrderType = typeof OrderType.Type;

export const OrderStatus = Schema.Literals(["open", "filled", "cancelled"]);
export type OrderStatus = typeof OrderStatus.Type;

/**
 * One-minute candle. `minute` counts from the session open (0 = 09:15 IST), so a
 * bar carries no calendar date and a blind session cannot leak which day it is.
 */
export const Bar = Schema.Struct({
  minute: Schema.Number,
  open: Schema.Number,
  high: Schema.Number,
  low: Schema.Number,
  close: Schema.Number,
  volume: Schema.Number,
});
export type Bar = typeof Bar.Type;

/** Rupees, each line rounded to paise. `total` is the sum of the lines. */
export const ChargeBreakup = Schema.Struct({
  brokerage: Schema.Number,
  stt: Schema.Number,
  exchange: Schema.Number,
  sebi: Schema.Number,
  stampDuty: Schema.Number,
  gst: Schema.Number,
  total: Schema.Number,
});
export type ChargeBreakup = typeof ChargeBreakup.Type;

export const Order = Schema.Struct({
  id: OrderId,
  side: Side,
  product: Product,
  type: OrderType,
  qty: Schema.Number,
  /** Limit price. Null for MARKET and SL-M. */
  price: Schema.NullOr(Schema.Number),
  /** Null for MARKET and LIMIT. */
  triggerPrice: Schema.NullOr(Schema.Number),
  status: OrderStatus,
  /** A stop-limit whose trigger was hit but whose limit has not filled yet. */
  triggered: Schema.Boolean,
  placedAtMinute: Schema.Number,
});
export type Order = typeof Order.Type;

export const Fill = Schema.Struct({
  orderId: OrderId,
  side: Side,
  product: Product,
  qty: Schema.Number,
  price: Schema.Number,
  /** Rupees per share lost to the slippage model. Zero for limit fills. */
  slippage: Schema.Number,
  charges: ChargeBreakup,
  minute: Schema.Number,
});
export type Fill = typeof Fill.Type;

export const Position = Schema.Struct({
  product: Product,
  /** Signed: negative is short. */
  qty: Schema.Number,
  avgPrice: Schema.Number,
  realisedPnl: Schema.Number,
  unrealisedPnl: Schema.Number,
});
export type Position = typeof Position.Type;

/** blind: stock and date stay hidden until the session is finished. practice: chosen by the user. */
export const SessionMode = Schema.Literals(["blind", "practice"]);
export type SessionMode = typeof SessionMode.Type;

export const SessionStatus = Schema.Literals(["running", "finished"]);
export type SessionStatus = typeof SessionStatus.Type;

export const Reveal = Schema.Struct({
  instrumentId: InstrumentId,
  name: Schema.String,
  /** yyyy-mm-dd */
  date: Schema.String,
});
export type Reveal = typeof Reveal.Type;

export const SessionView = Schema.Struct({
  id: SessionId,
  mode: SessionMode,
  status: SessionStatus,
  /** Bars the clock has reached so far. Never includes bars past the clock. */
  bars: Schema.Array(Bar),
  totalBars: Schema.Number,
  startingCash: Schema.Number,
  cash: Schema.Number,
  /** Cash plus open positions marked at the last visible close. */
  equity: Schema.Number,
  totalCharges: Schema.Number,
  orders: Schema.Array(Order),
  fills: Schema.Array(Fill),
  positions: Schema.Array(Position),
  /** Null while a blind session is still running. */
  reveal: Schema.NullOr(Reveal),
});
export type SessionView = typeof SessionView.Type;

export const SessionChoice = Schema.Struct({
  instrumentId: InstrumentId,
  name: Schema.String,
  dates: Schema.Array(Schema.String),
});
export type SessionChoice = typeof SessionChoice.Type;
