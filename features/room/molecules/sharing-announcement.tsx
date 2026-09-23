import type { ProtocolMember } from "@/contracts/room-protocol";
import { MemberAvatar } from "@/features/room-members";
import styles from "./sharing-announcement.module.css";

export function SharingAnnouncement({ member }: { member: ProtocolMember }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${styles.announcement} pointer-events-none absolute left-1/2 top-3 z-[41] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-blue-200 bg-background px-4 py-3 text-sm font-semibold shadow-lg max-[1439px]:top-[84px] max-[900px]:top-[156px]`}
    >
      <MemberAvatar name={member.name} color={member.color} size={32} />
      <span className="min-w-0 break-words">{member.name}さんのターンです</span>
    </div>
  );
}
