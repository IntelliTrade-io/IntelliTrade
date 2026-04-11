import { createHash } from "node:crypto";
import path from "node:path";

import { createFileCache } from "@/lib/cache/fileCache";
import { createSupabaseCache } from "@/lib/cache/supabaseCache";
import { CACHE_SCHEMA_VERSION } from "@/lib/cache/version";

export type CacheAdapterName = "supabase_cache" | "file_cache";

export type CacheRecord<T> = {
  payload: T;
  createdAt: string;
  expiresAt: string;
};

export type SetCacheValueArgs<T> = {
  key: string;
  payload: T;
  window: string;
  query: string;
};

export interface CacheAdapter<T> {
  name: CacheAdapterName;
  ttlSeconds: number;
  get(key: string): Promise<CacheRecord<T> | null>;
  set(args: SetCacheValueArgs<T>): Promise<void>;
  cleanup(): Promise<void>;
}

export function shouldCleanup(randomValue = Math.random()) {
  return randomValue < 0.05;
}

export function buildCacheKey(input: {
  window: string;
  query: string;
  limit: number;
}) {
  const normalizedInput = {
    version: CACHE_SCHEMA_VERSION,
    window: input.window,
    query: input.query.trim(),
    limit: input.limit
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(normalizedInput))
    .digest("hex")
    .slice(0, 16);

  return `conflicts_${CACHE_SCHEMA_VERSION}_${input.window}_${hash}`;
}

export function selectCacheAdapter<T>(options?: {
  ttlSeconds?: number;
  cacheDir?: string;
}) {
  const ttlSeconds = options?.ttlSeconds ?? 900;
  const cacheDir = options?.cacheDir ?? path.join(process.cwd(), ".cache");

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseCache<T>({
      ttlSeconds
    });
  }

  return createFileCache<T>({
    ttlSeconds,
    cacheDir
  });
}
