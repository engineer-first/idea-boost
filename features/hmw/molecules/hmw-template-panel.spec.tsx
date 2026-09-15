import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HMW_EXAMPLES, HMW_HEADING, HMW_TEMPLATES } from "../logic/hmw-content";
import { HmwTemplatePanel } from "./hmw-template-panel";

describe("HmwTemplatePanel", () => {
  it("見出し・テンプレート5種・具体例3種を表示する", () => {
    render(<HmwTemplatePanel onTemplateSelect={vi.fn()} />);

    expect(screen.getByText(HMW_HEADING)).toBeInTheDocument();
    for (const template of HMW_TEMPLATES) {
      expect(screen.getByText(template)).toBeInTheDocument();
    }
    for (const example of HMW_EXAMPLES) {
      expect(screen.getByText(example)).toBeInTheDocument();
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

  it("具体例はボタンロールを持たず、クリックしても onTemplateSelect を呼ばない", async () => {
    const onTemplateSelect = vi.fn();
    render(<HmwTemplatePanel onTemplateSelect={onTemplateSelect} />);

    for (const example of HMW_EXAMPLES) {
      expect(
        screen.queryByRole("button", { name: example }),
      ).not.toBeInTheDocument();
    }

    await userEvent.click(screen.getByText(HMW_EXAMPLES[0]));
    expect(onTemplateSelect).not.toHaveBeenCalled();
  });

  it("disabled のときはテンプレートボタンが全て無効になる", () => {
    render(<HmwTemplatePanel onTemplateSelect={vi.fn()} disabled />);

    for (const template of HMW_TEMPLATES) {
      expect(screen.getByRole("button", { name: template })).toBeDisabled();
    }
  });
});
