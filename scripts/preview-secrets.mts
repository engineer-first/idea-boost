import { createHmac } from "node:crypto";
import { z } from "zod";
import { previewDatabaseName } from "./preview-config.mts";

function derive(
  master: string,
  number: number,
  purpose: string,
  databaseId?: string,
): string {
  z.string().min(32).parse(master);
  previewDatabaseName(number);
  return createHmac("sha256", master)
    .update(
      JSON.stringify([
        "idea-boost-preview-v2",
        purpose,
        number,
        databaseId ?? null,
      ]),
    )
    .digest("hex");
}
// masterはCIだけに保持。再公開では同じ鍵、D1を再作成した開き直しでは別の鍵。
export function previewSessionSecret(
  master: string,
  number: number,
  databaseId: string,
): string {
  z.string().uuid().parse(databaseId);
  return derive(master, number, "session", databaseId);
}
export function previewProbeToken(master: string, number: number): string {
  return derive(master, number, "probe");
}
