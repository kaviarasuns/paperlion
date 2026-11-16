import { Schema } from "effect";

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()("SessionNotFound", {
  sessionId: Schema.String,
}) {}

export class SessionFinished extends Schema.TaggedError<SessionFinished>()("SessionFinished", {
  sessionId: Schema.String,
}) {}

export class OrderNotFound extends Schema.TaggedError<OrderNotFound>()("OrderNotFound", {
  orderId: Schema.String,
}) {}

/** The order was refused before it reached the book. `reason` is shown to the user. */
export class OrderRejected extends Schema.TaggedError<OrderRejected>()("OrderRejected", {
  reason: Schema.String,
}) {}

export class DataUnavailable extends Schema.TaggedError<DataUnavailable>()("DataUnavailable", {
  message: Schema.String,
}) {}
