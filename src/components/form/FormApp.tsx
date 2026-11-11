"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ALL_QUESTIONS,
  OHSI_REFERENCE,
  SCHEMA_VERSION,
  SECTIONS,
  isVisible,
  type Answers,
  type Bilingual,
  type Question,
  type Section,
  type SingleQuestion,
  type TextQuestion,
} from "@/lib/form-schema";
import { checkQuestion, cleanSubmission } from "@/lib/validation";
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
  ChoiceList,
  ConsentChoice,
  DmftInput,
  ErrorText,
  MultiList,
  NumberInput,
  QuestionHeading,
  TextInput,
  type Patch,
} from "./fields";
import { Review } from "./Review";
import { useDeviceSync, type DeviceSync } from "./useDeviceSync";

const participantIdQ = ALL_QUESTIONS.find((q) => q.id === "participantId") as TextQuestion;
/** Pause after tapping an answer so the collector sees it selected before moving on. */
const AUTO_ADVANCE_MS = 350;
const CONSENT_ERROR: Bilingual = { en: "Please select Yes or No", bn: "হ্যাঁ অথবা না নির্বাচন করুন" };

type Screen =
  | { kind: "consent"; id: "consent" }
  | { kind: "question"; id: string; question: Question; section: Section }
  | { kind: "review"; id: "review" };

/**
 * One screen per question: consent, participant details, Annexure II
 * (clinical examination), Annexure IV (questionnaire), review. Questions that
 * do not apply (Q11 when Q10 = No, Q16 when Q15 = No) are left out.
 * Without consent only the Participant ID is asked.
 */
function buildScreens(a: Answers): Screen[] {
  const screens: Screen[] = [{ kind: "consent", id: "consent" }];
  if (a.consent === false) {
    screens.push({ kind: "question", id: participantIdQ.id, question: participantIdQ, section: SECTIONS[0] });
    return screens;
  }
  for (const section of SECTIONS) {
    for (const question of section.questions) {
      if (isVisible(question, a)) screens.push({ kind: "question", id: question.id, question, section });
    }
  }
  screens.push({ kind: "review", id: "review" });
  return screens;
}

const noopSubscribe = () => () => {};

function newDraft(): Draft {
  const now = new Date().toISOString();
  return { v: 2, clientId: newId(), answers: {}, screenId: "consent", reviewed: false, startedAt: now, updatedAt: now };
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
      <main className="mx-auto max-w-xl px-4 py-6" aria-busy="true">
        <p className="text-[18px] text-slate-600">
          Loading form… · <Bn>ফর্ম লোড হচ্ছে…</Bn>
        </p>
        <div className="mt-5 space-y-3">
          <div className="h-10 w-3/4 animate-pulse rounded-xl bg-white" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
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
      <div className="mx-auto flex h-16 max-w-xl items-center gap-2.5 px-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <ToothIcon className="h-7 w-7" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[17px] font-semibold">Oral Health Data Form</p>
          <p className="truncate text-sm text-teal-100">Annexure II &amp; IV</p>
        </div>
        {sync && (
          <button
            type="button"
            onClick={onOpenPanel}
            className="ml-auto flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[16px] font-semibold hover:bg-white/25"
            aria-label={`Device status: ${sync.online ? "online" : "offline"}, ${waiting} waiting to upload`}
          >
            {sync.online && !sync.unstable ? <CloudCheck className="h-6 w-6" /> : <CloudOff className="h-6 w-6" />}
            <span className="hidden min-[360px]:inline">
              {sync.online ? (sync.unstable ? "Weak" : "Online") : "Offline"}
            </span>
            {waiting > 0 && (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-400 px-1.5 text-sm font-bold text-amber-950">
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
  const [error, setError] = useState<{ id: string; err: Bilingual } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sync = useDeviceSync();
  const panelRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftRef = useRef(draft);
  const advanceTimer = useRef<number | null>(null);
  const firstRender = useRef(true);

  const answers = draft.answers;
  const refusal = answers.consent === false;
  const screens = useMemo(() => buildScreens(answers), [answers]);
  const index = Math.max(0, screens.findIndex((s) => s.id === draft.screenId));
  const screen = screens[index];
  const hasTextInput = screen.kind === "question" && (screen.question.kind === "number" || screen.question.kind === "text");

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    void registerServiceWorker();
    void requestPersistentStorage();
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  // Autosave every change so a reload, crash or closed tab never loses data.
  useEffect(() => {
    if (!done) saveDraft(draft);
  }, [draft, done]);

  // New screen: move focus to the question for screen readers (inputs focus themselves).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!hasTextInput) headingRef.current?.focus({ preventScroll: true });
  }, [screen.id, done, hasTextInput]);

  const cancelAutoAdvance = () => {
    if (advanceTimer.current) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };

  const patch: Patch = useCallback((p) => {
    setDraft((d) => ({ ...d, answers: { ...d.answers, ...p }, updatedAt: new Date().toISOString() }));
  }, []);

  const goTo = (id: string) => {
    cancelAutoAdvance();
    setError(null);
    setDraft((d) => ({ ...d, screenId: id, reviewed: d.reviewed || id === "review" }));
    window.scrollTo({ top: 0 });
  };

  const submit = async (toSave: Answers) => {
    const result = cleanSubmission(toSave);
    if (!result.ok) {
      const first = buildScreens(toSave).find((s) =>
        s.kind === "consent" ? Boolean(result.errors.consent) : s.kind === "question" && result.errors[s.id],
      );
      if (first) {
        goTo(first.id);
        setError({ id: first.id, err: result.errors[first.id] ?? CONSENT_ERROR });
      }
      return;
    }
    setSubmitting(true);
    setSaveError(null);
    const { clientId, startedAt } = draftRef.current;
    const payload = {
      clientId,
      clientCreatedAt: new Date().toISOString(),
      startedAt,
      schemaVersion: SCHEMA_VERSION,
      answers: result.answers,
    };
    try {
      await enqueue(payload);
    } catch {
      setSubmitting(false);
      setSaveError("Could not save on this device. Free up storage or turn off private browsing, then try again.");
      return;
    }
    clearDraft();
    setSubmitting(false);
    setDone({
      clientId,
      participantId: result.answers.participantId ?? "",
      consent: result.answers.consent === true,
      phase: "uploading",
    });
    window.scrollTo({ top: 0 });
    await sync.flush();
    setDone((d) => (d && d.clientId === clientId ? { ...d, phase: "settled" } : d));
  };

  /** Where "Next" leads from the current screen (null = stay, show error). */
  const nextTarget = (d: Draft): { go?: string; submit?: Answers; error?: Bilingual } => {
    const a = d.answers;
    const list = buildScreens(a);
    const i = Math.max(0, list.findIndex((s) => s.id === d.screenId));
    const s = list[i];
    if (s.kind === "consent") return a.consent === undefined ? { error: CONSENT_ERROR } : { go: list[1].id };
    if (s.kind === "review") return { submit: a };
    const err = checkQuestion(s.question, a);
    if (err) return { error: err };
    if (a.consent === false) return { submit: { consent: false, participantId: a.participantId } };
    if (d.reviewed) {
      // Editing from the review screen: go back to it, unless an edit made a new question appear.
      const missing = list.slice(i + 1).find((x) => x.kind === "question" && checkQuestion(x.question, a));
      return { go: missing ? missing.id : "review" };
    }
    return { go: list[i + 1].id };
  };

  const goNext = () => {
    cancelAutoAdvance();
    const t = nextTarget(draftRef.current);
    if (t.error) {
      setError({ id: draftRef.current.screenId, err: t.error });
      return;
    }
    if (t.submit) void submit(t.submit);
    else if (t.go) goTo(t.go);
  };

  const goBack = () => {
    if (index > 0) goTo(screens[index - 1].id);
  };

  const autoAdvance = () => {
    cancelAutoAdvance();
    advanceTimer.current = window.setTimeout(goNext, AUTO_ADVANCE_MS);
  };

  const onPicked = (q: SingleQuestion, value: number) => {
    if (q.other && value === q.other.value) return; // let them type the "specify" text
    autoAdvance();
  };

  const startNext = () => {
    setDraft(newDraft());
    setDone(null);
    setError(null);
    setRestored(false);
    window.scrollTo({ top: 0 });
  };

  const discardCurrent = () => {
    clearDraft();
    startNext();
  };

  const openPanel = () => panelRef.current?.showModal();

  // Error for this screen, re-checked live so it disappears once fixed.
  const shownError: Bilingual | null = (() => {
    if (!error || error.id !== screen.id) return null;
    if (screen.kind === "consent") return answers.consent === undefined ? error.err : null;
    if (screen.kind === "question") return checkQuestion(screen.question, answers);
    return null;
  })();

  const questionScreens = screens.filter((s) => s.kind === "question");
  const qNumber = questionScreens.findIndex((s) => s.id === screen.id) + 1;
  const progress =
    screen.kind === "consent" ? 0.02 : screen.kind === "review" ? 1 : qNumber / (questionScreens.length + 1);

  const target = nextTarget(draft);
  const primaryLabel: Bilingual = submitting
    ? { en: "Saving…", bn: "সংরক্ষণ হচ্ছে…" }
    : screen.kind === "review"
      ? { en: "Submit", bn: "জমা দিন" }
      : refusal && screen.kind === "question"
        ? { en: "Save", bn: "জমা দিন" }
        : target.go === "review" && draft.reviewed
          ? { en: "Review", bn: "যাচাই" }
          : { en: "Next", bn: "পরবর্তী" };
  const primaryIsSubmit = screen.kind === "review" || (refusal && screen.kind === "question");

  const duplicateWarning = (() => {
    const id = (answers.participantId ?? "").trim().toLowerCase();
    if (!id) return null;
    const hit = sync.log.find((e) => e.clientId !== draft.clientId && e.participantId.trim().toLowerCase() === id);
    if (!hit) return null;
    return (
      <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-4 text-[17px] text-amber-950">
        <AlertIcon className="mt-0.5 h-6 w-6 shrink-0" />
        <span>
          A form with this Participant ID was already saved on this device (
          {new Date(hit.savedAt).toLocaleDateString("en-GB")}). Check the ID if this is a different person.
        </span>
      </p>
    );
  })();

  const titleId = `title-${screen.id}`;

  const renderInput = (q: Question) => {
    switch (q.kind) {
      case "single":
        return <ChoiceList q={q} answers={answers} patch={patch} labelledBy={titleId} onPicked={(v) => onPicked(q, v)} />;
      case "multi":
        return <MultiList q={q} answers={answers} patch={patch} labelledBy={titleId} />;
      case "number":
        return <NumberInput q={q} answers={answers} patch={patch} labelledBy={titleId} invalid={Boolean(shownError)} onEnter={goNext} />;
      case "text":
        return <TextInput q={q} answers={answers} patch={patch} labelledBy={titleId} invalid={Boolean(shownError)} onEnter={goNext} />;
      case "dmft":
        return <DmftInput answers={answers} patch={patch} labelledBy={titleId} />;
    }
  };

  return (
    <div className="min-h-dvh pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-20 shadow-sm">
        <AppHeader sync={sync} onOpenPanel={openPanel} />
        {!done && (
          <div className="bg-white">
            <div className="mx-auto max-w-xl px-4 pt-3 pb-2.5">
              <div
                className="h-2.5 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label="Form progress"
              >
                <div className="h-full rounded-full bg-teal-600 transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[15px] font-semibold text-slate-600">
                <span className="truncate">
                  {screen.kind === "question" ? screen.section.part : screen.kind === "consent" ? "Annexure IV" : "Final check"}
                </span>
                <span className="shrink-0 tabular-nums">
                  {screen.kind === "question"
                    ? `Question ${qNumber} of ${questionScreens.length}`
                    : screen.kind === "consent"
                      ? "Consent"
                      : "Review"}
                </span>
              </div>
            </div>
          </div>
        )}
        {!sync.online && (
          <div className="bg-slate-800 px-4 py-2 text-center text-[15px] text-white" role="status">
            Offline – keep filling, everything is saved on this device.
            <Bn className="block">অফলাইনে আছেন – তথ্য এই ডিভাইসে সংরক্ষিত থাকবে।</Bn>
          </div>
        )}
      </div>

      <main className="mx-auto max-w-xl px-4">
        {!storageOk && (
          <Banner tone="danger">
            This browser is blocking storage (private mode?). Forms cannot be kept offline – stay connected until each
            form is uploaded.
          </Banner>
        )}

        {done ? (
          <DoneScreen done={done} sync={sync} onNext={startNext} headingRef={headingRef} />
        ) : (
          <>
            {restored && (
              <Banner tone="info">
                <span>
                  Unsaved form restored{answers.participantId ? ` (ID ${answers.participantId})` : ""}. Continue where
                  you left off.
                  <Bn className="block">আগের অসম্পূর্ণ ফর্মটি ফিরিয়ে আনা হয়েছে।</Bn>
                </span>
                <span className="mt-3 flex gap-2">
                  <button type="button" className="btn-secondary h-12 px-5" onClick={() => setRestored(false)}>
                    OK
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-12 px-5 text-red-700"
                    onClick={() => {
                      if (confirm("Discard this unsaved form and start a new one?")) discardCurrent();
                    }}
                  >
                    Start new
                  </button>
                </span>
              </Banner>
            )}

            {screen.kind === "consent" && sync.items.length > 0 && (
              <Banner tone="warn">
                <span>
                  {sync.items.length} saved form{sync.items.length > 1 ? "s are" : " is"} waiting to upload. They will
                  upload automatically when the internet is available.
                </span>
                <button type="button" className="btn-secondary mt-3 h-12 self-start px-5" onClick={openPanel}>
                  View
                </button>
              </Banner>
            )}

            <div key={screen.id} className="animate-screen pt-6">
              {screen.kind === "consent" && (
                <>
                  <p className="text-[16px] font-bold tracking-wide text-teal-800 uppercase">Oral Health Practice Questionnaire</p>
                  <h1
                    id={titleId}
                    ref={headingRef}
                    tabIndex={-1}
                    className="mt-1 text-[30px] leading-tight font-bold text-slate-900 outline-none"
                  >
                    Consent Taken
                  </h1>
                  <p className="mt-2 mb-5 text-[18px] text-slate-700">
                    For the clinical examination (Annexure II) and the questionnaire (Annexure IV).
                  </p>
                  <ConsentChoice
                    value={answers.consent}
                    labelledBy={titleId}
                    onChange={(v) => patch({ consent: v })}
                    onPicked={autoAdvance}
                  />
                  <ErrorText id={`${titleId}-err`} error={shownError} />
                </>
              )}

              {screen.kind === "question" && (
                <>
                  {screen.section.id !== "participant" && <ParticipantChip answers={answers} />}
                  {refusal && (
                    <p className="mb-5 flex items-start gap-2.5 rounded-2xl bg-slate-200/70 p-4 text-[17px] text-slate-800">
                      <InfoIcon className="mt-0.5 h-6 w-6 shrink-0" />
                      <span>No consent: the examination and questionnaire are skipped. Only the Participant ID is saved, to record the refusal.</span>
                    </p>
                  )}
                  <QuestionHeading q={screen.question} id={titleId} headingRef={headingRef} />
                  <div className="mt-6">{renderInput(screen.question)}</div>
                  <ErrorText id={`${titleId}-err`} error={shownError} />
                  {screen.id === "participantId" && duplicateWarning}
                  {screen.id === "saliva" && (
                    <details className="mt-6 rounded-2xl border-2 border-slate-200 bg-white p-4 text-[17px] text-slate-700">
                      <summary className="cursor-pointer text-[18px] font-semibold text-slate-900">OHSI reference</summary>
                      <p className="mt-2 font-medium">{OHSI_REFERENCE.formula}</p>
                      <p className="mt-2 font-medium">Interpretation of OHSI:</p>
                      <ul className="mt-1 space-y-0.5">
                        {OHSI_REFERENCE.interpretation.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}

              {screen.kind === "review" && (
                <>
                  <h1
                    id={titleId}
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-[30px] leading-tight font-bold text-slate-900 outline-none"
                  >
                    Review &amp; submit
                    <Bn className="mt-1 block text-[24px] font-semibold text-slate-700">যাচাই করে জমা দিন</Bn>
                  </h1>
                  <div className="mt-5">
                    <Review answers={answers} onEdit={goTo} />
                  </div>
                </>
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
        <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-xl gap-3 px-4 py-3">
            {index > 0 && (
              <button type="button" onClick={goBack} className="btn-secondary h-16 rounded-2xl px-5 text-[20px]" aria-label="Back">
                <ArrowLeft className="h-7 w-7" />
                <span className="hidden min-[440px]:inline">Back</span>
              </button>
            )}
            <button type="button" onClick={goNext} disabled={submitting} className="btn-primary h-16 flex-1 rounded-2xl text-[21px]">
              <span className="whitespace-nowrap">
                {primaryLabel.en} · <Bn>{primaryLabel.bn}</Bn>
              </span>
              {primaryIsSubmit ? <UploadIcon className="h-7 w-7" /> : <ArrowRight className="h-7 w-7" />}
            </button>
          </div>
        </div>
      )}

      <DevicePanel ref={panelRef} sync={sync} onDiscardCurrent={discardCurrent} canDiscard={!done && hasContent(answers)} />
    </div>
  );
}

function ParticipantChip({ answers }: { answers: Answers }) {
  const gender = answers.gender === 1 ? "Male" : answers.gender === 2 ? "Female" : null;
  const parts = [
    answers.participantId ? `ID ${answers.participantId}` : null,
    typeof answers.age === "number" ? `${answers.age} y` : null,
    gender,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="mb-4 inline-flex max-w-full rounded-full bg-slate-200/80 px-3.5 py-1.5 text-[16px] font-semibold text-slate-700">
      <span className="truncate">{parts.join(" · ")}</span>
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
    <div className={`mt-4 flex items-start gap-3 rounded-2xl border-2 p-4 text-[17px] ${styles}`} role="status">
      <Icon className="mt-0.5 h-6 w-6 shrink-0" />
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
      icon: <UploadIcon className="h-12 w-12 animate-pulse" />,
      ring: "bg-teal-100 text-teal-800",
      title: "Saved – uploading…",
      bn: "সংরক্ষিত হয়েছে – আপলোড হচ্ছে…",
      text: "The form is safely stored on this device and is being sent to the server.",
    },
    uploaded: {
      icon: <CheckIcon className="h-12 w-12" strokeWidth={3} />,
      ring: "bg-emerald-100 text-emerald-700",
      title: "Submitted",
      bn: "সফলভাবে জমা হয়েছে",
      text: "The form has been uploaded to the server.",
    },
    queued: {
      icon: <ClockIcon className="h-12 w-12" />,
      ring: "bg-amber-100 text-amber-700",
      title: "Saved on this device",
      bn: "এই ডিভাইসে সংরক্ষিত হয়েছে",
      text: "No internet right now. It will upload automatically when the connection is back – you can keep collecting forms.",
    },
    rejected: {
      icon: <AlertIcon className="h-12 w-12" />,
      ring: "bg-red-100 text-red-700",
      title: "Saved, but not accepted",
      bn: "সংরক্ষিত, কিন্তু গ্রহণ করা হয়নি",
      text: `The server did not accept this form${item?.lastError ? `: ${item.lastError}` : "."} Open the device panel to try again.`,
    },
  }[state];

  return (
    <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
      <span className={`flex h-24 w-24 items-center justify-center rounded-full ${view.ring}`}>{view.icon}</span>
      <h1 ref={headingRef} tabIndex={-1} className="mt-6 text-[30px] leading-tight font-bold text-slate-900 outline-none">
        {view.title}
        <Bn className="mt-1 block text-[24px] font-semibold text-slate-700">{view.bn}</Bn>
      </h1>
      <p className="mt-4 max-w-md text-[19px] text-slate-700">{view.text}</p>
      <dl className="mt-6 w-full rounded-2xl border-2 border-slate-200 bg-white p-5 text-left text-[19px]">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Participant ID</dt>
          <dd className="font-bold break-all text-slate-900">{done.participantId}</dd>
        </div>
        <div className="mt-2 flex justify-between gap-4">
          <dt className="text-slate-600">Consent</dt>
          <dd className="font-bold text-slate-900">{done.consent ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <button type="button" onClick={onNext} className="btn-primary mt-8 h-16 w-full rounded-2xl text-[21px]">
        Start next participant · <Bn>নতুন ফর্ম</Bn>
        <ArrowRight className="h-7 w-7" />
      </button>
      {state === "queued" && (
        <button
          type="button"
          onClick={() => void sync.flush()}
          className="btn-secondary mt-3 h-16 w-full rounded-2xl text-[19px]"
          disabled={sync.syncing}
        >
          <UploadIcon className="h-6 w-6" /> {sync.syncing ? "Trying…" : "Try uploading now"}
        </button>
      )}
    </div>
  );
}
