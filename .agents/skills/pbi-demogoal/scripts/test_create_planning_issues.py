import json
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

    def test_assigns_the_next_available_pbi_number_without_manual_input(self):
        spec = self.spec()
        with patch.object(
            planning,
            "run",
            return_value=json.dumps(
                [
                    {"title": "PBI-08 古い項目"},
                    {"title": "PBI-99 直近の項目"},
                    {"title": "PBI-1000は本文中の参照"},
                    {"title": "PBI-100 別の項目"},
                ]
            ),
        ) as run:
            planning.assign_pbi_id(spec)

        self.assertEqual(spec["pbi"]["id"], "PBI-101")
        run.assert_called_once_with(
            [
                "gh",
                "issue",
                "list",
                "--repo",
                "engineer-first/idea-boost",
                "--state",
                "all",
                "--limit",
                "1000",
                "--json",
                "title",
            ]
        )

    def test_preserves_an_explicit_legacy_pbi_id(self):
        spec = self.spec()
        spec["pbi"]["id"] = "PBI-12"
        with patch.object(planning, "run") as run:
            planning.assign_pbi_id(spec)
        self.assertEqual(spec["pbi"]["id"], "PBI-12")
        run.assert_not_called()


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
