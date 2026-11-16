import type { Bar, Order, Position } from "@paperlion/contracts";
import {
  CandlestickSeries,
  createChart,
  type IPriceLine,
  type ISeriesApi,
  LineStyle,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { clockTime } from "../lib/format.ts";

type Props = {
  bars: ReadonlyArray<Bar>;
  orders: ReadonlyArray<Order>;
  positions: ReadonlyArray<Position>;
};

// Bars carry no date, so they are plotted on a made-up day and labelled by clock time only.
const toChartTime = (minute: number) => (minute * 60) as UTCTimestamp;
const labelTime = (time: unknown) => clockTime(Math.round(Number(time) / 60));

export function CandleChart({ bars, orders, positions }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lines = useRef<Array<IPriceLine>>([]);

  useEffect(() => {
    if (container.current === null) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { color: "#ffffff" }, textColor: "#525252" },
      grid: { vertLines: { color: "#f5f5f5" }, horzLines: { color: "#f5f5f5" } },
      rightPriceScale: { borderColor: "#e5e5e5" },
      timeScale: {
        borderColor: "#e5e5e5",
        rightOffset: 4,
        tickMarkFormatter: labelTime,
      },
      localization: { timeFormatter: labelTime },
    });
    series.current = chart.addSeries(CandlestickSeries, {
      upColor: "#059669",
      downColor: "#dc2626",
      borderUpColor: "#059669",
      borderDownColor: "#dc2626",
      wickUpColor: "#059669",
      wickDownColor: "#dc2626",
    });
    return () => {
      series.current = null;
      lines.current = [];
      chart.remove();
    };
  }, []);

  useEffect(() => {
    series.current?.setData(
      bars.map((b) => ({
        time: toChartTime(b.minute),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
  }, [bars]);

  useEffect(() => {
    const target = series.current;
    if (target === null) return;
    for (const line of lines.current) target.removePriceLine(line);
    const next: Array<IPriceLine> = [];
    for (const order of orders) {
      if (order.status !== "open") continue;
      const price = order.triggered ? order.price : (order.triggerPrice ?? order.price);
      if (price === null) continue;
      next.push(
        target.createPriceLine({
          price,
          color: order.side === "BUY" ? "#059669" : "#dc2626",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: true,
          title: `${order.side} ${order.qty} ${order.type}`,
        }),
      );
    }
    for (const position of positions) {
      if (position.qty === 0) continue;
      next.push(
        target.createPriceLine({
          price: position.avgPrice,
          color: "#2563eb",
          lineStyle: LineStyle.Solid,
          lineWidth: 1,
          axisLabelVisible: true,
          title: `${position.product} ${position.qty > 0 ? "long" : "short"} ${Math.abs(position.qty)}`,
        }),
      );
    }
    lines.current = next;
  }, [orders, positions]);

  return <div ref={container} className="h-[440px] w-full" />;
}
