import { describe, it, expect, vi, beforeEach } from "vitest";

// Auth mutation helpers wrap a browser Supabase client. Mock the client and
// assert each helper forwards the right args and propagates errors.
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();
const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword, signUp, signOut, resetPasswordForEmail, updateUser },
  }),
}));

vi.stubGlobal("window", { location: { origin: "https://app.test" } });

import * as auth from "@/lib/auth/client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signInWithPassword", () => {
  it("forwards email + password", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    await auth.signInWithPassword("a@b.com", "pw");
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
  });

  it("throws the supabase error", async () => {
    signInWithPassword.mockResolvedValue({ error: new Error("bad creds") });
    await expect(auth.signInWithPassword("a@b.com", "pw")).rejects.toThrow("bad creds");
  });
});

describe("signUpWithPassword", () => {
  it("passes the same-origin callback redirect and returns true when a session exists", async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const created = await auth.signUpWithPassword("a@b.com", "pw");
    expect(created).toBe(true);
    expect(signUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "pw",
      options: { emailRedirectTo: "https://app.test/auth/callback" },
    });
  });

  it("returns false when email confirmation is required (no session)", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(auth.signUpWithPassword("a@b.com", "pw")).resolves.toBe(false);
  });

  it("throws the supabase error", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: new Error("taken") });
    await expect(auth.signUpWithPassword("a@b.com", "pw")).rejects.toThrow("taken");
  });
});

describe("signOut", () => {
  it("calls supabase signOut and swallows the result", async () => {
    signOut.mockResolvedValue({ error: null });
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe("requestPasswordReset", () => {
  it("targets the update-password page on the current origin", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    await auth.requestPasswordReset("a@b.com");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
      redirectTo: "https://app.test/auth/update-password",
    });
  });

  it("throws the supabase error", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: new Error("no user") });
    await expect(auth.requestPasswordReset("a@b.com")).rejects.toThrow("no user");
  });
});

describe("updatePassword", () => {
  it("forwards the new password", async () => {
    updateUser.mockResolvedValue({ error: null });
    await auth.updatePassword("newpw");
    expect(updateUser).toHaveBeenCalledWith({ password: "newpw" });
  });

  it("throws the supabase error", async () => {
    updateUser.mockResolvedValue({ error: new Error("weak") });
    await expect(auth.updatePassword("newpw")).rejects.toThrow("weak");
  });
});
