#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path


def run(cmd, *, input_text=None):
    result = subprocess.run(
        cmd,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        joined = " ".join(cmd)
        raise RuntimeError(f"Command failed: {joined}\n{result.stderr.strip()}")
    return result.stdout.strip()


def require_list(value, field):
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"{field} must be a list of strings")
    return value


def require_object(value, field):
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    return value


def require_string(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value


def require_optional_string(value, field):
    if value is None:
        return None
    return require_string(value, field)


def bullet_list(items):
    items = require_list(items, "list field")
    return "\n".join(f"- {item}" for item in items) if items else "-"


def issue_title(item):
    return f"{item['id']} {item['title']}"


def demo_issue_id(pbi):
    if not pbi["id"].startswith("PBI-"):
        raise ValueError("pbi.id must use PBI-XX format")
    return f"DEMO-{pbi['id'].removeprefix('PBI-')}"


def demo_issue_title(pbi):
    return f"{demo_issue_id(pbi)} {pbi['title']}"


def pbi_body(pbi):
    return "\n\n".join(
        [
            "## ユーザーストーリー",
            pbi["story"],
            "## 受け入れ条件",
            bullet_list(pbi.get("acceptance")),
            "## メモ",
            bullet_list(pbi.get("memo")),
        ]
    )


def demo_section(index, demo):
    parts = [
        f"### {index}. {demo['title']}",
        demo["goal"],
        "確認観点:",
        bullet_list(demo.get("checks")),
    ]
    risks = demo.get("risks")
    if risks:
        parts.extend(["リスク:", bullet_list(risks)])
    return "\n\n".join(parts)


def demo_body(spec, pbi_number, pbi_title):
    pbi = spec["pbi"]
    overview = (
        spec.get("demo_overview")
        or f"{issue_title(pbi)} として、以下の状態をスプリントレビューでデモする。"
    )
    parts = ["## デモゴール", overview]
    for index, demo in enumerate(spec["demo_goals"], start=1):
        parts.append(demo_section(index, demo))
    not_doing = spec.get("not_doing")
    if not_doing:
        parts.extend(["## やらないこと", bullet_list(not_doing)])
    parts.extend(["## 関連PBI", f"- #{pbi_number} {pbi_title}"])
    return "\n\n".join(parts)


def validate_spec(spec):
    require_object(spec, "spec")
    for key in ["repo", "project_owner", "project_number", "pbi", "demo_goals"]:
        if key not in spec:
            raise ValueError(f"Missing required field: {key}")
    require_string(spec["repo"], "repo")
    require_string(spec["project_owner"], "project_owner")
    require_optional_string(spec.get("demo_overview"), "demo_overview")
    require_optional_string(spec.get("milestone"), "milestone")

    pbi = require_object(spec["pbi"], "pbi")
    for key in ["id", "title", "story"]:
        if key not in pbi:
            raise ValueError(f"pbi.{key} is required")
        require_string(pbi[key], f"pbi.{key}")
    require_list(pbi.get("acceptance"), "pbi.acceptance")
    require_list(pbi.get("memo"), "pbi.memo")

    require_list(spec.get("not_doing"), "not_doing")

    if not isinstance(spec["demo_goals"], list) or not spec["demo_goals"]:
        raise ValueError("demo_goals must be a non-empty list")
    for index, demo in enumerate(spec["demo_goals"]):
        require_object(demo, f"demo_goals[{index}]")
        for key in ["title", "goal"]:
            if key not in demo:
                raise ValueError(f"demo_goals[{index}].{key} is required")
            require_string(demo[key], f"demo_goals[{index}].{key}")
        require_list(demo.get("checks"), f"demo_goals[{index}].checks")
        require_list(demo.get("risks"), f"demo_goals[{index}].risks")


def create_issue(repo, title, body, issue_type, milestone=None):
    cmd = [
        "gh",
        "issue",
        "create",
        "--repo",
        repo,
        "--title",
        title,
        "--body-file",
        "-",
        "--type",
        issue_type,
    ]
    if milestone:
        cmd.extend(["--milestone", milestone])
    url = run(cmd, input_text=body)
    number = int(url.rstrip("/").split("/")[-1])
    return {"url": url, "number": number}


def find_project_item_id(project_number, project_owner, issue_number):
    output = run(
        [
            "gh",
            "project",
            "item-list",
            str(project_number),
            "--owner",
            project_owner,
            "--format",
            "json",
            "--limit",
            "1000",
        ]
    )
    for item in json.loads(output)["items"]:
        content = item.get("content") or {}
        if content.get("number") == issue_number:
            return item["id"]
    return None


def add_to_project(project_number, project_owner, url, issue_number):
    try:
        output = run(
            [
                "gh",
                "project",
                "item-add",
                str(project_number),
                "--owner",
                project_owner,
                "--url",
                url,
                "--format",
                "json",
            ]
        )
    except RuntimeError:
        existing_item_id = find_project_item_id(
            project_number, project_owner, issue_number
        )
        if existing_item_id:
            return existing_item_id
        raise
    return json.loads(output)["id"]


def project_id(project_number, project_owner):
    output = run(
        [
            "gh",
            "project",
            "view",
            str(project_number),
            "--owner",
            project_owner,
            "--format",
            "json",
        ]
    )
    return json.loads(output)["id"]


def project_fields(project_number, project_owner):
    output = run(
        [
            "gh",
            "project",
            "field-list",
            str(project_number),
            "--owner",
            project_owner,
            "--format",
            "json",
            "--limit",
            "100",
        ]
    )
    return json.loads(output)["fields"]


def field_option(fields, field_name, option_name):
    for field in fields:
        if field.get("name") == field_name:
            for option in field.get("options", []):
                if option.get("name") == option_name:
                    return field["id"], option["id"]
    raise ValueError(f"Project field option not found: {field_name}={option_name}")


def set_project_option(item_id, project_id_value, field_id, option_id):
    run(
        [
            "gh",
            "project",
            "item-edit",
            "--id",
            item_id,
            "--project-id",
            project_id_value,
            "--field-id",
            field_id,
            "--single-select-option-id",
            option_id,
        ]
    )


def set_project_status(item_id, project_id_value, status_field_id, status_option_id):
    # The built-in "Item added to project" workflow may briefly reset new items to Todo.
    for delay in [0, 2, 5, 10]:
        if delay:
            time.sleep(delay)
        set_project_option(item_id, project_id_value, status_field_id, status_option_id)


def render_dry_run(spec):
    pbi = spec["pbi"]
    demo_title = demo_issue_title(pbi)
    print(f"# {issue_title(pbi)}")
    print(pbi_body(pbi))
    print("\n" + "=" * 72)
    print(f"# {demo_title}")
    print(demo_body(spec, "PBI_ISSUE_NUMBER", issue_title(pbi)))


def main():
    parser = argparse.ArgumentParser(
        description="Create idea-boost PBI and consolidated DemoGoal issues."
    )
    parser.add_argument("spec", type=Path, help="Path to a JSON planning spec")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Render issue bodies without creating issues",
    )
    args = parser.parse_args()

    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    validate_spec(spec)

    if args.dry_run:
        render_dry_run(spec)
        return

    repo = spec["repo"]
    owner = spec["project_owner"]
    project_number = spec["project_number"]
    milestone = spec.get("milestone")
    pbi = spec["pbi"]
    demo_title = demo_issue_title(pbi)

    pid = project_id(project_number, owner)
    fields = project_fields(project_number, owner)
    status_field, pbi_status = field_option(fields, "Status", "PBI")
    _, demo_status = field_option(fields, "Status", "Demo Goal")

    pbi_created = create_issue(repo, issue_title(pbi), pbi_body(pbi), "PBI", milestone)
    pbi_item_id = add_to_project(
        project_number, owner, pbi_created["url"], pbi_created["number"]
    )
    set_project_status(pbi_item_id, pid, status_field, pbi_status)

    demo_created = create_issue(
        repo,
        demo_title,
        demo_body(spec, pbi_created["number"], issue_title(pbi)),
        "DemoGoal",
        milestone,
    )
    demo_item_id = add_to_project(
        project_number, owner, demo_created["url"], demo_created["number"]
    )
    set_project_status(demo_item_id, pid, status_field, demo_status)

    for item in [{"kind": "PBI", **pbi_created}, {"kind": "DemoGoal", **demo_created}]:
        print(f"{item['kind']} #{item['number']}: {item['url']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
