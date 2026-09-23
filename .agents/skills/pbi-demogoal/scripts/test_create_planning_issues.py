import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

import create_planning_issues as planning


class PlanningIssueSpecTests(unittest.TestCase):
    def spec(self):
        return {
            "repo": "engineer-first/idea-boost",
            "project_owner": "engineer-first",
            "project_number": 3,
            "pbi": {"title": "タイトル", "story": "利用者として価値を得たい。"},
            "demo_goals": [{"title": "確認する", "goal": "画面で結果を確認できる。"}],
        }

    def test_pbi_id_is_optional_for_the_existing_auto_numbering_route(self):
        planning.validate_spec(self.spec())

    def test_concurrent_creations_derive_distinct_ids_from_created_issue_numbers(self):
        specs = [self.spec(), self.spec()]
        with patch.object(planning, "create_issue", side_effect=[
            {"number": 340, "url": "https://github.com/engineer-first/idea-boost/issues/340"},
            {"number": 341, "url": "https://github.com/engineer-first/idea-boost/issues/341"},
        ]) as create, patch.object(planning, "run") as run:
            for spec in specs:
                planning.create_pbi_issue(spec)
        self.assertEqual([spec["pbi"]["id"] for spec in specs], ["PBI-340", "PBI-341"])
        self.assertEqual([call.args[1] for call in create.call_args_list], ["タイトル", "タイトル"])
        self.assertEqual([call.args[0][-1] for call in run.call_args_list], ["PBI-340 タイトル", "PBI-341 タイトル"])

    def test_title_update_failure_reports_the_created_issue_for_recovery(self):
        with patch.object(planning, "create_issue", return_value={
            "number": 340, "url": "https://github.com/engineer-first/idea-boost/issues/340",
        }), patch.object(planning, "run", side_effect=RuntimeError("network failure")):
            with self.assertRaisesRegex(RuntimeError, "issues/340"):
                planning.create_pbi_issue(self.spec())

    def test_dry_run_needs_no_github_access_and_does_not_assign_a_real_id(self):
        spec = self.spec()
        with patch.object(planning, "run") as run, patch("builtins.print"):
            planning.render_dry_run(spec)
        run.assert_not_called()
        self.assertNotIn("id", spec["pbi"])

    def test_preserves_an_explicit_legacy_pbi_id(self):
        spec = self.spec()
        spec["pbi"]["id"] = "PBI-12"
        with patch.object(planning, "run") as run:
            planning.assign_pbi_id(spec, 340)
        self.assertEqual(spec["pbi"]["id"], "PBI-12")
        run.assert_not_called()

    def test_main_uses_the_assigned_id_for_the_demo_and_initializes_both_items(self):
        fields = [{"id": "status-id", "name": "Status", "options": [{"id": "untriaged-id", "name": "未整理"}]}]
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "spec.json"
            spec_path.write_text(json.dumps(self.spec()), encoding="utf-8")
            with patch("sys.argv", ["create_planning_issues.py", str(spec_path)]), \
                 patch.object(planning, "project_id", return_value="project-id"), \
                 patch.object(planning, "project_fields", return_value=fields), \
                 patch.object(planning, "create_issue", side_effect=[
                     {"number": 340, "url": "https://github.com/engineer-first/idea-boost/issues/340"},
                     {"number": 341, "url": "https://github.com/engineer-first/idea-boost/issues/341"},
                 ]) as create, \
                 patch.object(planning, "add_to_project", side_effect=["pbi-item", "demo-item"]), \
                 patch.object(planning, "set_project_status") as set_status, \
                 patch.object(planning, "run"), patch("builtins.print"):
                planning.main()
        demo = create.call_args_list[1].args
        self.assertEqual(demo[1], "DEMO-340 タイトル")
        self.assertIn("#340 PBI-340 タイトル", demo[2])
        self.assertEqual(demo[3], "DemoGoal")
        self.assertEqual([call.args for call in set_status.call_args_list], [
            ("pbi-item", "project-id", "status-id", "untriaged-id"),
            ("demo-item", "project-id", "status-id", "untriaged-id"),
        ])


class ProjectStatusTests(unittest.TestCase):
    def fields(self, field_name):
        return [
            {
                "id": "status-field-id",
                "name": field_name,
                "options": [
                    {"id": "untriaged-id", "name": "未整理"},
                    {"id": "working-id", "name": "作業中"},
                    {"id": "review-id", "name": "レビュー中"},
                ],
            }
        ]

    def test_finds_japanese_status_field_name(self):
        self.assertEqual(planning.status_field(self.fields("状態")), ("状態", "status-field-id"))

    def test_supports_github_fixed_english_status_field_name(self):
        self.assertEqual(planning.status_field(self.fields("Status")), ("Status", "status-field-id"))

    def test_uses_untriaged_as_the_initial_state(self):
        name, field_id = planning.status_field(self.fields("状態"))
        self.assertEqual(
            planning.field_option(self.fields(name)[0:1], name, "未整理"),
            (field_id, "untriaged-id"),
        )

    def test_sets_initial_status_once_without_retrying_automation_races(self):
        with patch.object(planning, "set_project_option") as set_option:
            planning.set_project_status("item-id", "project-id", "status-id", "untriaged-id")
        set_option.assert_called_once_with("item-id", "project-id", "status-id", "untriaged-id")


if __name__ == "__main__":
    unittest.main()
