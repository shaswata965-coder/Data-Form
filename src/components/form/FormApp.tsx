"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ALL_QUESTIONS,
  OHSI_REFERENCE,
  SCHEMA_VERSION,
  STEPS,
  isVisible,
  questionnaire,
  type Answers,
  type Question,
  type TextQuestion,
} from "@/lib/form-schema";
import { checkQuestion, cleanSubmission, validateStep, type FieldErrors } from "@/lib/validation";
import { clearDraft, hasContent, loadDraft, saveDraft, type Draft } from "@/lib/client/draft";
import { enqueue } from "@/lib/client/outbox";
import { newId, requestPersistentStorage, writeJSON } from "@/lib/client/storage";
import { registerServiceWorker } from "@/lib/client/sw-register";
import {
  AlertIcon,
  ArrowLeft,
  ArrowRight,
  CheckIcon,
  ClockIcon,
  CloudCheck,
  CloudOff,
  InfoIcon,
  ToothIcon,
  UploadIcon,
} from "../icons";
import { DevicePanel } from "./DevicePanel";
import {
  Bn,
  DmftField,
  ErrorText,
  MultiChoice,
  NumberField,
  SingleChoice,
  TextField,
  type Patch,
} from "./fields";
import { Review } from "./Review";
import { useDeviceSync, type DeviceSync } from "./useDeviceSync";

const LAST = STEPS.length - 1;
const participantIdQ = questionnaire.find((q) => q.id === "participantId") as TextQuestion;

const noopSubscribe = () => () => {};

function newDraft(): Draft {
  const now = new Date().toISOString();
  return { v: 1, clientId: newId(), answers: {}, stepIndex: 0, maxStep: 0, startedAt: now, updatedAt: now };
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function scrollToQuestion(id: string) {
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-question="${id}"]`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  });
}

/** After an answer, bring the next question into view if it is below the fold. */
function revealNextQuestion(answeredId: string) {
  window.setTimeout(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-question]"));
    const idx = cards.findIndex((c) => c.dataset.question === answeredId);
    const next = cards[idx + 1];
    if (!next) return;
    const top = next.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.55) {
      next.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }
  }, 160);
}

/** Renders a placeholder on the server and during hydration, the form after. */
export default function FormApp() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!hydrated) return <Skeleton />;
  return <FormInner />;
}

function Skeleton() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6" aria-busy="true">
        <p className="text-slate-600">Loading form… · <Bn>ফর্ম লোড হচ্ছে…</Bn></p>
        <div className="mt-4 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </main>
    </div>
  );
}

function AppHeader({ sync, onOpenPanel }: { sync?: DeviceSync; onOpenPanel?: () => void }) {
  const waiting = sync?.items.length ?? 0;
  return (
    <header className="bg-teal-800 text-white">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <ToothIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold">Oral Health Data Form</p>
          <p className="truncate text-xs text-teal-100">Annexure II &amp; IV</p>
        </div>
        {sync && (
          <button
            type="button"
            onClick={onOpenPanel}
            className="ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-sm font-medium hover:bg-white/25"
            aria-label={`Device status: ${sync.online ? "online" : "offline"}, ${waiting} waiting to upload`}
          >
            {sync.online && !sync.unstable ? (
              <CloudCheck className="h-5 w-5" />
            ) : (
              <CloudOff className="h-5 w-5" />
            )}
            <span>{sync.online ? (sync.unstable ? "Weak" : "Online") : "Offline"}</span>
            {waiting > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950">
                {waiting}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
}

interface Done {
  clientId: string;
  participantId: string;
  consent: boolean;
  phase: "uploading" | "settled";
}

function storageWorks(): boolean {
  return writeJSON("ohsi:probe", 1);
}

function FormInner() {
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft();
    return saved && hasContent(saved.answers) ? saved : newDraft();
  });
  const [restored, setRestored] = useState(() => hasContent(draft.answers));
  const [storageOk] = useState(storageWorks);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<Done | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sync = useDeviceSync();
  const panelRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const answers = draft.answers;
  const refusal = answers.consent === false;
  const step = STEPS[draft.stepIndex];

  useEffect(() => {
    void registerServiceWorker();
    void requestPersistentStorage();
  }, []);

  // Autosave every change so a reload, crash or closed tab never loses data.
  useEffect(() => {
    if (!done) saveDraft(draft);
  }, [draft, done]);

  // Move focus to the step title for keyboard & screen-reader users.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [draft.stepIndex, done]);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const patch: Patch = useCallback((p, opts) => {
    if (opts?.answeredId) {
      const current = answersRef.current;
      const wasEmpty = Object.keys(p).every((k) => {
        const v = current[k as keyof Answers];
        return v === undefined || (Array.isArray(v) && v.length === 0);
      });
      if (wasEmpty) revealNextQuestion(opts.answeredId);
    }
    setDraft((d) => ({ ...d, answers: { ...d.answers, ...p }, updatedAt: new Date().toISOString() }));
  }, []);

  // Errors are flagged when the collector presses Next; each one disappears
  // as soon as the answer is fixed.
  const shownErrors = useMemo(() => {
    const out: FieldErrors = {};
    for (const [id, err] of Object.entries(errors)) {
      if (id === "consent") {
        if (answers.consent === undefined) out[id] = err;
        continue;
      }
      const q = id === "participantId" ? participantIdQ : ALL_QUESTIONS.find((x) => x.id === id);
      if (q && checkQuestion(q, answers)) out[id] = checkQuestion(q, answers)!;
    }
    return out;
  }, [errors, answers]);

  const goTo = (index: number) => {
    setDraft((d) => ({ ...d, stepIndex: index, maxStep: Math.max(d.maxStep, index) }));
    window.scrollTo({ top: 0 });
  };

  const showErrors = (errs: FieldErrors) => {
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) scrollToQuestion(first);
  };

  const submit = async (toSave: Answers) => {
    const result = cleanSubmission(toSave);
    if (!result.ok) {
      const idx = STEPS.findIndex((s) =>
        s.id === "consent"
          ? Boolean(result.errors.consent || (refusal && result.errors.participantId))
          : s.questions.some((q) => result.errors[q.id]),
      );
      if (idx >= 0 && idx !== draft.stepIndex) goTo(idx);
      window.setTimeout(() => showErrors(result.errors), 50);
      return;
    }
    setSubmitting(true);
    setSaveError(null);
    const payload = {
      clientId: draft.clientId,
      clientCreatedAt: new Date().toISOString(),
      startedAt: draft.startedAt,
      schemaVersion: SCHEMA_VERSION,
      answers: result.answers,
    };
    try {
      await enqueue(payload);
    } catch {
      setSubmitting(false);
      setSaveError(
        "Could not save on this device. Free up storage or turn off private browsing, then try again.",
      );
      return;
    }
    clearDraft();
    setSubmitting(false);
    setDone({
      clientId: payload.clientId,
      participantId: result.answers.participantId ?? "",
      consent: result.answers.consent === true,
      phase: "uploading",
    });
    window.scrollTo({ top: 0 });
    await sync.flush();
    setDone((d) => (d && d.clientId === payload.clientId ? { ...d, phase: "settled" } : d));
  };

  const onPrimary = () => {
    if (step.id === "consent") {
      if (answers.consent === undefined) return showErrors({ consent: { en: "Please select Yes or No", bn: "হ্যাঁ অথবা না নির্বাচন করুন" } });
      if (refusal) {
        const e = checkQuestion(participantIdQ, answers);
        if (e) return showErrors({ participantId: e });
        void submit({ consent: false, participantId: answers.participantId });
        return;
      }
    }
    if (step.id === "review") {
      void submit(answers);
      return;
    }
    const errs = validateStep(step, answers);
    if (Object.keys(errs).length) return showErrors(errs);
    setErrors({});
    goTo(editingFromReview ? LAST : draft.stepIndex + 1);
  };

  const startNext = () => {
    setDraft(newDraft());
    setDone(null);
    setErrors({});
    setRestored(false);
    window.scrollTo({ top: 0 });
  };

  const discardCurrent = () => {
    clearDraft();
    startNext();
  };

  const openPanel = () => panelRef.current?.showModal();
  const editingFromReview = draft.maxStep === LAST && step.id !== "review" && !refusal;

  const duplicateWarning = (() => {
    const id = (answers.participantId ?? "").trim().toLowerCase();
    if (!id) return null;
    const hit = sync.log.find((e) => e.clientId !== draft.clientId && e.participantId.trim().toLowerCase() === id);
    if (!hit) return null;
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          A form with this Participant ID was already saved on this device (
          {new Date(hit.savedAt).toLocaleDateString("en-GB")}). Check the ID if this is a different person.
        </span>
      </p>
    );
  })();

  const renderQuestion = (q: Question) => {
    if (!isVisible(q, answers)) return null;
    const err = shownErrors[q.id];
    const next = () => revealNextQuestion(q.id);
    switch (q.kind) {
      case "single":
        return <SingleChoice key={q.id} q={q} answers={answers} error={err} patch={patch} />;
      case "multi":
        return <MultiChoice key={q.id} q={q} answers={answers} error={err} patch={patch} />;
      case "number":
        return <NumberField key={q.id} q={q} answers={answers} error={err} patch={patch} onEnter={next} />;
      case "text":
        return (
          <TextField
            key={q.id}
            q={q}
            answers={answers}
            error={err}
            patch={patch}
            onEnter={next}
            warning={q.id === "participantId" ? duplicateWarning : undefined}
          />
        );
      case "dmft":
        return <DmftField key={q.id} q={q} answers={answers} error={err} patch={patch} />;
    }
  };

  const visibleSteps = refusal ? 1 : STEPS.length;
  const primaryLabel = submitting
    ? { en: "Saving…", bn: "সংরক্ষণ হচ্ছে…" }
    : step.id === "consent" && refusal
      ? { en: "Save refusal", bn: "জমা দিন" }
      : step.id === "review"
        ? { en: "Submit", bn: "জমা দিন" }
        : editingFromReview
          ? { en: "Save & review", bn: "যাচাই করুন" }
          : step.id === "consent"
            ? { en: "Start", bn: "শুরু করুন" }
            : { en: "Next", bn: "পরবর্তী" };

  return (
    <div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-20 shadow-sm">
        <AppHeader sync={sync} onOpenPanel={openPanel} />
        {!done && (
          <div className="bg-white">
            <nav aria-label="Form progress" className="mx-auto flex max-w-2xl gap-1 px-4 pt-2.5">
              {Array.from({ length: visibleSteps }, (_, i) => {
                const reachable = i <= draft.maxStep && !refusal && i !== draft.stepIndex;
                return (
                  <button
                    key={STEPS[i].id}
                    type="button"
                    disabled={!reachable}
                    onClick={() => goTo(i)}
                    aria-label={`Step ${i + 1}: ${STEPS[i].title.en}`}
                    aria-current={i === draft.stepIndex ? "step" : undefined}
                    className="group flex h-6 flex-1 items-center disabled:cursor-default"
                  >
                    <span
                      className={`h-1.5 w-full rounded-full transition-colors ${
                        i === draft.stepIndex
                          ? "bg-teal-700"
                          : i <= draft.maxStep
                            ? "bg-teal-300 group-hover:bg-teal-500"
                            : "bg-slate-200"
                      }`}
                    />
                  </button>
                );
              })}
            </nav>
            <p className="mx-auto max-w-2xl px-4 pb-2 text-xs font-medium text-slate-500">
              Step {draft.stepIndex + 1} of {visibleSteps} · {step.title.en}
            </p>
          </div>
        )}
        {!sync.online && (
          <div className="bg-slate-800 px-4 py-2 text-center text-sm text-white" role="status">
            Offline – keep filling, everything is saved on this device. ·{" "}
            <Bn>অফলাইনে আছেন – তথ্য এই ডিভাইসে সংরক্ষিত থাকবে।</Bn>
          </div>
        )}
      </div>

      <main className="mx-auto max-w-2xl px-4">
        {!storageOk && (
          <Banner tone="danger">
            This browser is blocking storage (private mode?). Forms cannot be kept offline – stay connected
            until each form is uploaded.
          </Banner>
        )}

        {done ? (
          <DoneScreen done={done} sync={sync} onNext={startNext} headingRef={headingRef} />
        ) : (
          <>
            {restored && (
              <Banner tone="info">
                <span className="flex-1">
                  Unsaved form restored{answers.participantId ? ` (ID ${answers.participantId})` : ""}. Continue
                  where you left off. · <Bn>আগের অসম্পূর্ণ ফর্মটি ফিরিয়ে আনা হয়েছে।</Bn>
                </span>
                <span className="mt-2 flex gap-2">
                  <button type="button" className="btn-secondary h-9 px-3 text-sm" onClick={() => setRestored(false)}>
                    OK
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-9 px-3 text-sm text-red-700"
                    onClick={() => {
                      if (confirm("Discard this unsaved form and start a new one?")) discardCurrent();
                    }}
                  >
                    Start new
                  </button>
                </span>
              </Banner>
            )}

            {step.id === "consent" && sync.items.length > 0 && (
              <Banner tone="warn">
                <span className="flex-1">
                  {sync.items.length} saved form{sync.items.length > 1 ? "s are" : " is"} waiting to upload. They will
                  upload automatically when the internet is available.
                </span>
                <button type="button" className="btn-secondary mt-2 h-9 px-3 text-sm" onClick={openPanel}>
                  View
                </button>
              </Banner>
            )}

            <div className="pt-5 pb-3">
              <p className="text-xs font-bold tracking-wide text-teal-800 uppercase">{step.part}</p>
              <h1 ref={headingRef} tabIndex={-1} className="text-2xl leading-tight font-bold text-slate-900 outline-none">
                {step.title.en}
                {step.title.bn && <Bn className="mt-0.5 block text-lg font-semibold text-slate-600">{step.title.bn}</Bn>}
              </h1>
              {(step.id === "clinical1" || step.id === "clinical2") && <ParticipantChip answers={answers} />}
            </div>

            <div className="space-y-4">
              {step.id === "consent" ? (
                <ConsentStep answers={answers} errors={shownErrors} patch={patch} warning={duplicateWarning} />
              ) : step.id === "review" ? (
                <Review answers={answers} errors={shownErrors} onEdit={goTo} />
              ) : (
                step.questions.map(renderQuestion)
              )}

              {step.id === "clinical2" && (
                <details className="rounded-2xl border border-slate-200 bg-white p-4 text-[15px] text-slate-700">
                  <summary className="cursor-pointer font-semibold text-slate-900">OHSI reference</summary>
                  <p className="mt-2 font-medium">{OHSI_REFERENCE.formula}</p>
                  <p className="mt-2 font-medium">Interpretation of OHSI:</p>
                  <ul className="mt-1 space-y-0.5">
                    {OHSI_REFERENCE.interpretation.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}

              {saveError && (
                <Banner tone="danger">
                  <span>{saveError}</span>
                </Banner>
              )}
            </div>
          </>
        )}
      </main>

      {!done && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-3 px-4 py-3">
            {draft.stepIndex > 0 && (
              <button type="button" onClick={() => goTo(draft.stepIndex - 1)} className="btn-secondary h-13 px-4">
                <ArrowLeft className="h-5 w-5" />
                <span>Back</span>
              </button>
            )}
            <button
              type="button"
              onClick={onPrimary}
              disabled={submitting}
              className="btn-primary h-13 flex-1"
            >
              <span>
                {primaryLabel.en} · <Bn>{primaryLabel.bn}</Bn>
              </span>
              {step.id === "review" || refusal ? <UploadIcon className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      <DevicePanel ref={panelRef} sync={sync} onDiscardCurrent={discardCurrent} canDiscard={!done && hasContent(answers)} />
    </div>
  );
}

function ConsentStep({
  answers,
  errors,
  patch,
  warning,
}: {
  answers: Answers;
  errors: FieldErrors;
  patch: Patch;
  warning: React.ReactNode;
}) {
  const options = [
    { value: true, en: "Yes", bn: "হ্যাঁ" },
    { value: false, en: "No", bn: "না" },
  ];
  return (
    <>
      <section
        data-question="consent"
        className={`scroll-mt-32 rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
          errors.consent ? "border-red-300 ring-2 ring-red-100" : "border-slate-200"
        }`}
      >
        <h2 id="consent-title" className="text-[17px] font-semibold text-slate-900">
          Consent Taken
        </h2>
        <p className="mt-1 text-[15px] text-slate-600">
          Oral Health Practice Questionnaire and clinical examination.
        </p>
        <div role="radiogroup" aria-labelledby="consent-title" className="mt-3 grid grid-cols-2 gap-3">
          {options.map((o) => {
            const checked = answers.consent === o.value;
            return (
              <label
                key={o.en}
                className={`flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 p-3 text-center transition-colors select-none has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-teal-200 ${
                  checked
                    ? o.value
                      ? "border-teal-700 bg-teal-50"
                      : "border-slate-700 bg-slate-100"
                    : "border-slate-200 bg-white active:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="consent"
                  className="sr-only"
                  checked={checked}
                  onChange={() => patch({ consent: o.value }, { answeredId: "consent" })}
                />
                <span className="text-xl font-bold text-slate-900">{o.en}</span>
                <Bn className="text-lg text-slate-600">{o.bn}</Bn>
                {checked && <CheckIcon className="mt-1 h-5 w-5 text-teal-700" strokeWidth={3} />}
              </label>
            );
          })}
        </div>
        <ErrorText id="consent-err" error={errors.consent} />
      </section>

      {answers.consent === false && (
        <>
          <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[15px] text-slate-700">
            <InfoIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Without consent the questionnaire and examination are skipped. Only the Participant ID is saved, to
              record the refusal.
            </span>
          </p>
          <TextField
            q={participantIdQ}
            answers={answers}
            error={errors.participantId}
            patch={patch}
            warning={warning}
          />
        </>
      )}
    </>
  );
}

function ParticipantChip({ answers }: { answers: Answers }) {
  const gender = answers.gender === 1 ? "Male" : answers.gender === 2 ? "Female" : null;
  const parts = [
    answers.participantId ? `ID ${answers.participantId}` : null,
    typeof answers.age === "number" ? `${answers.age} years` : null,
    gender,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="mt-2 inline-flex rounded-full bg-slate-200/70 px-3 py-1 text-sm font-medium text-slate-700">
      Participant: {parts.join(" · ")}
    </p>
  );
}

function Banner({ tone, children }: { tone: "info" | "warn" | "danger"; children: React.ReactNode }) {
  const styles = {
    info: "bg-teal-50 text-teal-950 border-teal-200",
    warn: "bg-amber-50 text-amber-950 border-amber-200",
    danger: "bg-red-50 text-red-900 border-red-200",
  }[tone];
  const Icon = tone === "info" ? InfoIcon : tone === "warn" ? ClockIcon : AlertIcon;
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3 text-[15px] ${styles}`} role="status">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function DoneScreen({
  done,
  sync,
  onNext,
  headingRef,
}: {
  done: Done;
  sync: DeviceSync;
  onNext: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const item = sync.items.find((i) => i.clientId === done.clientId);
  const state =
    done.phase === "uploading" ? "uploading" : !item ? "uploaded" : item.status === "rejected" ? "rejected" : "queued";

  const view = {
    uploading: {
      icon: <UploadIcon className="h-10 w-10 animate-pulse" />,
      ring: "bg-teal-100 text-teal-800",
      title: "Saved – uploading…",
      bn: "সংরক্ষিত হয়েছে – আপলোড হচ্ছে…",
      text: "The form is safely stored on this device and is being sent to the server.",
    },
    uploaded: {
      icon: <CheckIcon className="h-10 w-10" strokeWidth={3} />,
      ring: "bg-emerald-100 text-emerald-700",
      title: "Submitted",
      bn: "সফলভাবে জমা হয়েছে",
      text: "The form has been uploaded to the server.",
    },
    queued: {
      icon: <ClockIcon className="h-10 w-10" />,
      ring: "bg-amber-100 text-amber-700",
      title: "Saved on this device",
      bn: "এই ডিভাইসে সংরক্ষিত হয়েছে",
      text: "No internet right now. It will upload automatically when the connection is back – you can keep collecting forms.",
    },
    rejected: {
      icon: <AlertIcon className="h-10 w-10" />,
      ring: "bg-red-100 text-red-700",
      title: "Saved, but not accepted",
      bn: "সংরক্ষিত, কিন্তু গ্রহণ করা হয়নি",
      text: `The server did not accept this form${item?.lastError ? `: ${item.lastError}` : "."} Open the device panel to try again.`,
    },
  }[state];

  return (
    <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
      <span className={`flex h-20 w-20 items-center justify-center rounded-full ${view.ring}`}>{view.icon}</span>
      <h1 ref={headingRef} tabIndex={-1} className="mt-5 text-2xl font-bold text-slate-900 outline-none">
        {view.title}
        <Bn className="mt-1 block text-lg font-semibold text-slate-600">{view.bn}</Bn>
      </h1>
      <p className="mt-3 max-w-md text-[16px] text-slate-700">{view.text}</p>
      <dl className="mt-6 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-left">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Participant ID</dt>
          <dd className="font-semibold text-slate-900">{done.participantId}</dd>
        </div>
        <div className="mt-2 flex justify-between gap-4">
          <dt className="text-slate-600">Consent</dt>
          <dd className="font-semibold text-slate-900">{done.consent ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <button type="button" onClick={onNext} className="btn-primary mt-8 h-14 w-full max-w-sm text-lg">
        Start next participant · <Bn>নতুন ফর্ম</Bn>
        <ArrowRight className="h-5 w-5" />
      </button>
      {state === "queued" && (
        <button type="button" onClick={() => void sync.flush()} className="btn-secondary mt-3 w-full max-w-sm" disabled={sync.syncing}>
          <UploadIcon className="h-5 w-5" /> {sync.syncing ? "Trying…" : "Try uploading now"}
        </button>
      )}
    </div>
  );
}
