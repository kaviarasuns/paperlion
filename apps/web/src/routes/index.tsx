import type { InstrumentId, SessionChoice } from "@paperlion/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api.ts";

export const Route = createFileRoute("/")({
  component: StartPage,
});

function StartPage() {
  const navigate = useNavigate();
  const [choices, setChoices] = useState<ReadonlyArray<SessionChoice>>([]);
  const [instrumentId, setInstrumentId] = useState<InstrumentId | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .call((client) => client.ListSessionChoices())
      .then((outcome) => {
        if (!active) return;
        if (!outcome.ok) return setError(errorMessage(outcome.error));
        setChoices(outcome.value);
        const first = outcome.value[0];
        setInstrumentId(first?.instrumentId ?? null);
        setDate(first?.dates[0] ?? null);
      })
      .catch(() => active && setError(errorMessage(null)));
    return () => {
      active = false;
    };
  }, []);

  const selected = choices.find((c) => c.instrumentId === instrumentId);

  const start = async (pick?: { instrumentId: InstrumentId; date: string }) => {
    setStarting(true);
    setError(null);
    const outcome = await api
      .call((client) => client.StartSession(pick === undefined ? {} : { pick }))
      .catch(() => null);
    setStarting(false);
    if (outcome === null) return setError(errorMessage(null));
    if (!outcome.ok) return setError(errorMessage(outcome.error));
    await navigate({ to: "/session/$sessionId", params: { sessionId: outcome.value.id } });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h1 className="text-lg font-semibold">Blind replay</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Trade one past session without knowing the stock or the date. Both are revealed when you
          finish.
        </p>
        <button
          type="button"
          disabled={starting}
          onClick={() => void start()}
          className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Start blind session
        </button>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Practice</h2>
        <p className="mt-1 text-sm text-neutral-600">Pick the stock and the day yourself.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Stock</span>
            <select
              value={instrumentId ?? ""}
              onChange={(e) => {
                const next = choices.find((c) => c.instrumentId === e.target.value);
                setInstrumentId(next?.instrumentId ?? null);
                setDate(next?.dates[0] ?? null);
              }}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5"
            >
              {choices.map((c) => (
                <option key={c.instrumentId} value={c.instrumentId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-600">Day</span>
            <select
              value={date ?? ""}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5"
            >
              {selected?.dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={starting || instrumentId === null || date === null}
            onClick={() =>
              instrumentId !== null && date !== null && void start({ instrumentId, date })
            }
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Start practice
          </button>
        </div>
      </section>

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 md:col-span-2"
        >
          {error}
        </p>
      )}
    </div>
  );
}
