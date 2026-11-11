import type { Metadata } from "next";
import Link from "next/link";
import { ToothIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Admin · Oral Health Data Form",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh">
      <header className="bg-teal-800 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <ToothIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-semibold">Oral Health Data</span>
              <span className="block text-xs text-teal-100">Admin</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
            <Link href="/" prefetch={false} className="hidden rounded-lg px-3 py-2 hover:bg-white/15 sm:block">
              Open form
            </Link>
            <form action="/api/admin/logout" method="post">
              <button type="submit" className="rounded-lg px-3 py-2 hover:bg-white/15">
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
