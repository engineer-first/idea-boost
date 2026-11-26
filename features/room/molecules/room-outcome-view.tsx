"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { StickyNote } from "@/features/notes";
import { createOutcomePng } from "../logic/outcome-png";
import { formatOutcomeText, type RoomOutcome } from "../logic/outcome-text";
import styles from "./room-outcome.module.css";

export type RoomOutcomeViewProps = {
  outcome: RoomOutcome | null;
  connected?: boolean;
  authorized?: boolean;
  children?: ReactNode;
  reflection?: ReactNode;
  additionalNavigation?: ReactNode;
  recordInfo?: ReactNode;
  footer?: ReactNode;
  onBackToBoard?: () => void;
  onOpenFeedback?: () => void;
  feedbackButtonRef?: Ref<HTMLButtonElement>;
  onExportSuccess?: () => void;
  onExportFailure?: () => void;
  feedbackPrompt?: ReactNode;
};

export function RoomOutcomeView({
  outcome,
  connected = false,
  authorized,
  children,
  reflection,
  additionalNavigation,
  recordInfo,
  onBackToBoard,
  onOpenFeedback,
  feedbackButtonRef,
  footer,
  onExportSuccess,
  onExportFailure,
  feedbackPrompt,
}: RoomOutcomeViewProps) {
  const t = useTranslations("app.roomOutcome");
  const cards = [
    { label: t("issue"), key: "issue" },
    { label: t("question"), key: "hmw" },
  ] as const;
  const [pngPending, setPngPending] = useState(false);
  const [pngSaved, setPngSaved] = useState(false);
  const pngSavedTimeout = useRef<number | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copySucceeded, setCopySucceeded] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [copyPending, setCopyPending] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const active = useRef(true);
  const exportGeneration = useRef(0);
  const available = authorized ?? connected;
  const exportKey = JSON.stringify([
    available,
    outcome?.issue ?? null,
    outcome?.hmw ?? null,
    outcome?.idea ?? null,
  ]);
  const generationKeyRef = useRef(exportKey);
  useLayoutEffect(() => {
    if (generationKeyRef.current === exportKey) return;

    generationKeyRef.current = exportKey;
    exportGeneration.current += 1;
  }, [exportKey]);
  const previousExportKey = useRef(exportKey);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onExportFailure?.();
    };
  }, [onExportFailure]);
  useEffect(() => {
    if (previousExportKey.current === exportKey) return;
    previousExportKey.current = exportKey;

    if (pngSavedTimeout.current !== null) {
      window.clearTimeout(pngSavedTimeout.current);
      pngSavedTimeout.current = null;
    }

    setPngSaved(false);
    setCopyPending(false);
    setPngPending(false);
    setCopySucceeded(false);
    setCopyFailed(false);
    setDownloadStarted(false);
    setSaveFailed(false);

    onExportFailure?.();
  }, [exportKey, onExportFailure]);
  useEffect(() => {
    return () => {
      if (pngSavedTimeout.current !== null) {
        window.clearTimeout(pngSavedTimeout.current);
      }
    };
  }, []);
  const canExport = available && outcome !== null;
  const locale = useLocale() === "en" ? "en" : "ja";
  const outputText = outcome ? formatOutcomeText(outcome, new Date(), locale) : "";

  function saveText() {
    if (!canExport || copyPending || pngPending) return;
    setCopySucceeded(false);
    setCopyFailed(false);
    let url: string | undefined;
    const anchor = document.createElement("a");
    try {
      const now = new Date();
      const blob = new Blob([`\uFEFF${formatOutcomeText(outcome, now, locale)}`], {
        type: "text/plain;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      anchor.href = url;
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      anchor.download = `idea-boost-outcome-${localDate}.txt`;
      document.body.append(anchor);
      anchor.click();
      setDownloadStarted(true);
      setSaveFailed(false);
      setCopySucceeded(false);
      setCopyFailed(false);
      onExportSuccess?.();
    } catch {
      setDownloadStarted(false);
      setSaveFailed(true);
      onExportFailure?.();
    } finally {
      anchor.remove();
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
    }
  }

  async function savePng() {
    if (!canExport || copyPending || pngPending || !outcome) return;

    const generation = exportGeneration.current;
    const currentOutcome = { ...outcome };
    const now = new Date();

    setPngPending(true);

    if (pngSavedTimeout.current !== null) {
      window.clearTimeout(pngSavedTimeout.current);
      pngSavedTimeout.current = null;
    }

    setPngSaved(false);

    if (copySucceeded || downloadStarted) {
      onExportFailure?.();
    }

    setCopySucceeded(false);
    setCopyFailed(false);
    setDownloadStarted(false);
    setSaveFailed(false);

    let objectUrl: string | undefined;
    let anchor: HTMLAnchorElement | undefined;

    try {
      // サーバーには送らず、ブラウザ内でCanvasを生成する。
      const blob = await createOutcomePng(currentOutcome);

      // 生成中に画面を離れた・権限が失効した・成果が変わった場合は破棄。
      if (!active.current || generation !== exportGeneration.current) {
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");

      const localDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      anchor.href = objectUrl;
      anchor.download = `idea-boost-outcome-${localDate}.png`;

      document.body.append(anchor);
      anchor.click();

      setDownloadStarted(true);
      setSaveFailed(false);
      setPngSaved(true);

      pngSavedTimeout.current = window.setTimeout(() => {
        setPngSaved(false);
        pngSavedTimeout.current = null;
      }, 5000);

      onExportSuccess?.();
    } catch (error) {
      console.error("[PNG保存失敗]", error);

      if (!active.current || generation !== exportGeneration.current) {
        return;
      }

      setDownloadStarted(false);
      setSaveFailed(true);
      onExportFailure?.();
    } finally {
      anchor?.remove();

      if (objectUrl) {
        const url = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }

      if (active.current && generation === exportGeneration.current) {
        setPngPending(false);
      }
    }
  }

  async function copyText() {
    if (!canExport || copyPending || pngPending) return;
    const generation = exportGeneration.current;
    setCopyPending(true);
    if (copySucceeded || downloadStarted) onExportFailure?.();
    setCopySucceeded(false);
    setCopyFailed(false);
    setSaveFailed(false);
    setDownloadStarted(false);
    try {
      await navigator.clipboard.writeText(
        formatOutcomeText(outcome, new Date(), locale),
      );
      if (!active.current || generation !== exportGeneration.current) return;
      setCopySucceeded(true);
      setCopyFailed(false);
      onExportSuccess?.();
    } catch {
      if (!active.current || generation !== exportGeneration.current) return;
      onExportFailure?.();
      setCopySucceeded(false);
      setCopyFailed(true);
    } finally {
      if (active.current && generation === exportGeneration.current)
        setCopyPending(false);
    }
  }

  return (
    <main className={styles.page} data-testid="room-outcome-view">
      <div className={styles.content}>
        <h1 className={styles.title}>{t("title")}</h1>
        {!available || !outcome ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-border bg-muted px-4 py-3 text-base leading-6"
          >
            {authorized === false
              ? t("unavailableAuth")
              : !available
                ? t("unavailableConnection")
                : t("unavailableOutcome")}
          </p>
        ) : null}

        <div className={styles.decisions}>
          <StickyNote
            noteId="outcome-idea"
            color="yellow"
            decisionPresentation="reference"
            className={styles.adopted}
            style={{ width: "100%", height: "auto" }}
          >
            <div className={styles.noteContent}>
              <h2>{t("adoptedIdea")}</h2>
              <p>
                {!available && (
                  <>
                    <span>{t("unconfirmed")}</span>
                    {"\n"}
                  </>
                )}
                {outcome?.idea ?? t("unknown")}
              </p>
            </div>
          </StickyNote>
          <details open={!reflection} className={styles.decisionContext}>
            <summary>{t("reviewContext")}</summary>
            <div className={styles.contextNotes}>
              {cards.map(({ label, key }) => (
                <StickyNote
                  key={key}
                  noteId={`outcome-${key}`}
                  color={null}
                  decisionPresentation="reference"
                  className={styles.contextNote}
                  style={{ width: "100%", height: "auto" }}
                >
                  <div className={styles.noteContent}>
                    <h2>{label}</h2>
                    <p>
                      {!available && (
                        <>
                          <span>{t("unconfirmed")}</span>
                          {"\n"}
                        </>
                      )}
                      {outcome?.[key] ?? t("unknown")}
                    </p>
                  </div>
                </StickyNote>
              ))}
            </div>
          </details>
        </div>
        {reflection ?? (
          <section className="mt-8 rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="text-lg font-bold">{t("nextSteps")}</h2>
            <p className="mt-2 text-base leading-7">
              {t("nextStepsDescription")}
            </p>
          </section>
        )}
        {canExport ? (
          <section className={styles.export}>
            <h2 className="text-lg font-bold">{t("save")}</h2>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                className="min-h-11"
                variant="outline"
                type="button"
                onClick={() => void savePng()}
                disabled={copyPending || pngPending}
              >
                {pngPending
                  ? t("pngPending")
                  : pngSaved
                    ? t("saved")
                    : t("savePng")}
              </Button>

              <Button
                className="min-h-11"
                type="button"
                variant="outline"
                onClick={saveText}
                disabled={copyPending || pngPending}
              >
                {t("saveText")}
              </Button>

              <Button
                className="min-h-11"
                type="button"
                variant="outline"
                onClick={() => void copyText()}
                disabled={copyPending || pngPending}
              >
                {copyPending ? t("copyPending") : t("copy")}
              </Button>
            </div>
          </section>
        ) : null}
        {downloadStarted && canExport ? (
          <p role="status" className="mt-3 text-base">
            {t("downloadStarted")}
          </p>
        ) : null}
        {copySucceeded && canExport ? (
          <p role="status" className="mt-3 text-base">
            {t("copied")}
          </p>
        ) : null}
        {saveFailed && canExport ? (
          <p role="alert" className="mt-3 text-base text-destructive">
            {t("saveFailed")}
          </p>
        ) : null}
        {copyFailed && canExport ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-white p-4">
            <p role="alert" className="text-base">
              {t("copyFailed")}
            </p>
            <textarea
              readOnly
              aria-label={t("copyAll")}
              className="mt-3 h-56 w-full rounded-md border p-3 text-base"
              value={outputText}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        ) : null}
        {feedbackPrompt}
        {children}
        {recordInfo}

        <nav
          aria-label={t("pageNav")}
          className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 pb-8"
        >
          {onBackToBoard && (
            <Button type="button" variant="outline" onClick={onBackToBoard}>
              {t("backBoard")}
            </Button>
          )}

          <Link
            href="/home"
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-base font-semibold text-primary underline underline-offset-4 hover:no-underline"
          >
            {t("backHome")}
          </Link>

          {additionalNavigation}
        </nav>

        {!authorized ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {t("retention")}
          </p>
        ) : null}

        {footer || onOpenFeedback ? (
          <footer className="mt-6 border-t border-border pt-4 pb-8">
            {footer}

            {onOpenFeedback ? (
              <div className={footer ? "mt-3" : ""}>
                <Button
                  ref={feedbackButtonRef}
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-sm text-muted-foreground"
                  onClick={onOpenFeedback}
                >
                  {t("feedback")}
                </Button>
              </div>
            ) : null}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
