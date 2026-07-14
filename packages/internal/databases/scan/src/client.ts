import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

import { neonConfig } from '@neondatabase/serverless';

import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// FORK-ONLY (keep out of upstream PRs): DATABASE_DRIVER=pg runs against plain
// Postgres (self-hosted) instead of Neon's serverless protocol.
const usePg = process.env.DATABASE_DRIVER === 'pg';

const makeAdapter = (connectionString: string) =>
  usePg
    ? new PrismaPg({ connectionString })
    : new PrismaNeon({ connectionString });

type ScanAdapter = ReturnType<typeof makeAdapter>;

const globalForPrisma = global as unknown as {
  scanDb: PrismaClient;
  scanDbAdapter: ScanAdapter;
};

const scanDbAdapter =
  globalForPrisma.scanDbAdapter || makeAdapter(process.env.SCAN_DATABASE_URL!);
if (process.env.NODE_ENV !== 'production')
  globalForPrisma.scanDbAdapter = scanDbAdapter;

export const scanDb =
  globalForPrisma.scanDb ||
  new PrismaClient({
    adapter: scanDbAdapter,
    omit: { resourceOrigin: { email: true } },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.scanDb = scanDb;
