"use client";

import { useEffect, useState } from "react";

// The server does not know the visitor's timezone, so it emits a UTC label.
// After mount this swaps in the visitor's local time with a short timezone
// name so the row is never ambiguous about which zone it shows.
export function EventTime({ iso }: { iso: string }) {
  const [localLabel, setLocalLabel] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLocalLabel(
        new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZoneName: "short",
        }).format(new Date(iso)),
      );
    } catch {
      // keep the UTC fallback
    }
  }, [iso]);

  const utcLabel = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(iso));

  return (
    <time dateTime={iso} className="font-mono text-[13px] tabular-nums text-white/70">
      {localLabel ?? `${utcLabel} UTC`}
    </time>
  );
}
