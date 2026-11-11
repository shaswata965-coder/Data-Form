export function ConsentBadge({ consent }: { consent: boolean }) {
  return consent ? (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800">
      Consent: Yes
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-sm font-semibold text-slate-700">
      Consent: No
    </span>
  );
}
