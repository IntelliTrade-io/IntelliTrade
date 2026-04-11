import { promises as fs } from "node:fs";
import path from "node:path";

import type { CacheAdapter, CacheRecord, SetCacheValueArgs } from "@/lib/cache";

type FileCacheOptions = {
  cacheDir: string;
  ttlSeconds: number;
};

type FileCacheEnvelope<T> = CacheRecord<T> & {
  cacheKey: string;
  query: string;
  window: string;
};

export class FileCacheAdapter<T> implements CacheAdapter<T> {
  readonly name = "file_cache" as const;

  constructor(private readonly options: FileCacheOptions) {}

  get ttlSeconds() {
    return this.options.ttlSeconds;
  }

  async get(key: string) {
    const filePath = this.getFilePath(key);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as FileCacheEnvelope<T>;

      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        await fs.rm(filePath, { force: true });
        return null;
      }

      return {
        payload: parsed.payload,
        createdAt: parsed.createdAt,
        expiresAt: parsed.expiresAt
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async set(args: SetCacheValueArgs<T>) {
    await fs.mkdir(this.options.cacheDir, { recursive: true });

    const now = new Date();
    const payload: FileCacheEnvelope<T> = {
      cacheKey: args.key,
      payload: args.payload,
      query: args.query,
      window: args.window,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + this.options.ttlSeconds * 1000
      ).toISOString()
    };

    await fs.writeFile(
      this.getFilePath(args.key),
      JSON.stringify(payload, null, 2),
      "utf8"
    );
  }

  async cleanup() {
    try {
      await fs.mkdir(this.options.cacheDir, { recursive: true });
      const entries = await fs.readdir(this.options.cacheDir);

      await Promise.all(
        entries.map(async (entry) => {
          const filePath = path.join(this.options.cacheDir, entry);
          const raw = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(raw) as Partial<FileCacheEnvelope<T>>;

          if (!parsed.expiresAt || new Date(parsed.expiresAt) <= new Date()) {
            await fs.rm(filePath, { force: true });
          }
        })
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private getFilePath(key: string) {
    return path.join(this.options.cacheDir, `${key}.json`);
  }
}

export function createFileCache<T>(options: FileCacheOptions) {
  return new FileCacheAdapter<T>(options);
}
