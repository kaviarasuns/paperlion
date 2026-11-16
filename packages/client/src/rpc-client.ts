import { ReplayRpcs, RPC_PATH } from "@paperlion/contracts";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, type RpcClientError, type RpcGroup, RpcSerialization } from "effect/rpc";

type ReplayRpcClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof ReplayRpcs>,
  RpcClientError.RpcClientError
>;

class ReplayClient extends Context.Service<ReplayClient, ReplayRpcClient>()("ReplayClient") {}

export type RpcOutcome<A, E> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: E };

export interface ReplayApi {
  /**
   * Runs one or more RPC calls and resolves with the value or the typed error.
   * The promise only rejects on a defect (a bug), never on an expected failure.
   */
  readonly call: <A, E>(
    f: (client: ReplayRpcClient) => Effect.Effect<A, E>,
  ) => Promise<RpcOutcome<A, E>>;
}

/** `baseUrl` is the origin that serves `/rpc`, without a trailing slash. */
export const makeReplayApi = (baseUrl: string): ReplayApi => {
  const protocol = RpcClient.layerProtocolHttp({ url: `${baseUrl}${RPC_PATH}` }).pipe(
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
  );
  const runtime = ManagedRuntime.make(
    Layer.effect(ReplayClient, RpcClient.make(ReplayRpcs)).pipe(Layer.provide(protocol)),
  );
  return {
    call: (f) =>
      runtime.runPromise(
        Effect.gen(function* () {
          return yield* f(yield* ReplayClient);
        }).pipe(
          Effect.match({
            onSuccess: (value) => ({ ok: true as const, value }),
            onFailure: (error) => ({ ok: false as const, error }),
          }),
        ),
      ),
  };
};
