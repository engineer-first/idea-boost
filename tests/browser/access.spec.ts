import { chromium } from "playwright";
import { expect, it } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";

it.each([390, 1280])(
  "閲覧者管理の入力・削除操作が%ipxで画面内に収まる",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(
        `${origin}/iframe.html?id=access-accessview--default&viewMode=story`,
      );
      const input = page.getByRole("textbox", { name: "メールアドレス" });
      await input.waitFor();
      for (const element of [
        input,
        page.getByRole("button", {
          name: "owner@example.test の閲覧権限を取り消す",
        }),
      ]) {
        const bounds = await element.boundingBox();
        if (!bounds) throw new Error("管理操作が表示されていません。");
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
      await input.click();
      expect(
        await input.evaluate((element) => element === document.activeElement),
      ).toBe(true);
    } finally {
      await browser.close();
    }
  },
);

it("キーボードで入力・追加へ移動でき、不正メールとpendingで送信を止める", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 800 },
    });
    await page.goto(
      `${origin}/iframe.html?id=access-accessview--default&viewMode=story`,
    );
    const remove = page.getByRole("button", {
      name: "owner@example.test の閲覧権限を取り消す",
    });
    await remove.waitFor();
    await page.keyboard.press("Tab");
    expect(
      await remove.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    const style = await remove.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        outline: computed.outlineStyle,
        width: computed.outlineWidth,
        height: element.getBoundingClientRect().height,
      };
    });
    expect(style.outline).toBe("solid");
    expect(Number.parseFloat(style.width)).toBeGreaterThanOrEqual(2);
    expect(style.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Tab");
    const input = page.getByRole("textbox", { name: "メールアドレス" });
    expect(
      await input.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await input.fill("invalid-email");
    expect(
      await input.evaluate((element) =>
        (element as HTMLInputElement).checkValidity(),
      ),
    ).toBe(false);
    await input.fill("member@example.test");
    // Storybookのargs反映で追加が有効になってからTab移動する。
    await expect
      .poll(() =>
        page.getByRole("button", { name: "追加", exact: true }).isEnabled(),
      )
      .toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByRole("button", { name: "追加", exact: true })
        .evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await page.goto(
      `${origin}/iframe.html?id=access-accessview--pending&viewMode=story`,
    );
    await page.getByRole("status").waitFor();
    expect(await page.getByRole("textbox").isDisabled()).toBe(true);
    for (const button of await page.getByRole("button").all())
      expect(await button.isDisabled()).toBe(true);
  } finally {
    await browser.close();
  }
});

it("実containerで一覧失敗を空と混同せず、追加・取消の通信拒否を同じ対象へ再試行する", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 800 },
    });
    const reader = {
      id: "reader",
      name: "Reader",
      email: "reader@example.test",
    };
    let users: (typeof reader)[] = [];
    let listCalls = 0;
    const attempts = { POST: 0, DELETE: 0 };
    await page.route("**/api/admin/access", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        listCalls += 1;
        await route.fulfill({
          status: listCalls === 1 ? 503 : 200,
          json: listCalls === 1 ? { error: "unavailable" } : { users },
        });
      } else if (method === "POST" || method === "DELETE") {
        attempts[method] += 1;
        expect(route.request().postDataJSON()).toEqual({ email: reader.email });
        if (attempts[method] === 1) await route.abort("connectionrefused");
        else {
          users = method === "POST" ? [reader] : [];
          await route.fulfill({ json: { ok: true } });
        }
      }
    });
    await page.goto(
      `${origin}/iframe.html?id=access-accessconsole--default&viewMode=story`,
    );
    await page.getByRole("alert").waitFor();
    expect(await page.getByText("閲覧者はいません。").count()).toBe(0);
    await page.getByRole("button", { name: "再試行" }).click();
    await page.getByText("閲覧者はいません。").waitFor();
    await page
      .getByRole("textbox", { name: "メールアドレス" })
      .fill(reader.email);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "再試行" }).click();
    await page.getByText("Reader", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: `${reader.email} の閲覧権限を取り消す` })
      .click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "再試行" }).click();
    await page.getByText("閲覧者はいません。").waitFor();
    expect(attempts).toEqual({ POST: 2, DELETE: 2 });
  } finally {
    await browser.close();
  }
});

it.each([401, 403])(
  "成功一覧の次GETが%iなら操作を隠し、拒否後の再試行はGETだけを送る",
  async (status) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      let reads = 0;
      let writes = 0;
      await page.route("**/api/admin/access", async (route) => {
        if (route.request().method() === "GET") {
          reads += 1;
          await route.fulfill({
            status: reads === 1 ? 200 : status,
            json:
              reads === 1
                ? {
                    users: [
                      {
                        id: "reader",
                        name: "Reader",
                        email: "reader@example.test",
                      },
                    ],
                  }
                : { error: "denied" },
          });
        } else {
          writes += 1;
          await route.fulfill({ json: { ok: true } });
        }
      });
      await page.goto(
        `${origin}/iframe.html?id=access-accessconsole--default&viewMode=story`,
      );
      await page.getByText("Reader", { exact: true }).waitFor();
      await page
        .getByRole("textbox", { name: "メールアドレス" })
        .fill("next@example.test");
      await page.getByRole("button", { name: "追加", exact: true }).click();
      await page.getByRole("alert").waitFor();
      expect(await page.getByText("Reader", { exact: true }).count()).toBe(0);
      expect(await page.getByRole("textbox").count()).toBe(0);
      expect(
        await page.getByRole("button", { name: /閲覧権限を取り消す/ }).count(),
      ).toBe(0);
      if (status === 401)
        expect(
          await page
            .getByRole("link", { name: "ログインする" })
            .getAttribute("href"),
        ).toBe("/login?next=%2Fadmin%2Faccess");
      const retryResponse = page.waitForResponse((response) =>
        response.url().endsWith("/api/admin/access"),
      );
      await page.getByRole("button", { name: "再試行" }).click();
      expect((await retryResponse).status()).toBe(status);
      expect(reads).toBe(3);
      expect(writes).toBe(1);
    } finally {
      await browser.close();
    }
  },
);

it.each([390, 1280])(
  "成果と意見の付与・取消を%ipxで別々に操作できる",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const reader = {
        id: "reader",
        name: "Reader",
        email: "reader@example.test",
      };
      const users = { shared: [reader], feedback: [] as (typeof reader)[] };
      const writes: string[] = [];
      await page.route("**/api/admin/access**", async (route) => {
        const url = new URL(route.request().url());
        const permission = url.searchParams.get("permission");
        const key = permission === "feedback:read" ? "feedback" : "shared";
        const method = route.request().method();
        if (method !== "GET") {
          expect(route.request().postDataJSON()).toEqual({
            email: reader.email,
          });
          writes.push(`${method}:${key}`);
          users[key] = method === "POST" ? [reader] : [];
        }
        await route.fulfill({
          json: method === "GET" ? { users: users[key] } : { ok: true },
        });
      });
      await page.goto(
        `${origin}/iframe.html?id=access-accessmanagement--default&viewMode=story`,
      );
      const shared = page.getByRole("region", {
        name: "成果閲覧権限",
        exact: true,
      });
      const feedback = page.getByRole("region", {
        name: "意見閲覧権限",
        exact: true,
      });
      await shared.getByText(reader.email, { exact: true }).waitFor();
      await feedback.getByText("閲覧者はいません。").waitFor();
      const input = feedback.getByRole("textbox", { name: "メールアドレス" });
      await input.fill(reader.email);
      await feedback.getByRole("button", { name: "追加", exact: true }).click();
      await feedback.getByText(reader.email, { exact: true }).waitFor();
      expect(
        await shared.getByText(reader.email, { exact: true }).count(),
      ).toBe(1);
      const remove = feedback.getByRole("button", {
        name: `${reader.email} の閲覧権限を取り消す`,
      });
      await remove.click();
      await feedback.getByText("閲覧者はいません。").waitFor();
      expect(
        await shared.getByText(reader.email, { exact: true }).count(),
      ).toBe(1);
      expect(writes).toEqual(["POST:feedback", "DELETE:feedback"]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    } finally {
      await browser.close();
    }
  },
);
