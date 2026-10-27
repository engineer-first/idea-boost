#!/usr/bin/env python3
"""新規作業Issueを起票し、PBI配下の末端なら任意時間を一度設定する。"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

REPO = "engineer-first/idea-boost"


def api(endpoint, *, payload=None):
    cmd = ["gh", "api", "-H", "X-GitHub-Api-Version: 2026-03-10", endpoint]
    if payload is not None:
        cmd += ["--method", "POST", "--input", "-"]
    result = subprocess.run(cmd, input=json.dumps(payload) if payload is not None else None,
                            text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def valid_hours(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def has_pbi_ancestor(parent):
    # GitHub supports eight nested levels. Only inspect this parent chain.
    for _ in range(8):
        if "pull_request" in parent:
            return False
        if (parent.get("type") or {}).get("name") == "PBI":
            return True
        url = parent.get("parent_issue_url") or ""
        if not url.startswith("https://api.github.com/repos/engineer-first/"):
            return False
        parent = api(url.removeprefix("https://api.github.com/"))
    return False


def set_estimate_if_empty(number, parent_id, value):
    if not parent_id or not valid_hours(value):
        return "skipped"
    endpoint = f"repos/{REPO}/issues/{number}"
    try:
        issue = api(endpoint)
        if ((issue.get("type") or {}).get("name") == "PBI" or "pull_request" in issue
                or (issue.get("sub_issues_summary") or {}).get("total") != 0):
            return "skipped"
        parent = api(endpoint + "/parent")
        if parent.get("id") != parent_id or not has_pbi_ancestor(parent):
            return "skipped"
        fields = api("orgs/engineer-first/issue-fields")
        matches = [f for f in fields if f.get("name") == "Estimate Hours"]
        if (len(matches) != 1 or matches[0].get("data_type") != "number"
                or matches[0].get("visibility") != "all"):
            return "skipped"
        field_id = matches[0]["id"]
        if type(field_id) is not int or field_id <= 0:
            return "skipped"
        values_endpoint = endpoint + "/issue-field-values"
        values = api(values_endpoint + "?per_page=100")
        if any(v["issue_field_id"] == field_id and v.get("value") is not None for v in values):
            return "preserved"
        # POST changes only this field. PUT would replace unrelated values.
        api(values_endpoint, payload={"issue_field_values": [{"field_id": field_id, "value": value}]})
        values = api(values_endpoint + "?per_page=100")
        if any(v["issue_field_id"] == field_id and v.get("value") == value for v in values):
            return "set"
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, AttributeError):
        pass
    return "unconfirmed"


def validate(spec):
    if not isinstance(spec, dict):
        raise ValueError("spec must be an object")
    for key in ("title", "why"):
        if not isinstance(spec.get(key), str) or not spec[key].strip():
            raise ValueError(f"{key} must be a non-empty string")
    for key in ("how", "completion"):
        if spec.get(key) is not None and not isinstance(spec[key], str):
            raise ValueError(f"{key} must be a string")
    issue_type = spec.get("issue_type", "Task")
    if issue_type is not None and (not isinstance(issue_type, str) or not issue_type.strip() or issue_type == "PBI"):
        raise ValueError("issue_type must be a non-PBI type name, or null")
    parent = spec.get("parent_issue")
    if parent is not None and (type(parent) is not int or parent <= 0):
        raise ValueError("parent_issue must be a positive Issue number")


def render(spec):
    validate(spec)
    parts = ["## Why", spec["why"]]
    for key, heading in (("how", "How"), ("completion", "作業完了条件")):
        if spec.get(key):
            parts.extend([f"## {heading}", spec[key]])
    return "\n\n".join(parts)


def create_work_issue(spec):
    body = render(spec)
    payload = {"title": spec["title"], "body": body}
    if spec.get("issue_type", "Task") is not None:
        payload["type"] = spec.get("issue_type", "Task")
    parent_id = None
    if spec.get("parent_issue"):
        parent = api(f"repos/{REPO}/issues/{spec['parent_issue']}")
        if "pull_request" in parent:
            raise ValueError("指定した親はPull Requestです。起票していません。")
        parent_id = parent["id"]
        payload["parent_issue_id"] = parent_id
    try:
        created = api(f"repos/{REPO}/issues", payload=payload)
    except (RuntimeError, OSError, ValueError) as exc:
        raise RuntimeError("起票結果が未確認です。GitHubで有無を確認するまで再実行しないでください。") from exc
    print(f"Work issue created: {created['html_url']}", flush=True)
    return created, set_estimate_if_empty(created["number"], parent_id, spec.get("estimate_hours"))


def main():
    parser = argparse.ArgumentParser(description="Create one work issue with optional Estimate Hours.")
    parser.add_argument("spec", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    body = render(spec)
    if args.dry_run:
        print(f"# {spec['title']}\n\n{body}")
        hours = spec.get("estimate_hours")
        print(f"Parent Issue: {spec.get('parent_issue') or '未整理'}")
        print(f"Estimate Hours: {hours if spec.get('parent_issue') and valid_hours(hours) else '未設定'}（任意・本文外）")
        return
    created, result = create_work_issue(spec)
    print(f"Estimate Hours: {result} ({created['html_url']})")
    print("Issue Type・親子関係・Project自動追加の反映を確認してください。起票の再実行はしません。")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
