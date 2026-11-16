import { Config } from "effect";

export const ApiConfig = Config.all({
  port: Config.Port("API_PORT").pipe(Config.withDefault(4000)),
  /** The API is a single-user local tool: it listens on loopback only. */
  host: Config.String("API_HOST").pipe(Config.withDefault("127.0.0.1")),
});
