// Thin typed fetch wrapper — the standard way to call internal API routes
// from client components (refactor plan 5.2). Server components should fetch
// data directly (Supabase/Sanity server clients) instead of going through
// HTTP round-trips to our own routes.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) {
    // Our routes return { error } bodies on failure — surface that message.
    let message = `${init?.method ?? "GET"} ${path} failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") message = body.error;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

export function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return request<T>(path, {
    method: "POST",
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json", ...init?.headers },
      body: JSON.stringify(body),
    }),
    ...init,
  });
}
