const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatRupees = (value: number): string => rupees.format(value);

export const formatSigned = (value: number): string =>
  `${value > 0 ? "+" : ""}${rupees.format(value)}`;

/** Tailwind text colour for a profit or loss figure. */
export const pnlColour = (value: number): string =>
  value > 0 ? "text-emerald-700" : value < 0 ? "text-red-700" : "text-neutral-700";

const OPEN_MINUTE_OF_DAY = 9 * 60 + 15;

/** Clock time (IST) of a bar counted in minutes from the 09:15 open. */
export const clockTime = (minute: number): string => {
  const total = OPEN_MINUTE_OF_DAY + minute;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};
