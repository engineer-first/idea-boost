"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { MemberAvatar } from "@/features/room-members";
import styles from "./sharing-announcement.module.css";

export type SharingAnnouncementProps = {
  member: ProtocolMember;
  /** 発表者が自分のとき、主色の淡い面で強調し「あなたの順番です」と示す。 */
  isSelf?: boolean;
  /**
   * 聞く人から見て発表者の接続が切れているとき、名前の行を接続切れの知らせに替える。
   * 戻らない発表者を待って止まらないよう、右上の順番のメニューを開かずにパスできる（#1431）。
   */
  isDisconnected?: boolean;
  /** 接続切れのときだけ、案内の行の代わりに「パスする」を出す。 */
  onPass?: () => void;
  passDisabled?: boolean;
};

/**
 * 共有ステップで今の発表者をボード中央上部に出し続ける。
 * 右上の順番の小さな表示だけでは誰の番か気づきにくいため（#661）。
 * 広い幅では中央上部のステップの並び（PhaseStepTrail）の真下に置く。
 * iPad 幅（640〜900px）では中央だと右のマイ付箋の欄（幅 15rem）に届くため、欄の左に右寄せする。
 * 名前の下に発表者と聞く人それぞれの今することを1行で添え、
 * ステップガイドを開かなくても入った直後から動けるようにする（#1388）。
 */
export function SharingAnnouncement({
  member,
  isSelf = false,
  isDisconnected = false,
  onPass,
  passDisabled = false,
}: SharingAnnouncementProps) {
  const t = useTranslations("app.boardSharing");
  const showsDisconnected = isDisconnected && !isSelf;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sharing-current-presenter"
      data-board-fit-occupy="true"
      data-self={isSelf || undefined}
      className={`pointer-events-none absolute left-1/2 top-[112px] z-[41] flex max-w-[min(28rem,calc(100%-24px))] -translate-x-1/2 flex-col items-start gap-1 rounded-xl border px-4 py-3 text-base font-semibold shadow-tool max-[900px]:top-[156px] min-[640px]:max-[900px]:left-auto min-[640px]:max-[900px]:right-[calc(15rem+0.75rem)] min-[640px]:max-[900px]:max-w-[min(28rem,calc(100%-15rem-0.75rem))] min-[640px]:max-[900px]:translate-x-0 max-[639px]:top-[288px] ${isSelf ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-background"}`}
    >
      {/* live region は残したまま中身だけ差し替え、交代を確実に読み上げる。
          発表者が替わったら中身を出し直し、登場の動きで交代に気づけるようにする。 */}
      <span
        key={member.userId}
        className={`${styles.announcement} flex min-w-0 items-center gap-3`}
      >
        <MemberAvatar
          name={member.name}
          avatarId={member.avatarId}
          color={member.color}
          size={32}
        />
        <span className="min-w-0 break-words">
          {isSelf
            ? t("yourTurn")
            : showsDisconnected
              ? t("memberDisconnected", { name: member.name })
              : t("memberTurn", { name: member.name })}
        </span>
      </span>

      {showsDisconnected && onPass ? (
        // 枠は押せない層（pointer-events-none）なので、ボタンだけ押せるようにする。
        // 接続が切れた人のパスは確認を挟まない（順番のメニューの「パス」と同じ）。
        <span className="pl-11">
          <Button
            type="button"
            variant="outline"
            className="pointer-events-auto min-h-11 px-3 text-sm"
            aria-label={t("passMember", { name: member.name })}
            disabled={passDisabled}
            onClick={onPass}
          >
            {t("pass")}
          </Button>
        </span>
      ) : showsDisconnected ? null : (
        // 左の余白はアバター（32px）と間隔（gap-3）の和で、名前の書き出しに揃える。
        // 900px 未満では、この行で案内を広げず名前の幅で折り返し、狭い画面で案内を細く保つ。
        <span
          className={`pl-11 text-sm font-normal max-[900px]:self-stretch max-[900px]:[contain:inline-size] ${isSelf ? "text-primary-strong" : "text-muted-foreground"}`}
        >
          {isSelf ? t("selfInstruction") : t("listenerInstruction")}
        </span>
      )}
    </div>
  );
}
