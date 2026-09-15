---
name: pbi-demogoal
description: Create idea-flow-app PBI and consolidated DemoGoal GitHub Issues only. Use when Codex needs to add one product backlog item and one PBI-linked demo goal issue to engineer-first/idea-flow-app and place them in the GitHub Project with the correct Issue Type, milestone, and Status board column. Do not use for sprint task or bug issue creation.
---

# PBI DemoGoal

Use this skill to create one PBI issue and one consolidated DemoGoal issue for `engineer-first/idea-boost`.

Do not use this skill for sprint task or bug issues. Sprint tasks and bugs are usually created through the GitHub GUI from their issue templates; the Project auto-add workflow imports `Task` and `Bug` issue types and the default workflow places them in `Todo`.

## Workflow

1. Inspect the current repository and existing issues before choosing IDs.
   - Use `gh issue list --state all --json number,title,issueType,projectItems`.
   - Keep the existing naming pattern: `PBI-XX` and `DEMO-XX`.
2. Turn the user's request into one JSON spec.
3. Run `create_planning_issues.py --dry-run <spec.json>` and review the rendered issue titles and bodies.
4. Run `create_planning_issues.py <spec.json>` to create the issues.
5. Verify both created issues have:
   - Issue Type: `PBI` or `DemoGoal`
   - Project: `idea-boost`
   - Status: `PBI` for PBI, `Demo Goal` for demo goals
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
- Worked example (from idea-flow-app's own domain; no story points):

  > As a host, I want to create a brainstorming room and issue an invite URL/code, because I want to invite participants and start the discussion.

  Demo goals:

  - Clicking the "create room" button on the home screen navigates to the waiting screen.
  - Arriving at the waiting screen shows the invite URL.
  - Arriving at the waiting screen shows the invite code.
  - Clicking the invite URL on the waiting screen copies it.
  - Clicking the invite code on the waiting screen copies it.

  Maps onto the spec as one `demo_goals` entry per bullet:

  ```json
  "demo_goals": [
    {
      "title": "Create-room button navigates to the waiting screen",
      "goal": "Clicking the \"create room\" button on the home screen navigates to the waiting screen."
    },
    {
      "title": "Invite URL is shown",
      "goal": "Arriving at the waiting screen shows the invite URL."
    },
    {
      "title": "Invite code is shown",
      "goal": "Arriving at the waiting screen shows the invite code."
    },
    {
      "title": "Invite URL copies on click",
      "goal": "Clicking the invite URL on the waiting screen copies it."
    },
    {
      "title": "Invite code copies on click",
      "goal": "Clicking the invite code on the waiting screen copies it."
    }
  ]
  ```

  Another example:

  > As a participant, I want to join a room from the invite URL/code and see who else has joined, because I want to confirm I joined the right room.

  Demo goals:

  - Entering the invite code on the home screen and pressing join navigates to the matching waiting screen.
  - The waiting screen shows currently joined members in real time.
  - When the host clicks start on the waiting screen, everyone is navigated to the room screen.

## Spec Format

Create a temporary JSON file outside the skill folder, for example under `/tmp`.

```json
{
  "repo": "engineer-first/idea-boost",
  "project_owner": "engineer-first",
  "project_number": 3,
  "milestone": "Sprint 2",
  "demo_overview": "開発環境が統一され、誰でも同じ手順でアプリを起動できる状態をデモする。",
  "pbi": {
    "id": "PBI-01",
    "title": "開発環境を統一する",
    "story": "開発者としてチーム全員が同じ環境で開発できるようにしたい。開発環境の違いによる問題を減らしたいからだ。",
    "acceptance": [
      "GitHubリポジトリでソースコードが管理されている",
      "READMEで環境構築手順と起動方法を確認できる"
    ],
    "memo": ["既存の実装タスク候補: #7 [Task] 環境構築"]
  },
  "demo_goals": [
    {
      "title": "GitHubリポジトリでソースコードが管理されている",
      "goal": "GitHubリポジトリを開くと、アプリケーションのソースコードが管理されていることを確認できる。",
      "checks": ["GitHubリポジトリにアプリケーションのソースコードが存在する"],
      "risks": ["READMEの手順が古いと再現できない"]
    }
  ],
  "not_doing": ["CI環境の統一はスコープ外"]
}
```

Notes:

- Omit `milestone` only when the user explicitly wants no sprint milestone.
- Put the human-readable title without the ID in `pbi.title`; the script prefixes `PBI-XX`.
- The demo issue title is derived from the PBI: `DEMO-<PBI番号> <PBIタイトル>`.
- Put each reviewable outcome inside `demo_goals`; the script renders all of them into one DemoGoal issue.
- Use `memo` for implementation-task candidates, unresolved notes, or whiteboard context.
- Omit `demo_overview` to fall back to the default sentence (`<PBIタイトル> として、以下の状態をスプリントレビューでデモする。`); set it only when the demo needs different framing.
- Use `not_doing` for items explicitly out of scope; it renders as a `## やらないこと` section after all demo goals.
- Use `risks` inside a `demo_goals` entry for goal-specific caveats; it renders as a `リスク:` list under that goal only.

## Script

The script lives outside this skill folder because the Claude Code equivalent (`.claude/skills/pbi-demogoal/`) shares the same implementation. Run from the repository root:

```bash
python3 .agents/skills/pbi-demogoal/scripts/create_planning_issues.py --dry-run /tmp/idea-flow-spec.json
python3 .agents/skills/pbi-demogoal/scripts/create_planning_issues.py /tmp/idea-flow-spec.json
```

The script uses Issue Type instead of labels. Ensure `gh auth status` has `repo` and `project` scopes.
