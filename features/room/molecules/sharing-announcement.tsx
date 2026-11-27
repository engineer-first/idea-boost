import type { ProtocolMember } from "@/contracts/room-protocol";
import { MemberAvatar } from "@/features/room-members";
import styles from "./sharing-announcement.module.css";

export type SharingAnnouncementProps = {
  member: ProtocolMember;
  /** 発表者が自分のとき、主色の淡い面で強調し「あなたのターンです」と示す。 */
  isSelf?: boolean;
};

/**
 * 共有ステップで今の発表者をボード中央上部に出し続ける。
 * 右上の順番の小さな表示だけでは誰の番か気づきにくいため（#661）。
 * 広い幅では中央上部のステップの並び（PhaseStepTrail）の真下に置く。
 * 名前の下に発表者と聞く人それぞれの今することを1行で添え、
 * ステップガイドを開かなくても入った直後から動けるようにする（#1388）。
 */
export function SharingAnnouncement({
  member,
  isSelf = false,
}: SharingAnnouncementProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sharing-current-presenter"
      data-board-fit-occupy="true"
      data-self={isSelf || undefined}
      className={`pointer-events-none absolute left-1/2 top-[112px] z-[41] flex max-w-[min(28rem,calc(100%-24px))] -translate-x-1/2 flex-col items-start gap-1 rounded-xl border px-4 py-3 text-base font-semibold shadow-tool max-[900px]:top-[156px] max-[639px]:top-[288px] ${isSelf ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-background"}`}
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
          {isSelf ? "あなたのターンです" : `${member.name}さんのターンです`}
        </span>
      </span>

      {/* 左の余白はアバター（32px）と間隔（gap-3）の和で、名前の書き出しに揃える。
          iPad 幅以下では右のマイ付箋の欄に届かないよう、この行で案内を広げず名前の幅で折り返す。 */}
      <span
        className={`pl-11 text-sm font-normal max-[900px]:self-stretch max-[900px]:[contain:inline-size] ${isSelf ? "text-primary-strong" : "text-muted-foreground"}`}
      >
        {isSelf
          ? "マイ付箋をボードに出して説明しよう"
          : "話を聞いて、リアクションを送ろう"}
      </span>
    </div>
  );
}
