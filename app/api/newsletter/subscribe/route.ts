import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeEmail, normalizeSource } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

// Public endpoint (free-tier surface): captures an email for the weekly
// strength digest. No auth by design; abuse resistance = strict validation,
// a honeypot field, and idempotent upserts (re-subscribing is a no-op, so the
// endpoint leaks nothing about which emails exist).

export async function POST(request: Request) {
  let body: { email?: unknown; source?: unknown; website?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot: real users never fill the visually hidden "website" field.
  // Answer success so bots learn nothing.
  if (typeof body.website === "string" && body.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .upsert(
      { email, source: normalizeSource(body.source) },
      { onConflict: "email", ignoreDuplicates: true },
    );

  if (error) {
    console.error("[newsletter] subscribe failed:", error.message);
    return NextResponse.json({ error: "Could not subscribe right now" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
