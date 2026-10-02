import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HMW_TEMPLATES } from "../logic/hmw-content";
import { HmwTemplatePanel } from "./hmw-template-panel";

describe("HmwTemplatePanel", () => {
  it("テンプレート5種を表示する", () => {
    render(<HmwTemplatePanel onTemplateSelect={vi.fn()} />);

    for (const template of HMW_TEMPLATES) {
      expect(screen.getByText(template)).toBeInTheDocument();
    }
  });

  it("テンプレートを選ぶと文言つきで onTemplateSelect が呼ばれる", async () => {
    const onTemplateSelect = vi.fn();
    render(<HmwTemplatePanel onTemplateSelect={onTemplateSelect} />);

    await userEvent.click(
      screen.getByRole("button", { name: HMW_TEMPLATES[0] }),
    );
    expect(onTemplateSelect).toHaveBeenCalledWith(HMW_TEMPLATES[0]);
  });

  it("disabled のときはテンプレートボタンが全て無効になる", () => {
    render(<HmwTemplatePanel onTemplateSelect={vi.fn()} disabled />);

    for (const template of HMW_TEMPLATES) {
      expect(screen.getByRole("button", { name: template })).toBeDisabled();
    }
  });
});
