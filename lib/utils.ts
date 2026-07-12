import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sanitize a post-auth `?redirect=` target. Returns the path only when it is a
 * same-origin relative path (starts with "/", not "//"); otherwise null. Mirrors
 * the open-redirect guard in app/auth/confirm/route.ts (safeNext) so a crafted
 * redirect can't bounce users to an external site after login/sign-up.
 */
export function safeRelativePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}
