"use client";
import Link from "next/link";
import { useRef } from "react";
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
export type CompletedRoomDetailViewProps = {
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
  feedback,
  room,
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
        authorized
        outcome={outcome}
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
      >
        {feedback ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            感想は現在参加中のルームからのみ送信できます。退出・解散後は送信できません。
          </p>
        ) : null}
        <section className="mt-8 space-y-4" aria-label="完了ルームの記録">
          <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-7">
            <p>完了日時：{formatCompletedDate(room.completedAt)}（日本時間）</p>
            <p>閲覧期限：{formatCompletedDate(room.expiresAt)}（日本時間）</p>
            <p className="text-muted-foreground">
              完了時の内容を読み取り専用で表示しています。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/completed-rooms"
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-4"
            >
              以前のルームへ
            </Link>
            <Button className="min-h-11" variant="outline" onClick={onRetry}>
              成果を再取得
            </Button>
          </div>
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
              className="space-y-5 rounded-xl border p-4 sm:p-6"
            >
              <p className="text-sm leading-6 text-muted-foreground">
                共有されていた付箋と配置を見返せます。配置から採用理由を示すものではありません。
              </p>
              <div className="space-y-2">
                <label
                  htmlFor="completed-scene"
                  className="block text-sm font-semibold"
                >
                  見返す場面
                </label>
                <select
                  id="completed-scene"
                  className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
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
                        <p className="text-sm text-muted-foreground">
                          記録日時：
                          {formatCompletedDate(scene.scene.recordedAt)}
                          （日本時間）
                        </p>
                      )}
                      {scene.board ? (
                        <CompletedBoardView board={scene.board} />
                      ) : (
                        <p className="rounded-lg bg-muted/40 p-4 text-sm leading-7">
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
