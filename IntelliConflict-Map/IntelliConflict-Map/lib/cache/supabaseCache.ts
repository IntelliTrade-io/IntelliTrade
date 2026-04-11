import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { CacheAdapter, CacheRecord, SetCacheValueArgs } from "@/lib/cache";

if (typeof window !== "undefined") {
  throw new Error(
    "Supabase cache is server-only and must not run in the browser."
  );
}

type SupabaseCacheRow<T> = {
  cache_key: string;
  created_at: string;
  expires_at: string;
  payload: T;
  query: string;
  window: string;
};

type SupabaseCacheOptions = {
  client?: SupabaseClient;
  ttlSeconds: number;
};

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export class SupabaseCacheAdapter<T> implements CacheAdapter<T> {
  readonly name = "supabase_cache" as const;
  private readonly client: SupabaseClient;

  constructor(private readonly options: SupabaseCacheOptions) {
    this.client = options.client ?? createAdminClient();
  }

  get ttlSeconds() {
    return this.options.ttlSeconds;
  }

  async get(key: string): Promise<CacheRecord<T> | null> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.client
      .from("conflict_cache")
      .select("payload, created_at, expires_at")
      .eq("cache_key", key)
      .gt("expires_at", nowIso)
      .maybeSingle<SupabaseCacheRow<T>>();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      payload: data.payload,
      createdAt: data.created_at,
      expiresAt: data.expires_at
    };
  }

  async set(args: SetCacheValueArgs<T>) {
    const now = new Date();
    const payload: SupabaseCacheRow<T> = {
      cache_key: args.key,
      payload: args.payload,
      query: args.query,
      window: args.window,
      created_at: now.toISOString(),
      expires_at: new Date(
        now.getTime() + this.options.ttlSeconds * 1000
      ).toISOString()
    };

    const { error } = await this.client.from("conflict_cache").upsert(payload);

    if (error) {
      throw error;
    }
  }

  async cleanup() {
    const nowIso = new Date().toISOString();
    const { error } = await this.client
      .from("conflict_cache")
      .delete()
      .lte("expires_at", nowIso);

    if (error) {
      throw error;
    }
  }
}

export function createSupabaseCache<T>(options: SupabaseCacheOptions) {
  return new SupabaseCacheAdapter<T>(options);
}
