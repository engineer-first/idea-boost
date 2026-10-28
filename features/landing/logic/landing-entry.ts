import { getLoginPath, sanitizeNextPath } from "@/features/auth";
import { landingCopy } from "./landing-copy";

export type LandingEntry = {
  href: string;
  loginHref: string;
  label: string;
  showStartHelp: boolean;
};

export function getLandingEntry(
  isLoggedIn: boolean,
  next?: string,
): LandingEntry {
  const safeNext = sanitizeNextPath(next);
  const pathname =
    new URL(safeNext, "https://landing.invalid").pathname.replace(/\/+$/, "") ||
    "/";
  const destination = ["/", "/login", "/about"].includes(pathname)
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
      isLoggedIn || context !== "return"
        ? destination
        : getLoginPath(destination),
    loginHref: getLoginPath(destination),
    label: landingCopy.cta[context][isLoggedIn ? 1 : 0],
    showStartHelp: context === "normal" && !isLoggedIn,
  };
}
