import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import {
  checkIssueWriting,
  readWritingContract,
  reportIssueWriting,
} from "./validate-issue-writing.js";

const contract = () =>
  readWritingContract(readFileSync("docs/team/issue-writing.md", "utf8"));
const task = {
  number: 1,
  title: "付箋の入力先を移す",
  type: { name: "Task" },
  body: "## Why\n入力の流れが止まる。\n## How\n既存処理を使う。\n## 作業完了条件\n- 追加後すぐ入力できる。",
};
const pbi = {
  ...task,
  type: { name: "PBI" },
  body: "参加者として、案を続けて書きたい。なぜなら、思いついた案を残したいからだ。\n## Why\n入力先を探している。\n## 期待する振る舞い\n- 追加後すぐ書ける。",
};

describe("入口共通のIssue形式検査", () => {
  it("Whyだけで起票でき、任意欄・定型文・箇条書きを要求しない", () => {
    for (const type of ["PBI", "Task"]) {
      for (const body of [
        "## Why\n付箋を追加するたび入力先を探し、考える流れが止まる。",
        "### Why\n入力の流れが止まる。\n### How\n_No response_\n### 作業完了条件\n_No response_",
      ]) {
        expect(
          checkIssueWriting(
            { ...task, type: { name: type }, body },
            contract(),
          ),
        ).toEqual([]);
      }
    }
  });
  it("PBIの体験見出しとGUIを揃え、任意の補足として受け付ける", () => {
    const form = parse(
      readFileSync(".github/ISSUE_TEMPLATE/01-pbi.yml", "utf8"),
    );
    const experience = form.body.find(
      (field: { id: string }) => field.id === "acceptance",
    );
    expect(experience.attributes.label).toBe("ユーザーに提供する体験");
    expect(experience.validations.required).toBe(false);
    expect(
      checkIssueWriting(
        {
          ...pbi,
          body: pbi.body.replace("期待する振る舞い", "ユーザーに提供する体験"),
        },
        contract(),
      ),
    ).toEqual([]);
  });
  it("PBIとTaskの標準本文を受け付ける", () => {
    expect(checkIssueWriting(pbi, contract())).toEqual([]);
    expect(checkIssueWriting(task, contract())).toEqual([]);
  });
  it("GUIの見出しレベルと任意の冒頭見出しをそのまま扱う", () => {
    expect(
      checkIssueWriting(
        { ...task, body: task.body.replaceAll("## ", "### ") },
        contract(),
      ),
    ).toEqual([]);
    expect(
      checkIssueWriting(
        { ...pbi, body: `### ユーザーストーリー\n${pbi.body}` },
        contract(),
      ),
    ).toEqual([]);
  });
  it("Whyの空欄・重複を見逃さず、コード例やコメントで条件を満たさない", () => {
    for (const body of [
      "",
      "## Why\n_No response_\n## How\n-\n## 作業完了条件\n<!-- 条件 -->",
      `\`\`\`markdown\n${task.body}\n\`\`\``,
      task.body.replace("## How", "## Why"),
    ]) {
      expect(
        checkIssueWriting({ ...task, body }, contract()).length,
      ).toBeGreaterThan(0);
    }
  });
  it("Type未設定を案内し、Bug・SpikeをTaskとして検査しない", () => {
    expect(
      checkIssueWriting({ ...task, type: null }, contract()).join(),
    ).toContain("Type");
    expect(
      checkIssueWriting(
        { ...task, type: { name: "Bug" }, body: "" },
        contract(),
      ),
    ).toEqual([]);
  });
  it("正本のコピー用本文とPBIスクリプトの出力も同じ検査を通る", () => {
    const guide = readFileSync("docs/team/issue-writing.md", "utf8");
    const examples = [...guide.matchAll(/```markdown\n([\s\S]*?)```/g)];
    expect(
      checkIssueWriting({ ...pbi, body: examples[0][1] }, contract()),
    ).toEqual([]);
    expect(
      checkIssueWriting({ ...task, body: examples[1][1] }, contract()),
    ).toEqual([]);
    const body = execFileSync(
      "python3",
      [
        "-c",
        'import sys; sys.path.insert(0, ".agents/skills/pbi/scripts"); import create_planning_issues as p; print(p.pbi_body({"pbi": {"story": "参加者として、案を比較したい。なぜなら、結論を選びたいからだ。", "why": "比較する情報が散らばっている。", "acceptance": ["案を比較できる"]}}))',
      ],
      { encoding: "utf8" },
    );
    expect(checkIssueWriting({ ...pbi, body }, contract())).toEqual([]);
  });
  it("workflowは入口共通イベントと手動実行を備え、信頼するコードだけを使う", () => {
    const workflow = parse(
      readFileSync(".github/workflows/issue-writing.yml", "utf8"),
    );
    expect(workflow.on.issues.types).toEqual([
      "opened",
      "edited",
      "reopened",
      "typed",
      "untyped",
    ]);
    expect(workflow.on.workflow_dispatch.inputs.issue_number.required).toBe(
      true,
    );
    expect(workflow.permissions).toEqual({ contents: "read", issues: "write" });
    const steps = workflow.jobs.validate.steps;
    expect(steps[0].with.ref).toMatch(
      /^\$\{\{ github\.event\.repository\.default_branch \}\}$/,
    );
    expect(steps[0].with["persist-credentials"]).toBe(false);
    expect(steps[1].with.script).not.toContain("${{");
  });
  it("フォームとスクリプトの見出しが正本からずれない", () => {
    for (const [file, type] of [
      ["01-pbi.yml", "PBI"],
      ["02-task.yml", "Task"],
    ]) {
      const form = parse(
        readFileSync(`.github/ISSUE_TEMPLATE/${file}`, "utf8"),
      );
      const requiredLabels = form.body
        .filter(
          (x: { type: string; validations?: { required: boolean } }) =>
            x.type === "textarea" && x.validations?.required,
        )
        .map((x: { attributes: { label: string } }) => x.attributes.label);
      expect(form.type).toBe(type);
      expect(requiredLabels).toEqual(contract().types[type].sections);
    }
  });
});

function fixture(issue = task, comments: object[] = []) {
  const issues = {
    get: vi.fn().mockResolvedValue({ data: issue }),
    listComments: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
  };
  const github = {
    rest: { issues },
    paginate: vi.fn().mockResolvedValue(comments),
  };
  const context = {
    repo: { owner: "engineer-first", repo: "idea-boost" },
    payload: { issue: { number: 1 } },
  };
  return { github, context, issues };
}

describe("作成後の案内", () => {
  it("不足だけを1件案内し、同じ内容を再投稿しない", async () => {
    const f = fixture({ ...task, body: "" });
    await reportIssueWriting({ ...f, contract: contract() });
    expect(f.issues.createComment).toHaveBeenCalledOnce();
    const body = f.issues.createComment.mock.calls[0][0].body;
    const again = fixture({ ...task, body: "" }, [
      { id: 10, body, user: { type: "Bot", login: "github-actions[bot]" } },
    ]);
    await reportIssueWriting({ ...again, contract: contract() });
    expect(again.issues.createComment).not.toHaveBeenCalled();
    expect(again.issues.updateComment).not.toHaveBeenCalled();
  });
  it("修正後は既存の案内を解消済みにし、人のコメントを編集しない", async () => {
    const f = fixture(task, [
      {
        id: 8,
        body: "<!-- issue-writing:v1 -->",
        user: { type: "User", login: "alice" },
      },
      {
        id: 9,
        body: "<!-- issue-writing:v1 -->",
        user: { type: "Bot", login: "github-actions[bot]" },
      },
    ]);
    await reportIssueWriting({ ...f, contract: contract() });
    expect(f.issues.updateComment.mock.calls[0][0]).toMatchObject({
      comment_id: 9,
    });
    expect(f.issues.updateComment.mock.calls[0][0].body).toContain(
      "形式上の不足はありません",
    );
    expect(f.issues.createComment).not.toHaveBeenCalled();
  });
  it("Type変更で古い指摘を解消し、手動で指定した番号を検査できる", async () => {
    const f = fixture({ ...task, type: { name: "Spike" }, body: "" }, [
      {
        id: 9,
        body: "<!-- issue-writing:v1 -->",
        user: { type: "Bot", login: "github-actions[bot]" },
      },
    ]);
    await reportIssueWriting({ ...f, contract: contract(), issueNumber: "25" });
    expect(f.issues.get.mock.calls[0][0].issue_number).toBe(25);
    expect(f.issues.updateComment.mock.calls[0][0].body).toContain(
      "形式上の不足はありません",
    );
  });
  it("検査中の編集・PR混入・API失敗を誤って正常扱いしない", async () => {
    const f = fixture({ ...task, body: "" });
    f.issues.get
      .mockResolvedValueOnce({ data: { ...task, body: "" } })
      .mockResolvedValueOnce({ data: task });
    await reportIssueWriting({ ...f, contract: contract() });
    expect(f.issues.createComment).not.toHaveBeenCalled();
    const pr = fixture({ ...task, pull_request: {} } as typeof task);
    await reportIssueWriting({ ...pr, contract: contract() });
    expect(pr.github.paginate).not.toHaveBeenCalled();
    const fail = fixture();
    fail.issues.get.mockRejectedValue(new Error("API failed"));
    await expect(
      reportIssueWriting({ ...fail, contract: contract() }),
    ).rejects.toThrow("API failed");
  });
});
