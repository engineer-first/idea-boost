import { getLoginPath, sanitizeNextPath } from "@/features/auth";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "./landing-content";

export type LandingEntry = {
  href: string;
  loginHref: string;
  label: string;
  showStartHelp: boolean;
  // ヒーローで招待コードを入力して参加できるか。招待・戻り先の文脈では行き先が決まっているので出さない。
  showCodeEntry: boolean;
};

export function getLandingEntry(
  isLoggedIn: boolean,
  next?: string,
  locale: AppLocale = "ja",
): LandingEntry {
  const safeNext = sanitizeNextPath(next);
  const pathname =
    new URL(safeNext, "https://landing.invalid").pathname.replace(/\/+$/, "") ||
    "/";
  const destination = ["/", "/login", "/about", "/en", "/en/about"].includes(
    pathname,
  )
    ? "/home"
    : safeNext;
  const context =
    destination === "/home"
      ? "normal"
      : pathname.startsWith("/invite/")
        ? "invite"
        : "return";
  return {
    href:
      isLoggedIn || context === "invite"
        ? destination
        : getLoginPath(destination),
    loginHref: getLoginPath(destination),
    label:
      getLandingContent(locale).landingCopy.cta[context][isLoggedIn ? 1 : 0],
    showStartHelp: context === "normal" && !isLoggedIn,
    showCodeEntry: context === "normal",
  };
}
