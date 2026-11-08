"use client";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  REFLECTION_ARTIFACT_MAX,
  type ReflectionResponse,
} from "@/contracts/outcome-reflection";

export type OutcomeReflectionViewProps = {
  recordsHref?: string;
  chapter?: "response" | "difference" | "assumptions";
  onChapter?: (kind: "response" | "difference" | "assumptions") => void;
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
  { kind: "response", title: "問いとのつながり" },
  { kind: "difference", title: "ほかの案との違い" },
  { kind: "assumptions", title: "まだ確かめたいこと" },
] as const;

export function OutcomeReflectionView({
  recordsHref,
  chapter: activeChapter = "response",
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
      <div className="flex items-center justify-between gap-5">
        <div className="space-y-3">
          <p className="text-base font-semibold text-primary">次の一歩へ</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            アイデアを、もう一歩先へ。
          </h2>
          <p className="text-base leading-7 text-muted-foreground">
            チームの記録を振り返って、次に作るものを見つけよう。
          </p>
        </div>
        <Image
          src="/landing/mood-a.webp"
          alt=""
          width={112}
          height={112}
          className="h-20 w-20 shrink-0 object-contain sm:h-28 sm:w-28"
        />
      </div>
      <details className="mt-4 text-base leading-7 text-muted-foreground">
        <summary className="cursor-pointer py-2 underline underline-offset-4">
          AIが使う記録について
        </summary>
        <p>
          確定した課題・問い・採用案と、保存済みの共有付箋を使います。個人付箋や記録されていない会話は含みません。AIの見立てには誤りが含まれることがあります。
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
              記録を読み返しています…
            </p>
          )}
          {analysis && (
            <div className="border-l-2 border-primary/20 pl-5 sm:pl-8">
              {CHAPTERS.map(({ kind, title }, index) => {
                const chapter = analysis.chapters.find(
                  (item) => item.kind === kind,
                );
                if (!chapter) return null;
                return (
                  <details
                    key={kind}
                    id={`reflection-${kind}`}
                    open={activeChapter === kind}
                    className="border-b border-border py-6"
                  >
                    <summary className="cursor-pointer text-2xl font-bold sm:text-3xl">
                      <span className="mr-3 text-base text-primary">
                        {index + 1}
                      </span>
                      {title}
                    </summary>
                    <div className="space-y-5 py-6">
                      <p className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-base font-semibold text-primary">
                        AIの見立て
                      </p>
                      <h4 className="text-2xl font-bold leading-snug sm:text-3xl">
                        {chapter.headline}
                      </h4>
                      <p className="whitespace-pre-wrap text-lg leading-8">
                        {chapter.interpretation}
                      </p>
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
                              : "次に作るものへ"}
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
              className="space-y-5 rounded-xl bg-primary/5 p-5 sm:p-8"
              aria-label="次に作るもの"
            >
              <h3 className="text-2xl font-bold">次は、何を作ってみる？</h3>
              {recommendation ? (
                <div className="space-y-3 text-base leading-7">
                  <p className="font-bold text-primary">
                    おすすめ：{recommendation.name}
                  </p>
                  <p>{recommendation.reason}</p>
                  <p>
                    <span className="font-semibold">確かめられること：</span>
                    {recommendation.checks}
                  </p>
                </div>
              ) : (
                <p className="text-base leading-7">
                  作りたいものを選ぶか、自由に入力して進めます。
                </p>
              )}
              {candidates.length > 0 && (
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-base font-semibold">
                    制作物の候補
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
                      {candidate}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="space-y-2">
                <label
                  htmlFor="reflection-artifact"
                  className="block text-base font-semibold"
                >
                  作るものを自由に指定
                </label>
                <input
                  id="reflection-artifact"
                  value={artifact}
                  maxLength={REFLECTION_ARTIFACT_MAX}
                  onChange={(event) => onArtifact(event.target.value)}
                  placeholder="例：イベント当日の体験シナリオ"
                  className="min-h-12 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base"
                />
              </div>
              <Button
                onClick={onGenerate}
                disabled={!artifact.trim() || busy !== null}
                className="min-h-12"
              >
                {busy === "prompt"
                  ? "プロンプトを作成中…"
                  : "制作プロンプトを作る"}
              </Button>
            </section>
          )}
          {data?.prompt && (
            <section className="space-y-4" aria-label="制作プロンプト">
              <h3 className="text-2xl font-bold">
                そのまま持ち出して、作ってみよう。
              </h3>
              <p className="text-base leading-7 text-muted-foreground">
                好きな外部AIツールに貼り付けて使えます。
              </p>
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
