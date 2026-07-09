"use client";

// Centralized auth mutations (refactor plan 5.2) — components render forms
// and call these; no component builds its own Supabase client for auth.
// Each helper throws on failure; callers catch and surface the message.

import { createClient } from "@/lib/supabase/client";

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Returns true when a session was created immediately (email confirmation disabled). */
export async function signUpWithPassword(email: string, password: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
  return Boolean(data.session);
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/update-password`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
