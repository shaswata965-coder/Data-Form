import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/admin/LoginForm";
import { ToothIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Admin login · Oral Health Data Form",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-800 text-white">
            <ToothIcon className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin login</h1>
            <p className="text-sm text-slate-600">Oral Health Data Form</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          Collecting data? <Link href="/" prefetch={false} className="font-semibold text-teal-800 underline">
            Open the form
          </Link> – no login
          needed.
        </p>
      </div>
    </main>
  );
}
