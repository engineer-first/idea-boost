import assert from "node:assert/strict";
import { exportPKCS8, generateKeyPair } from "jose";
import { runPrioritySync } from "../workers/pbi-priority/worker.ts";

// Only synthetic credentials; the adapter never sends requests to GitHub.
const endpoint = "http://127.0.0.1:4918/github";
const keys = await generateKeyPair("RS256", { extractable: true });
const env = {
  ISSUE_PROJECT_APP_CLIENT_ID: "simulation-app",
  ISSUE_PROJECT_APP_PRIVATE_KEY: await exportPKCS8(keys.privateKey),
};
const localFetch: typeof fetch = (input, init) => {
  const path = new URL(String(input)).pathname;
  return fetch(`${endpoint}${path}`, init);
};
await fetch(`${endpoint}/reset`, { method: "POST" });
const first = await runPrioritySync(env, localFetch);
assert.equal(first.updated, 2);
const second = await runPrioritySync(env, localFetch);
assert.equal(second.updated, 0);
console.log(JSON.stringify({ first, second }));
