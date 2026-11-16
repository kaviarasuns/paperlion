import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import {
  InstrumentId,
  OrderId,
  OrderType,
  Product,
  SessionChoice,
  SessionId,
  SessionView,
  Side,
} from "./domain.ts";
import {
  DataUnavailable,
  OrderNotFound,
  OrderRejected,
  SessionFinished,
  SessionNotFound,
} from "./errors.ts";

export class ReplayRpcs extends RpcGroup.make(
  /** What a practice session can be started on. Blind sessions pick from the same list. */
  Rpc.make("ListSessionChoices", {
    success: Schema.Array(SessionChoice),
    error: DataUnavailable,
  }),
  Rpc.make("StartSession", {
    /** Omit `pick` for a blind session on a randomly chosen stock and day. */
    payload: {
      pick: Schema.optional(Schema.Struct({ instrumentId: InstrumentId, date: Schema.String })),
    },
    success: SessionView,
    error: DataUnavailable,
  }),
  Rpc.make("GetSession", {
    payload: { sessionId: SessionId },
    success: SessionView,
    error: Schema.Union([SessionNotFound, DataUnavailable]),
  }),
  /** Moves the clock forward by `bars` one-minute bars and fills any orders they cross. */
  Rpc.make("AdvanceSession", {
    payload: { sessionId: SessionId, bars: Schema.Number },
    success: SessionView,
    error: Schema.Union([SessionNotFound, SessionFinished, DataUnavailable]),
  }),
  Rpc.make("PlaceOrder", {
    payload: {
      sessionId: SessionId,
      side: Side,
      product: Product,
      type: OrderType,
      qty: Schema.Number,
      price: Schema.optional(Schema.Number),
      triggerPrice: Schema.optional(Schema.Number),
    },
    success: SessionView,
    error: Schema.Union([SessionNotFound, SessionFinished, OrderRejected, DataUnavailable]),
  }),
  Rpc.make("CancelOrder", {
    payload: { sessionId: SessionId, orderId: OrderId },
    success: SessionView,
    error: Schema.Union([SessionNotFound, SessionFinished, OrderNotFound, DataUnavailable]),
  }),
  /** Cancels open orders, squares off open positions at the last visible close, and reveals the stock. */
  Rpc.make("FinishSession", {
    payload: { sessionId: SessionId },
    success: SessionView,
    error: Schema.Union([SessionNotFound, DataUnavailable]),
  }),
) {}

export const RPC_PATH = "/rpc";
