"use client";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  REFLECTION_ARTIFACT_MAX,
  type ReflectionChapterKind,
  type ReflectionResponse,
} from "@/contracts/outcome-reflection";

export type OutcomeReflectionViewProps = {
  recordsHref?: string;
  chapter?: ReflectionChapterKind;
  onChapter?: (kind: ReflectionChapterKind) => void;
  open: boolean;
  data: ReflectionResponse | null;
  busy: "analysis" | "prompt" | null;
  error: string | null;
  artifact: string;
  copy: "idle" | "success" | "failed";
  onStart: () => void;
  onArtifact: (artifact: string) => void;
  onGenerate: () => void;
  onCopy: () => void;
};
const CHAPTERS = [
  { kind: "change", title: "この案で、何が変わりそう？" },
  { kind: "assumption", title: "最初に確かめたいこと" },
  { kind: "experiment", title: "まず試してみること" },
] as const;

function ReflectionMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 sm:gap-6">
      <Image
        src="/landing/mood-a.webp"
        alt=""
        width={80}
        height={80}
        className="h-12 w-12 shrink-0 object-contain sm:h-20 sm:w-20"
      />
      <div className="relative min-w-0 flex-1 space-y-3 rounded-2xl bg-[var(--ib-color-primary-soft)] p-4 before:absolute before:top-6 before:-left-3 before:border-y-[10px] before:border-r-[14px] before:border-y-transparent before:border-r-[var(--ib-color-primary-soft)] before:content-[''] sm:p-6">
        {children}
      </div>
    </div>
  );
}

export function OutcomeReflectionView({
  recordsHref,
  chapter: activeChapter = "change",
  onChapter,
  open,
  data,
  busy,
  error,
  artifact,
  copy,
  onStart,
  onArtifact,
  onGenerate,
  onCopy,
}: OutcomeReflectionViewProps) {
  const analysis = data?.analysis;
  const recommendation = analysis?.recommendation;
  const candidates = [
    ...new Set(
      [recommendation?.name, ...(analysis?.alternatives ?? [])].filter(
        (name): name is string => Boolean(name),
      ),
    ),
  ];
  return (
    <section
      aria-label="AIと振り返る"
      className="mx-auto mt-12 min-w-0 max-w-4xl border-t border-border pt-8 [overflow-wrap:anywhere]"
    >
      <ReflectionMessage>
        <h2 className="text-xl font-bold sm:text-2xl">
          このアイデア、まずどう試してみよう？
        </h2>
        <p className="text-base leading-7">
          チームの記録から、目指す変化と、最初に確かめたいことを整理するよ。小さく試す方法も一緒に考えてみよう。
        </p>
      </ReflectionMessage>
      <details className="mt-4 text-base leading-7 text-muted-foreground">
        <summary className="cursor-pointer py-2 underline underline-offset-4">
          AIが使う記録について
        </summary>
        <p>
          確定した課題・問い・採用案と、課題のグループ化・問いの決定・アイデアの整理で保存された共有付箋を使います。個人付箋や保存されていない会話は含みません。チームで決めた内容と、利用者に確かめられた内容を分けて考えます。AIの提案には誤りが含まれることがあります。
        </p>
      </details>
      {!open && (
        <Button className="mt-5 min-h-12" onClick={onStart}>
          AIと振り返る
        </Button>
      )}
      {open && (
        <div className="mt-8 space-y-8">
          {busy === "analysis" && (
            <p role="status" className="rounded-xl bg-primary/5 p-5">
              チームの記録を読んでいるよ…
            </p>
          )}
          {analysis && (
            <div>
              {CHAPTERS.map(({ kind, title }, index) => {
                const chapter = analysis[kind];
                return (
                  <details
                    key={kind}
                    id={`reflection-${kind}`}
                    open={activeChapter === kind}
                    className="border-b border-border py-6"
                  >
                    <summary className="cursor-pointer text-xl font-bold sm:text-2xl">
                      <span className="mr-3 text-base text-primary">
                        {index + 1}
                      </span>
                      {title}
                    </summary>
                    <div className="space-y-5 py-6">
                      <ReflectionMessage>
                        <p className="text-sm font-semibold text-primary">
                          AIからの提案
                        </p>
                        <h4 className="text-xl font-bold leading-snug sm:text-2xl">
                          {chapter.headline}
                        </h4>
                        {kind === "experiment" ? (
                          <dl className="space-y-5 text-base leading-7">
                            <div>
                              <dt className="font-semibold">試す相手</dt>
                              <dd className="mt-1">
                                {analysis.experiment.who}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">やってみること</dt>
                              <dd className="mt-2">
                                <ol className="list-decimal space-y-2 pl-5">
                                  {analysis.experiment.steps.map((step) => (
                                    <li key={step}>{step}</li>
                                  ))}
                                </ol>
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">
                                見ておきたいこと
                              </dt>
                              <dd className="mt-1">
                                {analysis.experiment.observe}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">
                                考えた通りだったら
                              </dt>
                              <dd className="mt-1">
                                {analysis.experiment.ifSupported}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">
                                違った・まだ分からなかったら
                              </dt>
                              <dd className="mt-1">
                                {analysis.experiment.ifNotSupported}
                              </dd>
                            </div>
                          </dl>
                        ) : (
                          <p className="whitespace-pre-wrap text-base leading-7 sm:text-lg sm:leading-8">
                            {analysis[kind].interpretation}
                          </p>
                        )}
                      </ReflectionMessage>
                      <details className="text-base leading-7">
                        <summary className="cursor-pointer py-2 font-semibold text-primary underline underline-offset-4">
                          根拠の記録を見る
                        </summary>
                        <div className="space-y-4 py-3">
                          {recordsHref && (
                            <a
                              href={recordsHref}
                              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                            >
                              保存された検討過程を開く
                            </a>
                          )}
                          {chapter.evidenceIds.length === 0 && (
                            <p className="text-muted-foreground">
                              この見立ての根拠になる記録が不足しています。
                            </p>
                          )}
                          {chapter.evidenceIds.map((id) => {
                            const source = analysis.sources.find(
                              (item) => item.id === id,
                            );
                            return (
                              source && (
                                <blockquote
                                  key={id}
                                  className="border-l-2 border-border pl-4"
                                >
                                  <p className="font-semibold">
                                    {source.label} · 記録にある内容
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap">
                                    {source.content}
                                  </p>
                                </blockquote>
                              )
                            );
                          })}
                        </div>
                      </details>
                      <div className="flex flex-wrap items-center gap-5 pt-3">
                        <Button asChild className="min-h-12">
                          <a
                            href={
                              index < 2
                                ? `#reflection-${CHAPTERS[index + 1].kind}`
                                : "#reflection-artifacts"
                            }
                            onClick={() => {
                              if (index < 2)
                                onChapter?.(CHAPTERS[index + 1].kind);
                            }}
                          >
                            {index < 2
                              ? `${CHAPTERS[index + 1].title}へ`
                              : "試すための準備へ"}
                            <ArrowRight aria-hidden="true" className="ml-2" />
                          </a>
                        </Button>
                        {recordsHref && (
                          <a
                            href={recordsHref}
                            className="inline-flex min-h-11 items-center text-base underline underline-offset-4"
                          >
                            成果へ戻る
                          </a>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
              {analysis.truncated && (
                <p className="py-4 text-base text-muted-foreground">
                  記録が多いため、一部の共有付箋を省いて振り返っています。
                </p>
              )}
            </div>
          )}
          {busy !== "analysis" && (
            <section
              id="reflection-artifacts"
              className="space-y-5 border-t border-border pt-8"
              aria-label="次に作るもの"
            >
              <ReflectionMessage>
                <h3 className="text-balance text-2xl font-bold">
                  次は、何を作ってみる？
                </h3>
                {recommendation ? (
                  <div className="space-y-3 text-base leading-7">
                    <p className="font-bold text-primary">
                      試す準備に「{recommendation.name}」を作ってみよう。
                    </p>
                    <p>{recommendation.reason}</p>
                    <p>
                      <span className="font-semibold">確かめられること：</span>
                      {recommendation.checks}
                    </p>
                  </div>
                ) : (
                  <p className="text-base leading-7">
                    {analysis
                      ? "準備物がなくても、上の方法で試せるよ。何か用意したければ、下の欄に書いてみてね。"
                      : "試すために用意したいものを、下の欄に書いてみてね。"}
                  </p>
                )}
              </ReflectionMessage>
              {candidates.length > 0 && (
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-base font-semibold">
                    作ってみたいものを選んでね
                  </legend>
                  {candidates.map((candidate) => (
                    <label
                      key={candidate}
                      className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-base"
                    >
                      <input
                        type="radio"
                        name="reflection-artifact"
                        value={candidate}
                        checked={artifact === candidate}
                        onChange={() => onArtifact(candidate)}
                        className="mt-1.5"
                      />
                      {candidate}を作りたい
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="space-y-2">
                <label
                  htmlFor="reflection-artifact"
                  className="block text-base font-semibold"
                >
                  ほかに作りたいものはある？
                </label>
                <input
                  id="reflection-artifact"
                  value={artifact}
                  maxLength={REFLECTION_ARTIFACT_MAX}
                  onChange={(event) => onArtifact(event.target.value)}
                  placeholder="例：イベント当日の進行台本"
                  className="min-h-12 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base"
                />
              </div>
              <Button
                onClick={onGenerate}
                disabled={!artifact.trim() || busy !== null}
                className="min-h-12"
              >
                {busy === "prompt"
                  ? "AIへの依頼文を作っているよ…"
                  : "AIへの依頼文を作る"}
              </Button>
            </section>
          )}
          {data?.prompt && (
            <section className="space-y-4" aria-label="制作プロンプト">
              <ReflectionMessage>
                <h3 className="text-xl font-bold sm:text-2xl">
                  この文章をAIに貼り付けてね
                </h3>
                <p className="text-base leading-7">
                  選んだものを作って、この案を試すための依頼文だよ。コピーして、使いたいAIに渡してね。
                </p>
              </ReflectionMessage>
              <textarea
                aria-label="制作プロンプト全文"
                readOnly
                value={data.prompt.content}
                className="min-h-80 w-full resize-y rounded-xl border border-border bg-background p-5 text-base leading-7"
              />
              <Button className="min-h-12" onClick={onCopy}>
                全文をコピー
              </Button>
              {copy === "success" && <p role="status">コピーしました。</p>}
              {copy === "failed" && (
                <p role="alert">
                  コピーできませんでした。上の全文を選択して手動でコピーしてください。
                </p>
              )}
            </section>
          )}
          {error && (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-destructive p-4 text-base leading-7"
            >
              <p>{error}</p>
              {!analysis && (
                <Button
                  variant="outline"
                  onClick={onStart}
                  disabled={busy !== null}
                >
                  振り返りを再試行
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
