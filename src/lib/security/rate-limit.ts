import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

async function identifierHash(scope: string, identity: string) {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${scope}:${ipAddress}:${identity.trim().toLowerCase()}`).digest("hex");
}

export async function consumeRateLimit({
  scope,
  identity,
  maxAttempts,
  windowSeconds,
  blockSeconds,
}: {
  scope: string;
  identity: string;
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
}) {
  const admin = createAdminClient();
  if (!admin) {
    return { allowed: false, identifierHash: "" };
  }

  const hash = await identifierHash(scope, identity);
  const { data, error } = await admin.rpc("consume_request_rate_limit", {
    p_scope: scope,
    p_identifier_hash: hash,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
    p_block_seconds: blockSeconds,
  });

  return { allowed: !error && data === true, identifierHash: hash };
}

export async function clearRateLimit(scope: string, hash: string) {
  if (!hash) {
    return;
  }

  const admin = createAdminClient();
  if (admin) {
    await admin.rpc("clear_request_rate_limit", { p_scope: scope, p_identifier_hash: hash });
  }
}
