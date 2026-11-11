import { previewPrincipalEmail } from "../../contracts/preview";

// Access本人のアドレスを許可一覧と照合する。相手役の形式を本人として扱わない。
export function isPreviewEmailAllowed(
  email: string,
  allowed: string | undefined,
): boolean {
  return Boolean(
    allowed
      ?.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase()),
  );
}

// Gatewayが署名したアプリの参加者を照合する。相手役は元の本人の許可で参加できる。
export function isPreviewParticipantAllowed(
  email: string,
  allowed: string | undefined,
): boolean {
  return isPreviewEmailAllowed(previewPrincipalEmail(email), allowed);
}
