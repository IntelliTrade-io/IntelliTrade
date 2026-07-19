// Pure validation for newsletter signups — shared by the API route and tests.
// Deliberately strict-but-simple: the definitive check is the confirmation
// email once a provider is wired up; this only keeps junk out of the table.

/** Closed set of signup surfaces, so the source column stays queryable. */
export const NEWSLETTER_SOURCES = [
  "currency-strength",
  "blog",
  "economic-calendar",
  "forex-market-hours",
  "other",
] as const;

export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalized email, or null when it does not look like a deliverable address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

/** Coerces an arbitrary source value onto the closed set. */
export function normalizeSource(raw: unknown): NewsletterSource {
  return NEWSLETTER_SOURCES.includes(raw as NewsletterSource)
    ? (raw as NewsletterSource)
    : "other";
}
