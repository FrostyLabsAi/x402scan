-- FORK-ONLY: allow multiple payTo wallets per (resource, scheme, network).
-- Upstream dedupes accepts to one row per network, but a self-hosted instance
-- needs to keep HISTORICAL payout wallets mapped (e.g. an agent that rotated
-- its settle wallet) so past on-chain transfers stay attributed to the origin
-- in Top Servers / origin stats. payTo joins the unique key; identical rows
-- still dedupe. Idempotent: safe if already applied out-of-band.
DROP INDEX IF EXISTS "Accepts_resourceId_scheme_network_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Accepts_resourceId_scheme_network_payTo_key"
  ON "public"."Accepts"("resourceId", "scheme", "network", "payTo");
