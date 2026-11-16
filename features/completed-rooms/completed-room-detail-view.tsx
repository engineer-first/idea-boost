"use client";
import Link from "next/link";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import type {
  CompletedBoardResponse,
  CompletedRoom,
  CompletedSceneKind,
} from "@/contracts/completed-rooms";
import {
  type FeedbackControls,
  FeedbackPanel,
  FeedbackPrompt,
} from "@/features/feedback";
import { RoomOutcomeView } from "@/features/room";
import { CompletedBoardView } from "./completed-board-view";
import {
  formatCompletedDate,
  SCENE_LABELS,
  SCENE_STATUS,
} from "./completed-rooms-content";

function formatCompactCompletedDate(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo",
  }).format(value);
}
export type CompletedRoomDetailViewProps = {
  reflection?: ReactNode;
  accountLink?: ReactNode;
  feedback?: FeedbackControls;
  room: CompletedRoom | null;
  loading: boolean;
  error: string | null;
  expanded: boolean;
  selected: CompletedSceneKind;
  scene: CompletedBoardResponse | null;
  sceneLoading: boolean;
  sceneError: string | null;
  onRetry: () => void;
  onToggle: () => void;
  onSelect: (kind: CompletedSceneKind) => void;
  onSceneRetry: () => void;
};
export function CompletedRoomDetailView({
  reflection,
  feedback,
  room,
  accountLink,
  loading,
  error,
  expanded,
  selected,
  scene,
  sceneLoading,
  sceneError,
  onRetry,
  onToggle,
  onSelect,
  onSceneRetry,
}: CompletedRoomDetailViewProps) {
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  if (!room)
    return (
      <main className="h-full overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <Link
            href="/completed-rooms"
            className="inline-flex min-h-11 items-center underline"
          >
            以前のルームへ
          </Link>
          {loading ? (
            <p role="status">成果を読み込み中…</p>
          ) : (
            <>
              <p role="alert">{error ?? "成果を取得できませんでした。"}</p>
              <Button className="min-h-11" onClick={onRetry}>
                再取得
              </Button>
            </>
          )}
          {accountLink ? (
            <div className="border-t pt-6">{accountLink}</div>
          ) : null}
        </div>
      </main>
    );
  const outcome = {
    issue: room.decisions.find((d) => d.phase === 1)?.content ?? "",
    hmw: room.decisions.find((d) => d.phase === 2)?.content ?? "",
    idea: room.decisions.find((d) => d.phase === 3)?.content ?? "",
  };
  return (
    <>
      <RoomOutcomeView
        reflection={reflection}
        authorized
        outcome={outcome}
        additionalNavigation={
          <Link
            href="/completed-rooms"
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            以前のルーム一覧へ
          </Link>
        }
        recordInfo={
          <section
            aria-label="記録情報"
            className="mt-8 border-t border-border pt-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">記録情報</h2>
              <span className="text-xs text-muted-foreground">日本時間</span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">完了日時</dt>
                <dd className="mt-1 text-sm font-medium tabular-nums">
                  {formatCompactCompletedDate(room.completedAt)}
                </dd>
              </div>

              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">閲覧期限</dt>
                <dd className="mt-1 text-sm font-medium tabular-nums">
                  {formatCompactCompletedDate(room.expiresAt)}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-1">
                読み取り専用
              </span>
              <span>再表示：ホーム ＞ 過去の成果</span>
            </div>
          </section>
        }
        onOpenFeedback={feedback ? () => feedback.open("app") : undefined}
        feedbackButtonRef={feedbackButtonRef}
        onExportSuccess={feedback?.schedulePrompt}
        onExportFailure={feedback?.cancelPrompt}
        feedbackPrompt={
          feedback ? (
            <FeedbackPrompt
              feedback={feedback}
              returnFocusRef={feedbackButtonRef}
            />
          ) : null
        }
        footer={accountLink}
      >
        <section className="mt-8 space-y-4" aria-label="完了ルームの記録">
          <Button
            className="min-h-11 w-full justify-between"
            variant="outline"
            aria-expanded={expanded}
            aria-controls="completed-history"
            onClick={onToggle}
          >
            検討の経緯を見る
            <span aria-hidden="true">{expanded ? "−" : "＋"}</span>
          </Button>
          {expanded && (
            <div
              id="completed-history"
              className="space-y-4 rounded-lg border p-4 sm:p-6"
            >
              <p className="text-base leading-6 text-muted-foreground">
                共有されていた付箋と配置を見返せます。配置から採用理由を示すものではありません。
              </p>
              <div className="space-y-2">
                <label
                  htmlFor="completed-scene"
                  className="block text-base font-semibold"
                >
                  見返す場面
                </label>
                <select
                  id="completed-scene"
                  className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base"
                  value={selected}
                  onChange={(e) =>
                    onSelect(e.target.value as CompletedSceneKind)
                  }
                >
                  {room.scenes.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {SCENE_LABELS[item.kind]}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                className="min-h-11"
                variant="outline"
                onClick={onSceneRetry}
                disabled={sceneLoading}
              >
                場面を再取得
              </Button>
              <div aria-busy={sceneLoading} aria-live="polite">
                {sceneLoading ? (
                  <p role="status">場面を読み込み中…</p>
                ) : sceneError ? (
                  <p role="alert">{sceneError}</p>
                ) : (
                  scene && (
                    <div className="space-y-4">
                      <h2 className="text-lg font-bold">
                        {SCENE_LABELS[selected]}
                      </h2>
                      {scene.scene.recordedAt !== null && (
                        <p className="text-base text-muted-foreground">
                          記録日時：
                          {formatCompletedDate(scene.scene.recordedAt)}
                          （日本時間）
                        </p>
                      )}
                      {scene.board ? (
                        <CompletedBoardView board={scene.board} />
                      ) : (
                        <p className="rounded-lg bg-muted/40 p-4 text-base leading-7">
                          {SCENE_STATUS[scene.scene.status]}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </section>
      </RoomOutcomeView>
      {feedback ? <FeedbackPanel feedback={feedback} /> : null}
    </>
  );
}
