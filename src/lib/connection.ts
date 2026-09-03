import { Connection, type Commitment } from "@solana/web3.js";
import type { AppConfig } from "../config.js";

/**
 * Reads and confirmations use "confirmed": fast enough to sequence a demo
 * against, and durable enough that a balance read after it is trustworthy.
 * Steps that must be irreversible before proceeding ask for "finalized"
 * explicitly at the call site.
 */
const DEFAULT_COMMITMENT: Commitment = "confirmed";

export function createConnection(
  config: AppConfig,
  commitment: Commitment = DEFAULT_COMMITMENT,
): Connection {
  return new Connection(config.rpcUrl, commitment);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Confirm the RPC is actually answering, and return its `solana-core` version.
 *
 * Called before any real work so an unreachable or misconfigured endpoint fails
 * here, naming the URL, rather than surfacing an opaque fetch error from
 * whichever call happened to run first.
 */
export async function assertReachable(connection: Connection): Promise<string> {
  let version: Awaited<ReturnType<Connection["getVersion"]>>;

  try {
    version = await connection.getVersion();
  } catch (error) {
    throw new Error(
      `Cannot reach the Solana RPC at ${connection.rpcEndpoint}: ${describe(error)}`,
    );
  }

  const core = version["solana-core"];
  if (!core) {
    throw new Error(
      `The endpoint at ${connection.rpcEndpoint} answered but reported no solana-core version; it may not be a Solana RPC.`,
    );
  }

  return core;
}
