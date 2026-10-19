// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));

import { saveDisplayName } from "./display-name-actions";

const input = {
  expectedPrincipal: "11111111-1111-4111-8111-111111111111",
  name: "はな",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.currentUser.mockResolvedValue({ sub: input.expectedPrincipal });
});
describe("表示名の保存結果", () => {
  it.each([200, 502])(
    "非JSON応答（%s）は成功として扱わず再保存を案内する",
    async (status) => {
      mocks.apiFetch.mockResolvedValue(
        new Response("<html>proxy</html>", { status }),
      );
      await expect(saveDisplayName(input)).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining("もう一度保存"),
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
  it("通信が失敗しても結果不明として再保存を案内する", async () => {
    mocks.apiFetch.mockRejectedValue(new Error("ネットワーク障害"));
    await expect(saveDisplayName(input)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("もう一度保存"),
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("APIが返した部分成功の案内をそのまま伝える", async () => {
    const error = "表示名は保存しましたが、このルームに反映できませんでした。";
    mocks.apiFetch.mockResolvedValue(Response.json({ error }, { status: 503 }));
    await expect(saveDisplayName(input)).resolves.toEqual({ ok: false, error });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("検証済みの保存成功でだけ表示を更新する", async () => {
    mocks.apiFetch.mockResolvedValue(Response.json({ name: input.name }));
    await expect(saveDisplayName(input)).resolves.toEqual({
      ok: true,
      name: input.name,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
