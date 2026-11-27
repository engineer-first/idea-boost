"use client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  Eye,
  FileText,
  MessageCircle,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  REFLECTION_ARTIFACT_MAX,
  REFLECTION_CONTEXT_MAX,
  type ReflectionContext,
  type ReflectionResponse,
} from "@/contracts/outcome-reflection";
import styles from "./outcome-reflection.module.css";

export type ReflectionSection = "research" | "competition" | "artifact";
export type OutcomeReflectionViewProps = {
  section: ReflectionSection | null;
  data: ReflectionResponse | null;
  context: ReflectionContext;
  artifact: string;
  step: number;
  editing: boolean;
  confirming: boolean;
  busy: ReflectionSection | "load" | null;
  error: string | null;
  copy: "idle" | "success" | "failed";
  onOpen: (section: ReflectionSection) => void;
  onClose: () => void;
  onRefresh: () => void;
  onStep: (step: number) => void;
  onContext: (field: keyof ReflectionContext, value: string) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onResearch: () => void;
  onConfirm: () => void;
  onConfirming: (open: boolean) => void;
  onArtifact: (artifact: string) => void;
  onGenerate: () => void;
  onCompetition: () => void;
  onCopy: () => void;
};
function getArtifactLabel(value: string) {
  return value.split(/[（(]/u, 1)[0].trim();
}

export function OutcomeReflectionView(props: OutcomeReflectionViewProps) {
  const {
    section,
    data,
    context,
    artifact,
    step,
    editing,
    confirming,
    busy,
    error,
    copy,
  } = props;
  const messages = useTranslations("app.outcomeReflection");
  const translate = messages as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const shared = data?.shared;
  const result = shared?.result;
  const plan = result?.kind === "plan" ? result : null;
  const questions = result?.kind === "questions" ? result.questions : [];
  const fields = editing
    ? [
        { field: "audience" as const, question: messages("audienceQuestion") },
        {
          field: "situation" as const,
          question: messages("situationQuestion"),
        },
      ]
    : questions;
  const index = plan ? Math.min(step, plan.steps.length - 1) : 0;
  const current = plan?.steps[index];
  const candidates = [
    ...new Set(
      [
        plan?.recommendation?.name,
        ...(plan?.alternatives ?? []),
        messages("mockup"),
        messages("presentationSlides"),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const [customEditing, setCustomEditing] = useState(false);
  const selectedSuggestedArtifact = customEditing
    ? undefined
    : (candidates.find((candidate) => candidate === artifact) ??
      candidates.find((candidate) => getArtifactLabel(candidate) === artifact));
  const showCustomArtifact =
    customEditing || selectedSuggestedArtifact === undefined;
  const prompt =
    section === "competition" ? data?.competitionPrompt : data?.prompt?.content;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const entryRef = useRef<HTMLButtonElement>(null);
  const stepRef = useRef<HTMLHeadingElement>(null);
  const conditionRef = useRef<HTMLInputElement>(null);
  const previousEditing = useRef(editing);
  const previousSection = useRef(section);
  const previousStep = useRef(index);
  useEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    if (section) {
      titleRef.current?.focus({ preventScroll: true });
      workspaceRef.current?.scrollIntoView?.({ block: "start" });
    } else entryRef.current?.focus();
  }, [section]);
  useEffect(() => {
    if (previousStep.current !== index && section === "research") {
      stepRef.current?.focus({ preventScroll: true });
      stepRef.current?.scrollIntoView?.({ block: "start" });
    }
    previousStep.current = index;
  }, [index, section]);
  useEffect(() => {
    if (previousEditing.current === editing) return;
    previousEditing.current = editing;
    if (editing) conditionRef.current?.focus();
    else stepRef.current?.focus();
  }, [editing]);
  return (
    <section aria-label={messages("entryAria")} className={styles.root}>
      {!section ? (
        <div className={styles.entryGrid}>
          <div className={styles.primaryEntry}>
            <div className={styles.primaryCopy}>
              <h2>{messages("mainHeading")}</h2>
              <ol
                className={styles.primaryPath}
                aria-label={messages("researchAria")}
              >
                <li>
                  <Users aria-hidden="true" />
                  {messages("who")}
                </li>
                <li>
                  <MessageCircle aria-hidden="true" />
                  {messages("what")}
                </li>
                <li>
                  <Eye aria-hidden="true" />
                  {messages("how")}
                </li>
              </ol>
              <Button
                ref={entryRef}
                className={styles.primaryButton}
                onClick={() => props.onOpen("research")}
              >
                {messages("prepareResearch")} <ArrowRight aria-hidden="true" />
              </Button>
            </div>
            <Image
              src="/landing/mood-a.webp"
              alt=""
              width={160}
              height={160}
              className={styles.character}
            />
          </div>
          <div className={styles.otherEntries}>
            <p className={styles.otherLabel}>{messages("otherPreparations")}</p>
            <button
              type="button"
              aria-label={messages("competitionAria")}
              className={styles.route}
              onClick={() => props.onOpen("competition")}
            >
              <Search aria-hidden="true" className={styles.routeIcon} />
              <span className={styles.routeCopy}>
                <strong>{messages("sectionTitle.competition")}</strong>
                <span>{messages("searchPrompt")}</span>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={messages("artifactAria")}
              className={styles.route}
              onClick={() => props.onOpen("artifact")}
            >
              <FileText aria-hidden="true" className={styles.routeIcon} />
              <span className={styles.routeCopy}>
                <strong>{messages("sectionTitle.artifact")}</strong>
                <span>{messages("artifactHint")}</span>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div ref={workspaceRef} className={styles.workspace}>
          <div className={styles.workspaceBar}>
            <Button
              variant="ghost"
              aria-label={messages("backActions")}
              onClick={props.onClose}
              className={styles.backButton}
            >
              <ArrowLeft aria-hidden="true" /> {messages("backActionsShort")}
            </Button>
            <Button
              variant="ghost"
              onClick={props.onRefresh}
              disabled={busy !== null}
              className={styles.refreshButton}
            >
              <RefreshCw aria-hidden="true" /> {messages("refresh")}
            </Button>
          </div>
          <h2 ref={titleRef} tabIndex={-1} className={styles.workspaceTitle}>
            {translate(`sectionTitle.${section}`)}
          </h2>
          {busy && (
            <p role="status" className="text-base">
              {busy === "load"
                ? messages("loading")
                : busy === "research"
                  ? messages("planning")
                  : busy === "artifact"
                    ? messages("generatingArtifact")
                    : messages("generatingCompetition")}
            </p>
          )}
          {busy === "load" && !data && (
            <div className={styles.loadingShape} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-destructive p-4 text-base leading-7"
            >
              <p>{error}</p>
            </div>
          )}
          {data && section === "research" && (
            <section
              aria-label={messages("researchAriaTitle")}
              className="space-y-4"
            >
              {fields.length > 0 && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    props.onResearch();
                  }}
                  className={styles.conditionForm}
                >
                  <h3>
                    {editing
                      ? messages("editingConditions")
                      : messages("checkBefore")}
                  </h3>
                  {fields.map((question, questionIndex) => (
                    <div key={question.field} className={styles.conditionField}>
                      <label htmlFor={`research-${question.field}`}>
                        {question.question}
                      </label>
                      <input
                        id={`research-${question.field}`}
                        ref={questionIndex === 0 ? conditionRef : undefined}
                        value={context[question.field]}
                        maxLength={REFLECTION_CONTEXT_MAX}
                        onChange={(event) =>
                          props.onContext(question.field, event.target.value)
                        }
                        disabled={busy !== null}
                        className={styles.conditionInput}
                      />
                    </div>
                  ))}
                  <p className={styles.conditionHint}>
                    {messages("unknownHint")}
                  </p>
                  <div className={styles.formActions}>
                    <Button
                      type="submit"
                      disabled={
                        busy !== null ||
                        fields.some(
                          (question) => !context[question.field].trim(),
                        )
                      }
                    >
                      {messages("addContext")}
                    </Button>
                    {editing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={props.onCancelEdit}
                        disabled={busy !== null}
                      >
                        {messages("cancelEdit")}
                      </Button>
                    )}
                  </div>
                </form>
              )}
              {!result && !editing && (
                <div className={styles.emptyResearch}>
                  <p>{messages("planDescription")}</p>
                  <Button onClick={props.onResearch} disabled={busy !== null}>
                    {messages("createSteps")}
                  </Button>
                </div>
              )}
              {plan && current && !editing && (
                <>
                  <div className={styles.method}>
                    <span className={styles.methodLabel}>
                      {messages("method")}
                    </span>
                    <h3>{plan.method}</h3>
                    <details className={styles.methodReason}>
                      <summary>{messages("methodReason")}</summary>
                      <p>{plan.reason}</p>
                    </details>
                  </div>
                  <article
                    key={index}
                    aria-label={messages("stepsAria")}
                    className={styles.stepPane}
                  >
                    <div className={styles.stepProgress}>
                      <p role="status" className={styles.stepProgressText}>
                        {messages("stepCounter", {
                          current: index + 1,
                          total: plan.steps.length,
                        })}
                      </p>
                      <div
                        role="progressbar"
                        aria-label={messages("progressAria")}
                        aria-valuemin={0}
                        aria-valuemax={plan.steps.length}
                        aria-valuenow={index + 1}
                        className={styles.stepMeter}
                      >
                        <span
                          className={styles.stepMeterFill}
                          style={{
                            width: `${((index + 1) / plan.steps.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <h4
                      ref={stepRef}
                      tabIndex={-1}
                      className={styles.stepTitle}
                    >
                      {current.title}
                    </h4>
                    <div className={styles.stepContent}>
                      <div className={styles.stepAction}>
                        <span>{messages("toDo")}</span>
                        <p>{current.action}</p>
                      </div>
                      <div className={styles.stepFocus}>
                        <div className={styles.stepFocusItem}>
                          <p className={styles.stepFocusLabel}>
                            <MessageCircle aria-hidden="true" />{" "}
                            {messages("askTry")}
                          </p>
                          <p>{current.task}</p>
                        </div>
                        <div className={styles.stepFocusItem}>
                          <p className={styles.stepFocusLabel}>
                            <Eye aria-hidden="true" /> {messages("observe")}
                          </p>
                          <p>{current.observe}</p>
                        </div>
                      </div>
                      {index === plan.steps.length - 1 && (
                        <div className={styles.synthesis}>
                          <span>{messages("nextDecision")}</span>
                          <p>{plan.synthesis}</p>
                        </div>
                      )}
                    </div>
                    <div className={styles.stepActions}>
                      <Button
                        variant="outline"
                        onClick={() => props.onStep(index - 1)}
                        disabled={index === 0}
                      >
                        {messages("previous")}
                      </Button>
                      {index < plan.steps.length - 1 ? (
                        <Button onClick={() => props.onStep(index + 1)}>
                          {messages("next")} <ArrowRight aria-hidden="true" />
                        </Button>
                      ) : (
                        <Button onClick={() => props.onOpen("artifact")}>
                          {messages("chooseArtifact")}
                        </Button>
                      )}
                    </div>
                  </article>
                  <Button
                    variant="ghost"
                    onClick={props.onEdit}
                    disabled={busy !== null}
                  >
                    {messages("editConditions")}
                  </Button>
                </>
              )}
            </section>
          )}
          {data && section === "competition" && (
            <section
              aria-label={messages("competitionSetup")}
              className={styles.competitionSection}
            >
              <p className={styles.competitionLabel}>{messages("searchAi")}</p>
              <ul className={styles.competitionTargets}>
                <li>{messages("similarProducts")}</li>
                <li>{messages("currentAlternatives")}</li>
                <li>{messages("userFrustrations")}</li>
                <li>{messages("differences")}</li>
              </ul>
              <Button
                onClick={props.onCompetition}
                variant={data.competitionPrompt ? "outline" : "default"}
                disabled={busy !== null}
              >
                {messages("makeCompetitionPrompt")}
              </Button>
            </section>
          )}
          {data && section === "artifact" && (
            <section
              aria-label={messages("chooseArtifactAria")}
              className={styles.artifactSection}
            >
              {plan?.recommendation ? (
                <div className={styles.recommendation}>
                  <span>{messages("recommended")}</span>
                  <strong title={plan.recommendation.name}>
                    {getArtifactLabel(plan.recommendation.name)}
                    {getArtifactLabel(plan.recommendation.name) !==
                      plan.recommendation.name && (
                      <span className="sr-only">
                        {plan.recommendation.name.slice(
                          getArtifactLabel(plan.recommendation.name).length,
                        )}
                      </span>
                    )}
                  </strong>
                  <details>
                    <summary>{messages("viewReason")}</summary>
                    <p>{plan.recommendation.reason}</p>
                  </details>
                </div>
              ) : (
                <p className={styles.independentArtifact}>
                  {messages("independent")}
                </p>
              )}
              <fieldset className={styles.artifactChoices}>
                <legend>{messages("artifactOptions")}</legend>
                {candidates.map((candidate) => (
                  <label key={candidate} className={styles.artifactChoice}>
                    <input
                      type="radio"
                      name="reflection-artifact"
                      value={candidate}
                      aria-label={candidate}
                      checked={selectedSuggestedArtifact === candidate}
                      onChange={() => {
                        setCustomEditing(false);
                        props.onArtifact(candidate);
                      }}
                      disabled={busy !== null}
                    />
                    {getArtifactLabel(candidate)}
                  </label>
                ))}
              </fieldset>
              <div className={styles.artifactCustom}>
                <label htmlFor="reflection-artifact">
                  {messages("customArtifact")}
                </label>
                <input
                  id="reflection-artifact"
                  value={showCustomArtifact ? artifact : ""}
                  maxLength={REFLECTION_ARTIFACT_MAX}
                  disabled={busy !== null}
                  onChange={(event) => {
                    setCustomEditing(event.target.value !== "");
                    props.onArtifact(event.target.value);
                  }}
                  placeholder={messages("artifactPlaceholder")}
                  className={styles.conditionInput}
                />
              </div>
              <Button
                onClick={props.onGenerate}
                variant={data.prompt ? "outline" : "default"}
                disabled={!artifact.trim() || busy !== null}
              >
                {messages("makeArtifactPrompt")}
              </Button>
            </section>
          )}
          {prompt && section !== "research" && (
            <section
              aria-label={
                section === "competition"
                  ? messages("competitionPrompt")
                  : messages("artifactPrompt")
              }
              className={styles.promptSection}
            >
              <h3 className={styles.promptTitle}>
                {section === "competition"
                  ? messages("competitionRequest")
                  : messages("artifactRequest")}
              </h3>
              <Button onClick={props.onCopy} className="min-h-12 gap-2 px-5">
                {copy === "success" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Clipboard aria-hidden="true" />
                )}{" "}
                {messages("copyPrompt")}
              </Button>
              {copy === "success" && <p role="status">{messages("copied")}</p>}
              {copy === "failed" && (
                <p role="alert">{messages("copyFailed")}</p>
              )}
              <details className={styles.promptDetails}>
                <summary>{messages("promptFull")}</summary>
                <textarea
                  aria-label={
                    section === "competition"
                      ? messages("competitionPromptFull")
                      : messages("artifactPromptFull")
                  }
                  readOnly
                  value={prompt}
                  className={styles.promptText}
                />
              </details>
            </section>
          )}
          {data && (
            <details className={styles.sharedDetails}>
              <summary>{messages("sharedDetails")}</summary>
              <p>{messages("sharedDescription")}</p>
              {shared?.context.audience && (
                <p>
                  {messages("audience", { value: shared.context.audience })}
                </p>
              )}
              {shared?.context.situation && (
                <p>
                  {messages("situation", { value: shared.context.situation })}
                </p>
              )}
              {!!shared?.sources.length && (
                <ul className={styles.sourceList}>
                  {shared.sources.map((source) => (
                    <li key={source.id}>
                      <strong>{source.label}</strong>
                      <p>{source.content}</p>
                    </li>
                  ))}
                </ul>
              )}
              {shared?.truncated && <p>{messages("truncated")}</p>}
              <p>{messages("notDoneByReading")}</p>
            </details>
          )}
        </div>
      )}
      {!section && (
        <details className={styles.sourceDetails}>
          <summary>{messages("sourceDetails")}</summary>
          <p>{messages("sourceDescription")}</p>
        </details>
      )}
      <AlertDialog open={confirming} onOpenChange={props.onConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{messages("confirmTitle")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>
              {messages("back")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                props.onConfirm();
              }}
              disabled={busy !== null}
            >
              {messages("updateShared")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
