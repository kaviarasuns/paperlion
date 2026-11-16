import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <header className="mb-4 flex items-baseline justify-between">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          PaperLion
        </Link>
        <span className="text-xs text-neutral-500">
          Virtual money on synthetic fixture prices. Not market data.
        </span>
      </header>
      <Outlet />
    </div>
  );
}
