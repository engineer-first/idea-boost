---
name: pbi-demogoal
description: Create one PBI and its consolidated DemoGoal issue for engineer-first/idea-boost, with automatic PBI numbering and initial Project status. Do not use for Task, Bug, or Spike issue creation.
---

# PBI DemoGoal

Use this skill to create one PBI issue and one consolidated DemoGoal issue for `engineer-first/idea-boost`.

Use [Issue management](../../../docs/issue-management.md) as the source of truth for Issue Types, Project status, and PR links.

Do not use this skill for Task, Bug, or Spike issues. Create those through GitHub Issue Forms; Project auto-add places new open issues in `未整理`.

## Workflow

1. Inspect existing issues and PBI context. Do not choose an ID manually; the script derives the PBI ID from the newly created PBI issue number.
2. Turn the user's request into one JSON spec.
3. Run `create_planning_issues.py --dry-run <spec.json>` and review the rendered issue titles and bodies.
4. Run `create_planning_issues.py <spec.json>` to create the issues.
5. Verify both created issues have:
   - Issue Type: `PBI` or `DemoGoal`
   - Project: `idea-flow-app` (#3)
   - Status: `未整理` for both
6. Report the created issue URLs and the Project field verification.

## Writing the user story (`pbi.story`)

Template: `As a {role}, I want to {desire}. Because {reason}.` (the "Because" clause may be folded into one sentence, but the reason must always read as the user's own motivation)

- The subject must always be a user-facing role (host, participant, viewer, admin, team). Never use a developer/system subject like "the system will...".
- For a PBI that isn't scoped to one individual role (e.g. production deployment, where the whole team benefits), "team" is an acceptable subject.
- End the reason with the value the user personally gets, never an implementation rationale (e.g. not "for performance").
- Reference examples (from a different product, showing the pattern generalizes across role/action/reason — not domain-specific):
  - As a viewer, I want to read the full content of a posted article, because I want to check whether it has the information I'm looking for.
  - As a questioner, I want to ask something I don't understand somewhere many people will see it, because I want answers from as many people as possible.
  - As an admin, I want to force users (students, teachers) to change their password, because I want to raise security.
- Story points are out of scope for this skill; do not add them to the `pbi` object.

## Writing demo goals (`demo_goals[].goal`)

Template: `When {screen or action}, {user-observable result}.`

- The subject must be something the user actually touches on screen. Never write implementation terms (API, state, DB, WebSocket, reducer). Re-read what you wrote and check that no dev context leaked in.
- One entry = one independently verifiable fact. Don't bundle multiple checks into one goal (split into another `demo_goals` entry, or move extra angles into `checks`).
- The result must be provable purely through UI operation — write what the user can see on screen, not that the backend behaved correctly internally.
- Worked example (grounded in Idea Boost's user value; verify exact behavior and screen names against the current PRD/Wiki before use):

  > As a participant, I want to organize and compare ideas from my team, because I want us to choose what to develop next.

  Demo goals:

  - Adding an idea on the brainstorming screen displays it as a card in the list.
  - Moving an idea into a group displays the card in that group.

  Maps onto the spec as one `demo_goals` entry per bullet:

  ```json
  "demo_goals": [
    {
      "title": "Added idea appears as a card",
      "goal": "Adding an idea on the brainstorming screen displays it as a card in the list."
    },
    {
      "title": "Grouped idea appears in its group",
      "goal": "Moving an idea into a group displays the card in that group."
    }
  ]
  ```

## Spec Format

Create a temporary JSON file outside the skill folder, for example under `/tmp`.

```json
{
  "repo": "engineer-first/idea-boost",
  "project_owner": "engineer-first",
  "project_number": 3,
  "milestone": "Sprint 2",
  "demo_overview": "チームで出したアイデアを整理して、次に進める案を選べる状態をデモする。",
  "pbi": {
    "title": "チームのアイデアを整理する",
    "story": "利用者として、チームで出したアイデアを整理して比較したい。次に進める案を選びたいからだ。",
    "acceptance": [
      "アイデアを整理して比較できる",
      "チームで次に進める案を選べる"
    ],
    "memo": []
  },
  "demo_goals": [
    {
      "title": "追加したアイデアがカードで表示される",
      "goal": "アイデア出し画面でアイデアを追加すると、そのアイデアがカードとして一覧に表示される。",
      "checks": ["追加したアイデアの内容がカードに表示される"]
    }
  ],
  "not_doing": ["CI環境の統一はスコープ外"]
}
```

Notes:

- Omit `milestone` only when the user explicitly wants no sprint milestone.
- Put only the human-readable title in `pbi.title`; the script derives `PBI-XX` from the created PBI issue number (issue #340 becomes `PBI-340`). Add `pbi.id` only to preserve an explicitly requested existing number.
- The demo issue title is derived from the PBI: `DEMO-<PBI番号> <PBIタイトル>`.
- Put each reviewable outcome inside `demo_goals`; the script renders all of them into one DemoGoal issue.
- Use `memo` for implementation-task candidates, unresolved notes, or whiteboard context.
- Omit `demo_overview` to fall back to the default sentence (`<PBIタイトル> として、以下の状態をスプリントレビューでデモする。`); set it only when the demo needs different framing.
- Use `not_doing` for items explicitly out of scope; it renders as a `## やらないこと` section after all demo goals.
- Use `risks` inside a `demo_goals` entry for goal-specific caveats; it renders as a `リスク:` list under that goal only.

## Script

The script lives outside this skill folder because the Claude Code equivalent (`.claude/skills/pbi-demogoal/`) shares the same implementation. Dry run makes no network requests and shows `PBI-00` / `DEMO-00` as placeholders until creation. If renaming fails after creation, use the issue URL in the error to recover; do not rerun the entire script and create duplicates. Run from the repository root:

```bash
python3 .agents/skills/pbi-demogoal/scripts/create_planning_issues.py --dry-run /tmp/idea-flow-spec.json
python3 .agents/skills/pbi-demogoal/scripts/create_planning_issues.py /tmp/idea-flow-spec.json
```

The script uses Issue Type instead of labels. Ensure `gh auth status` has `repo` and `project` scopes.
