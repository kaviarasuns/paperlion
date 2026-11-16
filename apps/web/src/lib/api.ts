import { makeReplayApi } from "@paperlion/client";

export const api = makeReplayApi(window.location.origin);

/** Turns any RPC failure into one sentence for the user. */
export const errorMessage = (error: unknown): string => {
  const tagged = error as { readonly _tag?: unknown; readonly reason?: unknown };
  switch (tagged._tag) {
    case "OrderRejected":
      return typeof tagged.reason === "string" ? tagged.reason : "The order was rejected.";
    case "OrderNotFound":
      return "That order is no longer open.";
    case "SessionFinished":
      return "This session has finished.";
    case "SessionNotFound":
      return "Session not found. Sessions are kept in memory and are lost when the API restarts.";
    case "DataUnavailable":
      return "No price data is available for that day.";
    default:
      return "Could not reach the PaperLion API. Is it running?";
  }
};
