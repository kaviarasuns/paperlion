import type { OrderId, SessionId, SessionView } from "@paperlion/contracts";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { CandleChart } from "../../components/candle-chart.tsx";
import { OrderTicket, type TicketOrder } from "../../components/order-ticket.tsx";
import { api, errorMessage } from "../../lib/api.ts";
import { clockTime, formatRupees, formatSigned, pnlColour } from "../../lib/format.ts";

export const Route = createFileRoute("/session/$sessionId")({
  component: SessionPage,
});

/** Bars per second of wall-clock time. */
const SPEEDS = [1, 4, 12] as const;

type Call = Parameters<typeof api.call<SessionView, unknown>>[0];

function SessionPage() {
  const { sessionId: rawSessionId } = Route.useParams();
  const sessionId = rawSessionId as SessionId;
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const busy = useRef(false);

  /** Runs one call at a time; a call made while another is in flight is dropped. */
  const run = useCallback(async (call: Call): Promise<"ok" | "failed" | "dropped"> => {
    if (busy.current) return "dropped";
    busy.current = true;
    try {
      const outcome = await api.call(call);
      if (outcome.ok) {
        setView(outcome.value);
        setError(null);
      } else {
        setError(errorMessage(outcome.error));
      }
      return outcome.ok ? "ok" : "failed";
    } catch {
      setError(errorMessage(null));
      return "failed";
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void run((client) => client.GetSession({ sessionId }));
  }, [run, sessionId]);

  const running = view?.status === "running";
  const autoplay = playing && running;

  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      void run((client) => client.AdvanceSession({ sessionId, bars: 1 })).then((result) => {
        if (result === "failed") setPlaying(false);
      });
    }, 1000 / speed);
    return () => clearInterval(timer);
  }, [autoplay, speed, run, sessionId]);

  if (view === null) {
    return (
      <p role={error === null ? "status" : "alert"} className="py-8 text-center text-neutral-600">
        {error ?? "Loading session…"}
      </p>
    );
  }

  const lastBar = view.bars.at(-1);
  const lastPrice = lastBar?.close ?? 0;
  const pnl = view.equity - view.startingCash;
  const openOrders = view.orders.filter((o) => o.status === "open");

  const place = (order: TicketOrder) =>
    void run((client) => client.PlaceOrder({ sessionId, ...order }));
  const cancel = (orderId: OrderId) =>
    void run((client) => client.CancelOrder({ sessionId, orderId }));
  const step = (bars: number) => void run((client) => client.AdvanceSession({ sessionId, bars }));
  const finish = () => {
    setPlaying(false);
    void run((client) => client.FinishSession({ sessionId }));
  };

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-6">
        <Stat label="Stock" value={view.reveal?.name ?? "Hidden"} />
        <Stat label="Day" value={view.reveal?.date ?? "Hidden"} />
        <Stat
          label="Clock"
          value={`${clockTime(lastBar?.minute ?? 0)} · bar ${view.bars.length}/${view.totalBars}`}
        />
        <Stat label="Equity" value={formatRupees(view.equity)} />
        <Stat label="Net P&L" value={formatSigned(pnl)} className={pnlColour(pnl)} />
        <Stat label="Charges paid" value={formatRupees(view.totalCharges)} />
      </section>

      {!running && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-300 bg-neutral-900 px-4 py-3 text-white">
          <p className="text-sm">
            Session finished on <strong>{view.reveal?.name}</strong>, {view.reveal?.date}. Net
            result after charges: <strong>{formatSigned(pnl)}</strong>.
          </p>
          <Link
            to="/"
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900"
          >
            New session
          </Link>
        </section>
      )}

      {error !== null && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="rounded-lg border border-neutral-200 bg-white p-3">
          <CandleChart bars={view.bars} orders={view.orders} positions={view.positions} />
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
            <button
              type="button"
              disabled={!running}
              onClick={() => setPlaying((p) => !p)}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {autoplay ? "Pause" : "Play"}
            </button>
            <div className="flex overflow-hidden rounded-md border border-neutral-300" role="group">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                  className={`px-2.5 py-1.5 text-sm ${speed === s ? "bg-neutral-200 font-medium" : "bg-white"}`}
                >
                  {s} bar/s
                </button>
              ))}
            </div>
            {[1, 5, 15].map((bars) => (
              <button
                key={bars}
                type="button"
                disabled={!running || autoplay}
                onClick={() => step(bars)}
                className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm disabled:opacity-40"
              >
                +{bars} min
              </button>
            ))}
            <button
              type="button"
              disabled={!running}
              onClick={finish}
              className="ml-auto rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              Square off and finish
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Order</h2>
          <OrderTicket lastPrice={lastPrice} disabled={!running} onSubmit={place} />
          <p className="mt-3 text-xs text-neutral-500">
            Cash {formatRupees(view.cash)}. Intraday orders need 20% margin; delivery needs the full
            value.
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Positions" empty="No positions yet." isEmpty={view.positions.length === 0}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 font-medium">Product</th>
                <th className="py-1 text-right font-medium">Qty</th>
                <th className="py-1 text-right font-medium">Avg</th>
                <th className="py-1 text-right font-medium">Unrealised</th>
                <th className="py-1 text-right font-medium">Realised</th>
              </tr>
            </thead>
            <tbody>
              {view.positions.map((p) => (
                <tr key={p.product} className="border-t border-neutral-100">
                  <td className="py-1">{p.product}</td>
                  <td className="py-1 text-right tabular-nums">{p.qty}</td>
                  <td className="py-1 text-right tabular-nums">{p.avgPrice.toFixed(2)}</td>
                  <td className={`py-1 text-right tabular-nums ${pnlColour(p.unrealisedPnl)}`}>
                    {formatSigned(p.unrealisedPnl)}
                  </td>
                  <td className={`py-1 text-right tabular-nums ${pnlColour(p.realisedPnl)}`}>
                    {formatSigned(p.realisedPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Open orders" empty="No open orders." isEmpty={openOrders.length === 0}>
          <ul className="divide-y divide-neutral-100 text-sm">
            {openOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  <span className={o.side === "BUY" ? "text-emerald-700" : "text-red-700"}>
                    {o.side}
                  </span>{" "}
                  {o.qty} {o.product} · {o.type}
                  {o.triggerPrice !== null && ` · trigger ${o.triggerPrice.toFixed(2)}`}
                  {o.price !== null && ` · limit ${o.price.toFixed(2)}`}
                  {o.triggered && " · triggered"}
                </span>
                <button
                  type="button"
                  disabled={!running}
                  onClick={() => cancel(o.id)}
                  className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Fills" empty="No fills yet." isEmpty={view.fills.length === 0}>
          <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto text-sm">
            {[...view.fills].reverse().map((f) => (
              <li key={f.orderId} className="py-1.5">
                <div className="flex justify-between gap-2">
                  <span>
                    <span className={f.side === "BUY" ? "text-emerald-700" : "text-red-700"}>
                      {f.side}
                    </span>{" "}
                    {f.qty} {f.product} at {f.price.toFixed(2)}
                  </span>
                  <span className="text-neutral-500">{clockTime(f.minute)}</span>
                </div>
                <div className="text-xs text-neutral-500">
                  Charges {formatRupees(f.charges.total)}: brokerage{" "}
                  {f.charges.brokerage.toFixed(2)}, STT {f.charges.stt.toFixed(2)}, exchange{" "}
                  {f.charges.exchange.toFixed(2)}, SEBI {f.charges.sebi.toFixed(2)}, stamp{" "}
                  {f.charges.stampDuty.toFixed(2)}, GST {f.charges.gst.toFixed(2)}
                  {f.slippage > 0 && ` · slippage ${f.slippage.toFixed(2)}/share`}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

function Panel(props: { title: string; empty: string; isEmpty: boolean; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold">{props.title}</h2>
      {props.isEmpty ? <p className="text-sm text-neutral-500">{props.empty}</p> : props.children}
    </section>
  );
}
