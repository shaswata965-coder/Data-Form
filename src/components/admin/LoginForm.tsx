"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.message ?? `Login failed (${res.status})`);
    } catch {
      setError("No internet connection. The admin area needs to be online.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Username</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="input mt-1"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input mt-1" />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-[15px] font-medium text-red-800">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary h-13 w-full">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
