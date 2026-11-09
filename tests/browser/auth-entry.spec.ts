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
    const google = page.getByRole("button", { name: "Googleではじめる" });
    await google.waitFor();
    expect(await google.isDisabled()).toBe(true);
    expect(
      await page.getByRole("button", { name: "ゲストではじめる" }).isDisabled(),
    ).toBe(true);
    await capture(page, "story-not-configured");
  } finally {
    await browser.close();
  }
});

test("ログイン方法をキーボードで選ぶと見出しから名前入力へ進み、戻るとゲスト開始にフォーカスが戻る", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(
      `${storybook}/iframe.html?id=auth-logincard--default&viewMode=story`,
    );
    const guest = page.getByRole("button", {
      name: "ゲストではじめる",
      exact: true,
    });
    await guest.focus();
    await page.keyboard.press("Enter");
    const heading = page.getByRole("heading", {
      level: 2,
      name: "ゲストではじめる",
    });
    await expect
      .poll(() =>
        heading.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.keyboard.press("Tab");
    const name = page.getByRole("textbox", { name: "仲間に表示される名前" });
    await expect
      .poll(() =>
        name.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
    await page.getByRole("button", { name: "戻る", exact: true }).click();
    await expect
      .poll(() =>
        guest.evaluate((element) => element === document.activeElement),
      )
      .toBe(true);
  } finally {
    await browser.close();
  }
});

// CIのStorybook検証と実Worker/Next検証を区別し、後者は専用dev:verifyのURL指定時だけ実行する。
// dev:verifyへの準備操作は新しい検証ルームだけを作り、通常DBや既存ルームを変更しない。
describe.skipIf(!app || !api)("専用dev:verifyの実認証経路", () => {
  test("招待URLから選択画面へ進み、ゲストはそこで名前を入力して参加でき、アカウント利用者はログインして同じ招待へ戻れる", async () => {
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

      const guest = await browser.newContext();
      const guestPage = await guest.newPage();
      await guestPage.goto(`${app}${invite}`);
      const loginUrl = `${app}/login?next=${encodeURIComponent(invite)}`;
      await guestPage.waitForURL(loginUrl);
      expect(await guestPage.locator("html").getAttribute("lang")).toBe("ja");
      const googleChoice = guestPage.getByRole("button", {
        name: "Googleではじめる",
        exact: true,
      });
      const guestChoice = guestPage.getByRole("button", {
        name: "ゲストではじめる",
        exact: true,
      });
      await googleChoice.waitFor();
      await guestChoice.waitFor();
      expect(await googleChoice.count()).toBe(1);
      expect(await guestChoice.count()).toBe(1);
      expect(await googleChoice.isVisible()).toBe(true);
      expect(await guestChoice.isVisible()).toBe(true);
      await capture(guestPage, "guest-invite-choice");
      await guestChoice.click();
      const guestName = guestPage.getByRole("textbox", {
        name: "仲間に表示される名前",
      });
      await guestName.waitFor();
      await guestName.fill("   ");
      await guestPage
        .getByRole("button", { name: "この名前ではじめる", exact: true })
        .click();
      await guestPage
        .getByRole("alert")
        .filter({ hasText: "表示名を入力してください。" })
        .waitFor();
      expect(await guestName.inputValue()).toBe("   ");
      expect(guestPage.url()).toBe(loginUrl);
      await capture(guestPage, "guest-invite-name-error");
      await guestName.fill("招待ゲスト");
      await guestPage
        .getByRole("button", { name: "この名前ではじめる", exact: true })
        .click();
      await guestPage.waitForURL(`${app}${invite}`);
      const guestConfirmation = guestPage.getByRole("alertdialog");
      await guestConfirmation.waitFor();
      await capture(guestPage, "guest-invite-confirm");
      await guestConfirmation
        .getByRole("button", { name: "参加する", exact: true })
        .click();
      await guestPage.waitForURL(
        (url) => url.pathname === `/rooms/${active.roomId}/start`,
      );
      await capture(guestPage, "guest-invite-joined");
      results.guestJoined = guestPage.url();
      await guest.close();

      const landing = await browser.newContext();
      const landingPage = await landing.newPage();
      await landingPage.goto(`${app}/about?next=${encodeURIComponent(invite)}`);
      const inviteLinks = landingPage.getByRole("link", {
        name: "招待の参加確認へ進む",
        exact: true,
      });
      await inviteLinks.first().waitFor();
      expect(await inviteLinks.count()).toBeGreaterThan(0);
      for (const link of await inviteLinks.all()) {
        expect(await link.getAttribute("href")).toBe(invite);
      }
      expect(
        await landingPage
          .locator("header")
          .getByRole("link", { name: "ログイン", exact: true })
          .getAttribute("href"),
      ).toBe(`/login?next=${encodeURIComponent(invite)}`);
      await capture(landingPage, "guest-invite-landing");
      await landing.close();

      const member = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await member.newPage();
      await page.goto(`${app}/login?next=${encodeURIComponent(invite)}`);
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
      const heading = page.getByRole("heading", { name: "Idea Boost" });
      await heading.scrollIntoViewIfNeeded();
      const headingBox = await heading.boundingBox();
      expect(headingBox?.y).toBeGreaterThanOrEqual(0);
      expect(
        (headingBox?.y ?? 420) + (headingBox?.height ?? 0),
      ).toBeLessThanOrEqual(420);
      await capture(page, "after-short-top");
      await page.getByLabel("パスワード").fill("password");
      await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .scrollIntoViewIfNeeded();
      const submitBox = await page
        .getByRole("button", { name: "開発用ユーザーでログイン" })
        .boundingBox();
      expect(submitBox?.y).toBeGreaterThanOrEqual(0);
      expect(
        (submitBox?.y ?? 420) + (submitBox?.height ?? 0),
      ).toBeLessThanOrEqual(420);
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
      await page.getByRole("button", { name: "ユーザーメニュー" }).click();
      await page.getByRole("button", { name: "ログアウト" }).click();
      await page.waitForURL(`${app}/login`);
      // 本人のいない /home は始め方の選択画面へ送る（#886）。
      await page.goto(`${app}/home`);
      await page.waitForURL(`${app}/login?next=%2Fhome`);
      await page
        .getByRole("button", { name: "ゲストではじめる", exact: true })
        .waitFor();
      expect(
        await page.getByRole("button", { name: "前のルームに戻る" }).count(),
      ).toBe(0);
      expect(
        await page.getByRole("button", { name: "ログアウト" }).count(),
      ).toBe(0);
      expect(
        await page.getByRole("button", { name: "ユーザーメニュー" }).count(),
      ).toBe(0);
      expect(
        await page.getByText("member@example.test", { exact: true }).count(),
      ).toBe(0);
      const nextApi = await page.request.get(`${app}/api/shared-outcomes`);
      const workerApi = await page.request.get(
        `${api}/api/rooms/${active.roomId}`,
      );
      expect(nextApi.status()).toBe(401);
      expect(workerApi.status()).toBe(401);
      results.afterLogout = {
        homeUrl: page.url(),
        loginChoiceVisible: true,
        previousIdentityVisible: false,
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

  test("LPの開始ボタンから選択画面でゲストを選び、名前を入れてホームでルームを作成し、招待コードを共有できる", async () => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${app}/`);
      await page
        .getByRole("link", { name: "無料で始める", exact: true })
        .first()
        .click();
      await page.waitForURL(`${app}/login?next=%2Fhome`);
      await capture(page, "guest-login-choice");
      await page
        .getByRole("button", { name: "ゲストではじめる", exact: true })
        .click();
      const guestName = page.getByRole("textbox", {
        name: "仲間に表示される名前",
      });
      await guestName.waitFor();
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === "idea_boost_session",
        ),
      ).toBe(false);
      await capture(page, "guest-login-name");
      await guestName.fill("作成ゲスト");
      await page
        .getByRole("button", { name: "この名前ではじめる", exact: true })
        .click();
      await page.waitForURL(`${app}/home`);
      const createCard = page.getByTestId("home-create-room");
      const roomName = createCard.getByRole("textbox", {
        name: "ルーム名（任意）",
      });
      await roomName.waitFor();
      await roomName.fill("ゲストのルーム作成検査");
      await capture(page, "guest-home-room-name");
      await createCard
        .getByRole("button", { name: "新しいルームを作成", exact: true })
        .click();
      await page.waitForURL((url) =>
        /^\/rooms\/[^/]+\/start$/.test(url.pathname),
      );
      const lobby = page.getByTestId("room-lobby-view");
      await lobby.getByText("招待コード", { exact: true }).waitFor();
      const inviteCode = lobby.getByText(/^[A-Z0-9]{6}$/);
      await inviteCode.waitFor();
      expect(await inviteCode.textContent()).toMatch(/^[A-Z0-9]{6}$/);
      await lobby
        .getByRole("button", { name: "招待コードをコピー", exact: true })
        .waitFor();
      await capture(page, "guest-created-lobby-invite");
    } finally {
      await browser.close();
    }
  }, 90_000);
});
