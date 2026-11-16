import type { InstrumentId, SessionId, SessionMode, SessionStatus } from "@paperlion/contracts";
import { Context, Effect, Layer } from "effect";
import type { Book } from "../engine/order-sim.ts";

export interface SessionRecord {
  readonly id: SessionId;
  readonly instrumentId: InstrumentId;
  readonly instrumentName: string;
  /** yyyy-mm-dd of the replayed day. */
  readonly date: string;
  readonly mode: SessionMode;
  readonly status: SessionStatus;
  /** How many bars of the day the clock has reached. At least 1 once a session exists. */
  readonly cursor: number;
  readonly startingCash: number;
  readonly book: Book;
}

/** Holds replay sessions. Implementations: in-memory only so far; a restart forgets them. */
export class SessionStore extends Context.Service<
  SessionStore,
  {
    readonly find: (id: SessionId) => Effect.Effect<SessionRecord | null>;
    /** Inserts or replaces the session with the same id. */
    readonly save: (record: SessionRecord) => Effect.Effect<void>;
  }
>()("SessionStore") {}

export const SessionStoreInMemory = Layer.sync(SessionStore, () => {
  const sessions = new Map<SessionId, SessionRecord>();
  return SessionStore.of({
    find: (id) => Effect.sync(() => sessions.get(id) ?? null),
    save: (record) => Effect.sync(() => void sessions.set(record.id, record)),
  });
});
