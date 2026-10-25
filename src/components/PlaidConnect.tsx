"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

export default function PlaidConnect() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    fetch("/api/plaid/link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => (d.linkToken ? setToken(d.linkToken) : setStatus(d.error ?? "Bank linking is unavailable right now. Please try again later.")))
      .catch(() => setStatus("Bank linking is unavailable right now (couldn't reach Plaid). Please try again later."));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null) => {
      if (!publicToken) return;
      setStatus("Importing accounts and transactions…");
      try {
        const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicToken }) });
        const d = await r.json().catch(() => ({}));
        setStatus(r.ok ? `Linked ${d.accounts} accounts, imported ${d.upserted} transactions.` : d.error ?? "Linking failed. Please try again.");
        router.refresh();
      } catch {
        setStatus("Couldn't reach the server to finish linking. Check your connection and try again.");
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({ token, onSuccess });
  return (
    <div className="space-y-2">
      <button className="btn-primary w-full" disabled={!ready || !token} onClick={() => open()}>
        {token ? "🏦 Link a sandbox bank" : status ? "🏦 Bank linking unavailable" : "Preparing Plaid…"}
      </button>
      {status && <p role="status" className="text-xs text-muted">{status}</p>}
    </div>
  );
}
