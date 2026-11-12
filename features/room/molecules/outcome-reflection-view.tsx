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
import { useEffect, useRef } from "react";
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
const SECTION_TITLES = {
  research: "ニーズ調査の準備",
  competition: "競合・代替手段",
  artifact: "調査の準備物",
} as const;
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
  const shared = data?.shared;
  const result = shared?.result;
  const plan = result?.kind === "plan" ? result : null;
  const questions = result?.kind === "questions" ? result.questions : [];
  const fields = editing
    ? [
        { field: "audience" as const, question: "誰の困りごとを調べたい？" },
        { field: "situation" as const, question: "どんな場面の困りごと？" },
      ]
    : questions;
  const index = plan ? Math.min(step, plan.steps.length - 1) : 0;
  const current = plan?.steps[index];
  const candidates = [
    ...new Set(
      [
        plan?.recommendation?.name,
        ...(plan?.alternatives ?? []),
        "モックアップ",
        "説明するスライド",
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
  const selectedSuggestedArtifact =
    candidates.find((candidate) => candidate === artifact) ??
    candidates.find((candidate) => getArtifactLabel(candidate) === artifact);
  const suggestedArtifactSelected = selectedSuggestedArtifact !== undefined;
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
    <section aria-label="採用案を次に進める" className={styles.root}>
      {!section ? (
        <div className={styles.entryGrid}>
          <div className={styles.primaryEntry}>
            <div className={styles.primaryCopy}>
              <h2>利用者の困りごとを確かめる</h2>
              <ol
                className={styles.primaryPath}
                aria-label="調査で確かめること"
              >
                <li>
                  <Users aria-hidden="true" />
                  誰に
                </li>
                <li>
                  <MessageCircle aria-hidden="true" />
                  何を確かめる
                </li>
                <li>
                  <Eye aria-hidden="true" />
                  どう見る
                </li>
              </ol>
              <Button
                ref={entryRef}
                className={styles.primaryButton}
                onClick={() => props.onOpen("research")}
              >
                調査を準備する <ArrowRight aria-hidden="true" />
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
            <p className={styles.otherLabel}>ほかの準備</p>
            <button
              type="button"
              aria-label="競合・代替手段を調べる"
              className={styles.route}
              onClick={() => props.onOpen("competition")}
            >
              <Search aria-hidden="true" className={styles.routeIcon} />
              <span className={styles.routeCopy}>
                <strong>競合・代替手段</strong>
                <span>検索AI用の依頼文</span>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="調査の準備物を選ぶ"
              className={styles.route}
              onClick={() => props.onOpen("artifact")}
            >
              <FileText aria-hidden="true" className={styles.routeIcon} />
              <span className={styles.routeCopy}>
                <strong>調査の準備物</strong>
                <span>モックや質問リスト</span>
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
              aria-label="次のアクションに戻る"
              onClick={props.onClose}
              className={styles.backButton}
            >
              <ArrowLeft aria-hidden="true" /> 次のアクション
            </Button>
            <Button
              variant="ghost"
              onClick={props.onRefresh}
              disabled={busy !== null}
              className={styles.refreshButton}
            >
              <RefreshCw aria-hidden="true" /> 最新版を取得
            </Button>
          </div>
          <h2 ref={titleRef} tabIndex={-1} className={styles.workspaceTitle}>
            {SECTION_TITLES[section]}
          </h2>
          {busy && (
            <p role="status" className="text-base">
              {busy === "load"
                ? "保存された内容を読み込んでいます…"
                : busy === "research"
                  ? "調査の進め方を用意しています…"
                  : busy === "artifact"
                    ? "制作依頼文を作っています…"
                    : "検索用の依頼文を作っています…"}
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
            <section aria-label="ユーザーニーズの調査" className="space-y-4">
              {fields.length > 0 && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    props.onResearch();
                  }}
                  className={styles.conditionForm}
                >
                  <h3>{editing ? "チームの調査条件" : "調査の前に確認"}</h3>
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
                    まだ分からない項目は「分からない」で進められます。
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
                      補足して手順を作る
                    </Button>
                    {editing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={props.onCancelEdit}
                        disabled={busy !== null}
                      >
                        変更をやめる
                      </Button>
                    )}
                  </div>
                </form>
              )}
              {!result && !editing && (
                <div className={styles.emptyResearch}>
                  <p>採用案に合う調査方法と手順を準備します。</p>
                  <Button onClick={props.onResearch} disabled={busy !== null}>
                    調査の手順を作る
                  </Button>
                </div>
              )}
              {plan && current && !editing && (
                <>
                  <div className={styles.method}>
                    <span className={styles.methodLabel}>今回の調査方法</span>
                    <h3>{plan.method}</h3>
                    <details className={styles.methodReason}>
                      <summary>この方法にした理由</summary>
                      <p>{plan.reason}</p>
                    </details>
                  </div>
                  <article
                    key={index}
                    aria-label="調査の手順"
                    className={styles.stepPane}
                  >
                    <div className={styles.stepProgress}>
                      <p role="status" className={styles.stepProgressText}>
                        手順 {index + 1} / {plan.steps.length}
                      </p>
                      <div
                        role="progressbar"
                        aria-label="調査の進み具合"
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
                        <span>やること</span>
                        <p>{current.action}</p>
                      </div>
                      <div className={styles.stepFocus}>
                        <div className={styles.stepFocusItem}>
                          <p className={styles.stepFocusLabel}>
                            <MessageCircle aria-hidden="true" /> 聞く・試す
                          </p>
                          <p>{current.task}</p>
                        </div>
                        <div className={styles.stepFocusItem}>
                          <p className={styles.stepFocusLabel}>
                            <Eye aria-hidden="true" /> 見る
                          </p>
                          <p>{current.observe}</p>
                        </div>
                      </div>
                      {index === plan.steps.length - 1 && (
                        <div className={styles.synthesis}>
                          <span>次の判断</span>
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
                        前へ
                      </Button>
                      {index < plan.steps.length - 1 ? (
                        <Button onClick={() => props.onStep(index + 1)}>
                          次へ <ArrowRight aria-hidden="true" />
                        </Button>
                      ) : (
                        <Button onClick={() => props.onOpen("artifact")}>
                          準備物を選ぶ
                        </Button>
                      )}
                    </div>
                  </article>
                  <Button
                    variant="ghost"
                    onClick={props.onEdit}
                    disabled={busy !== null}
                  >
                    調査条件を編集
                  </Button>
                </>
              )}
            </section>
          )}
          {data && section === "competition" && (
            <section
              aria-label="競合調査の準備"
              className={styles.competitionSection}
            >
              <p className={styles.competitionLabel}>検索AIに渡す</p>
              <ul className={styles.competitionTargets}>
                <li>似た製品</li>
                <li>今の対処法</li>
                <li>利用者の不満</li>
                <li>違い</li>
              </ul>
              <Button
                onClick={props.onCompetition}
                variant={data.competitionPrompt ? "outline" : "default"}
                disabled={busy !== null}
              >
                競合調査の依頼文を作る
              </Button>
            </section>
          )}
          {data && section === "artifact" && (
            <section
              aria-label="制作物の選択"
              className={styles.artifactSection}
            >
              {plan?.recommendation ? (
                <div className={styles.recommendation}>
                  <span>おすすめ</span>
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
                    <summary>理由を見る</summary>
                    <p>{plan.recommendation.reason}</p>
                  </details>
                </div>
              ) : (
                <p className={styles.independentArtifact}>
                  調査の手順がなくても準備できます。
                </p>
              )}
              <fieldset className={styles.artifactChoices}>
                <legend>調査に使うもの</legend>
                {candidates.map((candidate) => (
                  <label key={candidate} className={styles.artifactChoice}>
                    <input
                      type="radio"
                      name="reflection-artifact"
                      value={candidate}
                      aria-label={candidate}
                      checked={selectedSuggestedArtifact === candidate}
                      onChange={() => props.onArtifact(candidate)}
                      disabled={busy !== null}
                    />
                    {getArtifactLabel(candidate)}
                  </label>
                ))}
              </fieldset>
              <div className={styles.artifactCustom}>
                <label htmlFor="reflection-artifact">別の準備物</label>
                <input
                  id="reflection-artifact"
                  value={suggestedArtifactSelected ? "" : artifact}
                  maxLength={REFLECTION_ARTIFACT_MAX}
                  disabled={busy !== null}
                  onChange={(event) => props.onArtifact(event.target.value)}
                  placeholder="例：調査の記録シート"
                  className={styles.conditionInput}
                />
              </div>
              <Button
                onClick={props.onGenerate}
                variant={data.prompt ? "outline" : "default"}
                disabled={!artifact.trim() || busy !== null}
              >
                制作依頼文を作る
              </Button>
            </section>
          )}
          {prompt && section !== "research" && (
            <section
              aria-label={
                section === "competition"
                  ? "競合調査プロンプト"
                  : "制作プロンプト"
              }
              className={styles.promptSection}
            >
              <h3 className={styles.promptTitle}>
                {section === "competition"
                  ? "検索AIに渡す依頼文"
                  : "制作依頼文"}
              </h3>
              <Button onClick={props.onCopy} className="min-h-12 gap-2 px-5">
                {copy === "success" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Clipboard aria-hidden="true" />
                )}{" "}
                依頼文をコピー
              </Button>
              {copy === "success" && <p role="status">コピーしました。</p>}
              {copy === "failed" && (
                <p role="alert">
                  コピーできませんでした。全文を開いて選択し、コピーしてください。
                </p>
              )}
              <details className={styles.promptDetails}>
                <summary>依頼文の全文を確認</summary>
                <textarea
                  aria-label={
                    section === "competition"
                      ? "競合調査プロンプト全文"
                      : "制作プロンプト全文"
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
              <summary>共有条件・使った記録</summary>
              <p>
                調査条件と手順はチーム共通です。他の人の更新は「最新版を取得」するまで表示に反映されません。
              </p>
              {shared?.context.audience && (
                <p>対象：{shared.context.audience}</p>
              )}
              {shared?.context.situation && (
                <p>場面：{shared.context.situation}</p>
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
              {shared?.truncated && <p>記録が多いため、一部を省いています。</p>}
              <p>手順を読むだけでは、調査済みにはなりません。</p>
            </details>
          )}
        </div>
      )}
      {!section && (
        <details className={styles.sourceDetails}>
          <summary>この提案について</summary>
          <p>
            確定した課題・問い・採用案と、保存済みの共有付箋を使います。個人付箋は含みません。調査の実施結果ではありません。
          </p>
        </details>
      )}
      <AlertDialog open={confirming} onOpenChange={props.onConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              チーム共通の調査手順を作り直しますか？
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>戻る</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                props.onConfirm();
              }}
              disabled={busy !== null}
            >
              共通の手順を更新する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
