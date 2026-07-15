// Convert an ISO datetime (the post's publishedAt) to a YYYY-MM-DD calendar
// date in the Europe/Amsterdam timezone. The marketContext `date` field drives
// which asset context is "today" on the price pages, and the business day is
// the Amsterdam trading day, not UTC. No date libraries.
export function amsterdamDateOf(isoDatetime: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD.
  return formatter.format(new Date(isoDatetime));
}
