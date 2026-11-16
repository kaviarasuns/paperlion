import type { OrderType, Product, Side } from "@paperlion/contracts";
import { type FormEvent, useState } from "react";

export type TicketOrder = {
  side: Side;
  product: Product;
  type: OrderType;
  qty: number;
  price?: number;
  triggerPrice?: number;
};

type Props = {
  lastPrice: number;
  disabled: boolean;
  onSubmit: (order: TicketOrder) => void;
};

const ORDER_TYPES: ReadonlyArray<{ value: OrderType; label: string }> = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
  { value: "SL", label: "Stop-limit (SL)" },
  { value: "SL-M", label: "Stop-market (SL-M)" },
];

const inputClass = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm";

export function OrderTicket({ lastPrice, disabled, onSubmit }: Props) {
  const [side, setSide] = useState<Side>("BUY");
  const [product, setProduct] = useState<Product>("MIS");
  const [type, setType] = useState<OrderType>("MARKET");
  const [qty, setQty] = useState("10");
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");

  const needsPrice = type === "LIMIT" || type === "SL";
  const needsTrigger = type === "SL" || type === "SL-M";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      side,
      product,
      type,
      qty: Number(qty),
      ...(needsPrice ? { price: Number(price) } : {}),
      ...(needsTrigger ? { triggerPrice: Number(triggerPrice) } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["BUY", "SELL"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={side === value}
            onClick={() => setSide(value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              side === value
                ? value === "BUY"
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white"
                : "border border-neutral-300 bg-white text-neutral-700"
            }`}
          >
            {value === "BUY" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">Product</span>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as Product)}
            className={inputClass}
          >
            <option value="MIS">Intraday (MIS)</option>
            <option value="CNC">Delivery (CNC)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600">Quantity</span>
          <input
            type="number"
            min={1}
            step={1}
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-neutral-600">Order type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as OrderType)}
          className={inputClass}
        >
          {ORDER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {(needsPrice || needsTrigger) && (
        <div className="grid grid-cols-2 gap-2">
          {needsTrigger && (
            <label className="text-sm">
              <span className="mb-1 block text-neutral-600">Trigger price</span>
              <input
                type="number"
                min={0.05}
                step={0.05}
                required
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                className={inputClass}
              />
            </label>
          )}
          {needsPrice && (
            <label className="text-sm">
              <span className="mb-1 block text-neutral-600">Limit price</span>
              <input
                type="number"
                min={0.05}
                step={0.05}
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </label>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        className={`w-full rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
          side === "BUY" ? "bg-emerald-600" : "bg-red-600"
        }`}
      >
        {side === "BUY" ? "Buy" : "Sell"} {qty || 0} at{" "}
        {type === "MARKET" ? `market (last ${lastPrice.toFixed(2)})` : type}
      </button>
    </form>
  );
}
