const assert = require("node:assert/strict");
const { syncPbiPriority } = require("./sync-pbi-priority.js");

// Local synthetic data only. Never send this verification to GitHub.
const endpoint = "http://127.0.0.1:4918/github";
async function post(path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Mock HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return result.data ?? result;
}
async function main() {
  await post("/reset", {});
  const graphql = (query, variables) => post("/graphql", { query, variables });
  const dryRun = await syncPbiPriority({ graphql, dryRun: true });
  assert.equal(dryRun.updated, 0);
  assert.equal(dryRun.planned.length, 2);
  const first = await syncPbiPriority({ graphql, dryRun: false });
  assert.equal(first.updated, 2);
  const second = await syncPbiPriority({ graphql, dryRun: false });
  assert.equal(second.updated, 0);
  console.log(JSON.stringify({ dryRun, first, second }));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
