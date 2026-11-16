import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { ReplayRpcs, RPC_PATH } from "@paperlion/contracts";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { createServer } from "node:http";
import { ApiConfig } from "./config.ts";
import { PublicApiLive } from "./http/public-api.ts";
import { FixturePriceSource } from "./market/fixture-price-source.ts";
import { ReplayRpcsLive } from "./replay/rpc-handlers.ts";
import { SessionStoreInMemory } from "./replay/session-store.ts";

const RpcRoutes = RpcServer.layerHttp({
  group: ReplayRpcs,
  path: RPC_PATH,
  protocol: "http",
}).pipe(Layer.provide([ReplayRpcsLive, RpcSerialization.layerJson]));

const Routes = Layer.mergeAll(RpcRoutes, PublicApiLive);

const ServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const api = yield* ApiConfig;
    return NodeHttpServer.layer(createServer, { port: api.port, host: api.host });
  }),
);

const AppLive = HttpRouter.serve(Routes).pipe(
  Layer.provide(ServerLive),
  Layer.provide([FixturePriceSource, SessionStoreInMemory]),
);

Layer.launch(AppLive).pipe(NodeRuntime.runMain);
