import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { describe, expect, test } from "vitest";

const storybook = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const app = process.env.AUTH_APP_TEST_URL;
const api = process.env.AUTH_API_TEST_URL;
const evidence = process.env.AUTH_EVIDENCE_DIR ?? "test-results/auth-entry";

async function capture(page: Page, name: string): Promise<void> {
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${name}.png`) });
}

async function login(page: Page, email: string): Promise<void> {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill("password");
  await page.getByRole("button", { name: "開発用ユーザーでログイン" }).click();
}

test("認証失敗後の入力と再試行を公開storyで操作できる", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 375, height: 420 },
    });
    await page.goto(
      `${storybook}/iframe.html?id=auth-logincard--retry-dev-auth&viewMode=story`,
    );
    await page.getByLabel("メールアドレス").fill("member@example.test");
    await page.getByLabel("パスワード").fill("incorrect");
    await page
      .getByRole("button", { name: "開発用ユーザーでログイン" })
      .click();
    await page.getByRole("alert").waitFor();
    expect(await page.getByLabel("メールアドレス").inputValue()).toBe(
      "member@example.test",
    );
    expect(await page.getByLabel("パスワード").inputValue()).toBe("incorrect");
    await capture(page, "story-retry-short");
    await page.getByLabel("パスワード").fill("password");
    const retry = page.getByRole("button", {
      name: "開発用ユーザーでログイン",
    });
    await retry.scrollIntoViewIfNeeded();
    const box = await retry.boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 420) + (box?.height ?? 0)).toBeLessThanOrEqual(420);
    await retry.click();
    await capture(page, "story-retry-scrolled");
  } finally {
    await browser.close();
  }
});

test("送信中と設定不足で操作可否が伝わる", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(
      `${storybook}/iframe.html?id=auth-logincard--pending-dev-auth&viewMode=story`,
    );
    await page
      .getByRole("button", { name: "開発用ユーザーでログイン" })
      .click();
    const pending = page.getByRole("button", { name: "ログイン中…" });
    await pending.waitFor();
    expect(await pending.isDisabled()).toBe(true);
    await capture(page, "story-pending");
    await page.getByRole("alert").waitFor();
    expect(
      await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .isEnabled(),
    ).toBe(true);
    await page.goto(
      `${storybook}/iframe.html?id=auth-logincard--not-configured&viewMode=story`,
    );
    const google = page.getByRole("button", { name: "Googleでログイン" });
    await google.waitFor();
    expect(await google.isDisabled()).toBe(true);
    await capture(page, "story-not-configured");
  } finally {
    await browser.close();
  }
});

// CIのStorybook検証と実Worker/Next検証を区別し、後者は専用dev:verifyのURL指定時だけ実行する。
// dev:verifyへの準備操作は新しい検証ルームだけを作り、通常DBや既存ルームを変更しない。
describe.skipIf(!app || !api)("専用dev:verifyの実認証経路", () => {
  test("招待での失敗・再試行・再訪・ログアウトと危険なnext拒否", async () => {
    const browser = await chromium.launch();
    const results: Record<string, unknown> = {};
    try {
      const host = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const owner = await host.newPage();
      await owner.goto(`${app}/login?next=%2Fdev%2Fverify`);
      await login(owner, "owner@example.test");
      await owner.waitForURL(`${app}/dev/verify`);
      await capture(owner, "verification-first-visit");
      const prepare = await owner.request.post(
        `${app}/api/verification/rooms`,
        {
          data: { checkpoint: "lobby" },
          headers: { origin: app as string },
        },
      );
      expect(prepare.ok()).toBe(true);
      const activeResponse = await owner.request.get(
        `${app}/api/verification/active`,
      );
      const { active } = await activeResponse.json();
      const invite = `/invite/${active.inviteCode}`;
      results.roomId = active.roomId;
      results.invite = invite;

      const member = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await member.newPage();
      await page.goto(`${app}${invite}`);
      expect(new URL(page.url()).searchParams.get("next")).toBe(invite);
      expect(await page.locator("html").getAttribute("lang")).toBe("ja");
      await capture(page, "after-login");
      await page.getByLabel("メールアドレス").fill("member@example.test");
      await page.getByLabel("パスワード").fill("incorrect");
      await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "メールアドレスまたはパスワードが違います。" })
        .waitFor();
      expect(new URL(page.url()).searchParams.get("next")).toBe(invite);
      expect(await page.getByLabel("メールアドレス").inputValue()).toBe(
        "member@example.test",
      );
      expect(await page.getByLabel("パスワード").inputValue()).toBe(
        "incorrect",
      );
      await capture(page, "after-error");
      await page.setViewportSize({ width: 375, height: 420 });
      await page.locator("main").evaluate((element) => {
        element.scrollTop = 0;
      });
      expect(
        (await page.getByRole("heading", { name: "Idea Boost" }).boundingBox())
          ?.y,
      ).toBeGreaterThanOrEqual(0);
      await capture(page, "after-short-top");
      await page.getByLabel("パスワード").fill("password");
      await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .scrollIntoViewIfNeeded();
      await capture(page, "after-short-bottom");
      await page.setViewportSize({ width: 1280, height: 800 });
      await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .click();
      await page.waitForURL(`${app}${invite}`);
      await page.getByRole("alertdialog").waitFor();
      await capture(page, "after-invite-confirm");
      await page.getByRole("button", { name: "参加する", exact: true }).click();
      await page.waitForURL(new RegExp(`/rooms/${active.roomId}/start`));
      await capture(page, "after-invite-joined");
      results.retryReturnedToSameInvite = true;
      await page.goto(`${app}/login?next=${encodeURIComponent(invite)}`);
      await page.waitForURL(`${app}${invite}`);
      results.authenticatedRevisit = true;
      await page.goto(`${app}/home`);
      await page.getByRole("button", { name: "ログアウト" }).click();
      await page.waitForURL(`${app}/login`);
      await page.goto(`${app}/home`);
      await page.waitForURL(`${app}/login`);
      const nextApi = await page.request.get(`${app}/api/shared-outcomes`);
      const workerApi = await page.request.get(
        `${api}/api/rooms/${active.roomId}`,
      );
      expect(nextApi.status()).toBe(401);
      expect(workerApi.status()).toBe(401);
      results.afterLogout = {
        protectedUrl: page.url(),
        nextApi: nextApi.status(),
        workerApi: workerApi.status(),
      };
      await capture(page, "after-logout");
      await member.close();

      for (const next of [
        "https://evil.example/phish",
        "//evil.example/phish",
      ]) {
        const context = await browser.newContext();
        const isolated = await context.newPage();
        await isolated.goto(`${app}/login?next=${encodeURIComponent(next)}`);
        await login(isolated, "viewer@example.test");
        await isolated.waitForURL(`${app}/home`);
        expect(new URL(isolated.url()).origin).toBe(app);
        results[next] = isolated.url();
        await context.close();
      }
      await owner.goto(`${app}/login?next=%2Fshared-outcomes`);
      await owner.waitForURL(`${app}/shared-outcomes`);
      await capture(owner, "after-outcome-entry");
      results.outcomeRevisit = owner.url();
      await writeFile(
        join(evidence, "actual-results.json"),
        `${JSON.stringify(results, null, 2)}\n`,
      );
    } finally {
      await browser.close();
    }
  }, 90_000);
});
