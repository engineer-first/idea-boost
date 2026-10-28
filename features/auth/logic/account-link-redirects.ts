import {
  ACCOUNT_LINK_RESULT_PARAM,
  type AccountLinkResult,
} from "@/contracts/account-link";
import { sanitizeNextPath } from "./redirects";

export function accountLinkResultPath(
  next: string,
  result: AccountLinkResult,
): string {
  const url = new URL(sanitizeNextPath(next), "http://localhost");
  url.searchParams.set(ACCOUNT_LINK_RESULT_PARAM, result);
  return `${url.pathname}${url.search}${url.hash}`;
}
