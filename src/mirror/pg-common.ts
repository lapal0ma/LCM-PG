type PgModule = typeof import("pg");

const pools = new Map<string, InstanceType<PgModule["Pool"]>>();

export async function loadPg(): Promise<PgModule> {
  try {
    return await import("pg");
  } catch {
    throw new Error("Optional dependency `pg` is not installed; install it to use LCM_MIRROR_*");
  }
}

export function getOrCreatePgPool(
  pg: PgModule,
  options: {
    connectionString: string;
    max?: number;
    idleTimeoutMillis?: number;
  },
): InstanceType<PgModule["Pool"]> {
  const max = options.max ?? 4;
  const idleTimeoutMillis = options.idleTimeoutMillis ?? 30_000;
  let pool = pools.get(options.connectionString);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: options.connectionString,
      max,
      idleTimeoutMillis,
    });
    pools.set(options.connectionString, pool);
  }
  return pool;
}

export async function closeAllPgPools(): Promise<void> {
  const closing = [...pools.values()].map((pool) => pool.end());
  pools.clear();
  await Promise.all(closing);
}
