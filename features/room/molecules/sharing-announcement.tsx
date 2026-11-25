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
      className={`${styles.announcement} pointer-events-none absolute left-1/2 top-[84px] z-[41] flex max-w-[min(28rem,calc(100%-24px))] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 text-base font-semibold shadow-tool max-[900px]:top-[156px] max-[639px]:top-[288px] ${isSelf ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-background"}`}
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
    </div>
  );
}
