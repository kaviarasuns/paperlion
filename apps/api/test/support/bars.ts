import type { Bar, OrderId } from "@paperlion/contracts";

/** Builds a bar from `open high low close`; `minute` is its position in the day. */
export const bar = (minute: number, ohlc: [number, number, number, number]): Bar => ({
  minute,
  open: ohlc[0],
  high: ohlc[1],
  low: ohlc[2],
  close: ohlc[3],
  volume: 1000,
});

export const flat = (minute: number, price: number): Bar =>
  bar(minute, [price, price, price, price]);

export const sequentialIds = () => {
  let n = 0;
  return () => `order-${++n}` as OrderId;
};
