"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type Kind = "account" | "instrument" | "strategy";

export default function JournalSetupPage() {
  const [kind, setKind] = useState<Kind>("account");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const body =
      kind === "account"
        ? {
            kind,
            name: form.get("name"),
            broker: form.get("broker") || null,
            base_currency: form.get("base_currency"),
          }
        : kind === "instrument"
          ? {
              kind,
              symbol: form.get("symbol"),
              asset_class: form.get("asset_class"),
              quote_currency: form.get("quote_currency"),
              contract_size: Number(form.get("contract_size")),
            }
          : {
              kind,
              name: form.get("name"),
              description: form.get("description") || null,
            };

    const response = await fetch("/api/journal/lookups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { error?: string };
    setMessage(response.ok ? `${kind} saved.` : result.error ?? "Save failed.");
    if (response.ok) event.currentTarget.reset();
    setPending(false);
  }

  return (
    <main className="journal-page mx-auto max-w-3xl">
      <div className="glass-panel">
        <div className="glass-panel-body">
          <div className="journal-kicker">Prerequisites</div>
          <h1 className="journal-brand-title">Journal reference data</h1>
          <p className="journal-brand-copy">
            Accounts and instruments are required before recording a trade. Strategies are optional.
          </p>
          <div className="form-actions">
            {(["account", "instrument", "strategy"] as Kind[]).map((value) => (
              <button key={value} type="button" className={kind === value ? "journal-button-primary" : "journal-button"} onClick={() => setKind(value)}>
                {value}
              </button>
            ))}
          </div>
          <form className="journal-grid journal-grid-2 mt-6" onSubmit={submit}>
            {kind === "account" ? (
              <>
                <label className="form-field">Name<input className="journal-input" name="name" required /></label>
                <label className="form-field">Broker<input className="journal-input" name="broker" /></label>
                <label className="form-field">Base currency<input className="journal-input" name="base_currency" defaultValue="USD" maxLength={3} required /></label>
              </>
            ) : kind === "instrument" ? (
              <>
                <label className="form-field">Symbol<input className="journal-input" name="symbol" required /></label>
                <label className="form-field">Asset class<select className="journal-select" name="asset_class">{["fx","crypto","equity","index","commodity"].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="form-field">Quote currency<input className="journal-input" name="quote_currency" defaultValue="USD" maxLength={3} required /></label>
                <label className="form-field">Contract size<input className="journal-input" name="contract_size" type="number" min="0.00000001" step="any" defaultValue="1" required /></label>
              </>
            ) : (
              <>
                <label className="form-field">Name<input className="journal-input" name="name" required /></label>
                <label className="form-field">Description<textarea className="journal-textarea" name="description" /></label>
              </>
            )}
            <div className="form-field-full form-actions">
              <button className="journal-button-primary" disabled={pending}>{pending ? "Saving..." : "Save prerequisite"}</button>
              <Link className="journal-button" href="/dashboardv2/journal/trades/new">Continue to trade</Link>
            </div>
            {message ? <div className="form-field-full success-state">{message}</div> : null}
          </form>
        </div>
      </div>
    </main>
  );
}
