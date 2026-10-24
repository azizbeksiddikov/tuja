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
      .then((d) => (d.linkToken ? setToken(d.linkToken) : setStatus(d.error ?? "Plaid unavailable")))
      .catch(() => setStatus("Plaid unavailable"));
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null) => {
      if (!publicToken) return;
      setStatus("Importing accounts and transactions…");
      const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicToken }) });
      const d = await r.json();
      setStatus(r.ok ? `Linked ${d.accounts} accounts, imported ${d.upserted} transactions.` : d.error ?? "Linking failed");
      router.refresh();
    },
    [router],
  );

  const { open, ready } = usePlaidLink({ token, onSuccess });
  return (
    <div className="space-y-2">
      <button className="btn-primary w-full" disabled={!ready || !token} onClick={() => open()}>
        🏦 Link a sandbox bank
      </button>
      {status && <p className="text-xs text-muted">{status}</p>}
    </div>
  );
}
