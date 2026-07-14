import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

import { neon, neonConfig } from '@neondatabase/serverless';
import { Pool } from 'pg';

import { readReplicas } from './read-replicas/extension';

import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// FORK-ONLY (keep out of upstream PRs): DATABASE_DRIVER=pg runs against plain
// Postgres (self-hosted) instead of Neon's serverless protocol.
const usePg = process.env.DATABASE_DRIVER === 'pg';

/** Minimal shape the raw-SQL service layer needs (`.query(text, params) -> rows`). */
export interface RawQueryable {
  query: (text: string, params?: unknown[]) => Promise<unknown[]>;
}

const pgRawClient = (connectionString: string): RawQueryable => {
  const pool = new Pool({ connectionString, max: 5 });
  return {
    query: async (text, params) => {
      const result = await pool.query(text, params ?? []);
      return result.rows as unknown[];
    },
  };
};

const makeAdapter = (connectionString: string) =>
  usePg
    ? new PrismaPg({ connectionString })
    : new PrismaNeon({ connectionString });

type TransfersAdapter = ReturnType<typeof makeAdapter>;

const globalForPrisma = global as unknown as {
  transfersDb: PrismaClient;
  transfersDbAdapter: TransfersAdapter;
};

const transfersDbAdapter =
  globalForPrisma.transfersDbAdapter ||
  makeAdapter(process.env.TRANSFERS_DB_URL!);
if (process.env.NODE_ENV !== 'production')
  globalForPrisma.transfersDbAdapter = transfersDbAdapter;

export const transfersHttpPrimary: RawQueryable = usePg
  ? pgRawClient(process.env.TRANSFERS_DB_URL!)
  : neon(process.env.TRANSFERS_DB_URL!);

const replicaUrls = [
  process.env.TRANSFERS_DB_URL_REPLICA_1,
  process.env.TRANSFERS_DB_URL_REPLICA_2,
  process.env.TRANSFERS_DB_URL_REPLICA_3,
  process.env.TRANSFERS_DB_URL_REPLICA_4,
  process.env.TRANSFERS_DB_URL_REPLICA_5,
].filter((url): url is string => !!url);

export const transfersHttpReplicas: RawQueryable[] = replicaUrls.map(url =>
  usePg ? pgRawClient(url) : neon(url)
);

export const transfersDb =
  globalForPrisma.transfersDb ||
  new PrismaClient({
    adapter: transfersDbAdapter,
  });

if (process.env.NODE_ENV !== 'production')
  globalForPrisma.transfersDb = transfersDb;

const hasReplicas =
  process.env.TRANSFERS_DB_URL_REPLICA_1 !== undefined ||
  process.env.TRANSFERS_DB_URL_REPLICA_2 !== undefined ||
  process.env.TRANSFERS_DB_URL_REPLICA_3 !== undefined ||
  process.env.TRANSFERS_DB_URL_REPLICA_4 !== undefined ||
  process.env.TRANSFERS_DB_URL_REPLICA_5 !== undefined;

const createReplicaClient = (url: string) => {
  return new PrismaClient({
    adapter: makeAdapter(url),
  });
};

export const transfersDbReadReplicas = hasReplicas
  ? transfersDb.$extends(
      readReplicas({
        replicas: [
          ...(process.env.TRANSFERS_DB_URL_REPLICA_1
            ? [createReplicaClient(process.env.TRANSFERS_DB_URL_REPLICA_1)]
            : []),
          ...(process.env.TRANSFERS_DB_URL_REPLICA_2
            ? [createReplicaClient(process.env.TRANSFERS_DB_URL_REPLICA_2)]
            : []),
          ...(process.env.TRANSFERS_DB_URL_REPLICA_3
            ? [createReplicaClient(process.env.TRANSFERS_DB_URL_REPLICA_3)]
            : []),
          ...(process.env.TRANSFERS_DB_URL_REPLICA_4
            ? [createReplicaClient(process.env.TRANSFERS_DB_URL_REPLICA_4)]
            : []),
          ...(process.env.TRANSFERS_DB_URL_REPLICA_5
            ? [createReplicaClient(process.env.TRANSFERS_DB_URL_REPLICA_5)]
            : []),
        ],
      })
    )
  : undefined;
