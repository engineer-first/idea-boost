import json
import io
from contextlib import redirect_stdout
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
            "pbi": {"title": "タイトル", "story": "参加者として、案を比較したい。なぜなら、結論を選びたいからだ。"},
            "demo_goals": [{"title": "確認する", "goal": "画面で結果を確認できる。"}],
        }

    def test_story_and_why_do_not_generate_empty_optional_sections(self):
        spec = self.spec()
        del spec["demo_goals"]
        spec["pbi"]["why"] = "入力先を探すため案を書く流れが止まる。"
        planning.validate_spec(spec)
        self.assertEqual(planning.pbi_body(spec), spec["pbi"]["story"] + "\n\n## Why\n\n" + spec["pbi"]["why"])

    def test_story_is_required_even_when_why_is_present(self):
        for value in [None, "", "   "]:
            spec = self.spec()
            spec["pbi"]["story"] = value
            spec["pbi"]["why"] = "入力先を探すため考えが途切れる。"
            with self.assertRaisesRegex(ValueError, "pbi.story"):
                planning.validate_spec(spec)

    def test_demo_is_optional_representative_confirmation_in_one_experience_section(self):
        spec = self.spec()
        spec["pbi"]["acceptance"] = ["参加者が次の案を書き続けられる"]
        spec["demo_overview"] = "2人で付箋の追加を確認する"
        spec["demo_goals"][0]["checks"] = ["追加後すぐ入力できる"]
        spec["demo_goals"][0]["risks"] = ["対象は個人作業中"]
        body = planning.pbi_body(spec)
        self.assertEqual(body.count("## ユーザーに提供する体験"), 1)
        self.assertNotIn("## 期待する振る舞い", body)
        self.assertNotIn("## デモ確認内容", body)
        self.assertNotIn("確認観点:", body)
        for value in ["参加者が次の案を書き続けられる", "2人で付箋の追加を確認する",
                      "画面で結果を確認できる。", "追加後すぐ入力できる", "対象は個人作業中"]:
            self.assertIn(value, body)

    def test_title_is_only_the_subject_without_type_or_genre_prefix(self):
        spec = self.spec()
        planning.validate_spec(spec)
        with patch.object(planning, "create_issue", return_value={
            "number": 340, "url": "https://github.com/engineer-first/idea-boost/issues/340",
        }) as create, patch.object(planning, "run") as run:
            planning.create_pbi_issue(spec)
        self.assertEqual(create.call_args.args[1], "タイトル")
        self.assertEqual(create.call_args.args[3], "PBI")
        run.assert_not_called()

    def test_old_id_and_genre_inputs_are_rejected_before_any_creation(self):
        for key, value in [("genre", "CANVAS"), ("id", "PBI-CANVAS-04"), ("id", "PBI-12")]:
            with self.subTest(key=key, value=value):
                spec = self.spec()
                spec["pbi"][key] = value
                with self.assertRaisesRegex(ValueError, f"pbi.{key}"):
                    planning.validate_spec(spec)

    def test_story_is_the_first_body_content(self):
        spec = self.spec()
        self.assertTrue(planning.pbi_body(spec).startswith(spec["pbi"]["story"]))

    def test_body_expresses_why_and_behavior_without_story_heading(self):
        spec = self.spec()
        spec["pbi"]["why"] = "入力先を探すため案を書く流れが止まる。"
        spec["pbi"]["acceptance"] = ["追加後すぐ本文を書ける"]
        body = planning.pbi_body(spec)
        self.assertTrue(body.startswith(spec["pbi"]["story"] + "\n\n## Why"))
        self.assertIn(spec["pbi"]["why"], body)
        self.assertIn("## ユーザーに提供する体験\n\n- 追加後すぐ本文を書ける", body)
        self.assertNotIn("## 受け入れ条件", body)

    def test_why_rejects_invalid_values_but_legacy_spec_is_accepted(self):
        planning.validate_spec(self.spec())
        for value in ["", [], 1]:
            spec = self.spec()
            spec["pbi"]["why"] = value
            with self.assertRaisesRegex(ValueError, "pbi.why"):
                planning.validate_spec(spec)

    def test_dry_run_needs_no_github_access_and_shows_the_plain_title(self):
        spec = self.spec()
        with patch.object(planning, "run") as run, redirect_stdout(io.StringIO()) as output:
            planning.render_dry_run(spec)
        run.assert_not_called()
        self.assertIn("# タイトル\n", output.getvalue())
        self.assertNotIn("PBI-", output.getvalue())

    def test_planning_can_start_with_only_a_pbi_story(self):
        spec = self.spec()
        del spec["demo_goals"]
        planning.validate_spec(spec)
        with patch.object(planning, "run") as run, redirect_stdout(io.StringIO()) as output:
            planning.render_dry_run(spec)
        run.assert_not_called()
        self.assertIn("参加者として、案を比較したい。なぜなら、結論を選びたいからだ", output.getvalue())

    def test_main_creates_one_pbi_with_demo_checks_and_initializes_one_item(self):
        spec = self.spec()
        spec["milestone"] = "対象スプリント"
        spec["pbi"]["acceptance"] = ["受け入れ条件を保持する"]
        spec["demo_overview"] = "デモの見せ方を保持する"
        spec["demo_goals"][0]["risks"] = ["注意点を保持する"]
        spec["demo_goals"][0]["checks"] = ["確認観点を保持する"]
        spec["not_doing"] = ["対象外を保持する"]
        fields = [{"id": "status-id", "name": "Status", "options": [{"id": "untriaged-id", "name": "未整理"}]}]
        with tempfile.TemporaryDirectory() as directory:
            spec_path = Path(directory) / "spec.json"
            spec_path.write_text(json.dumps(spec), encoding="utf-8")
            with patch("sys.argv", ["create_planning_issues.py", str(spec_path)]), \
                 patch.object(planning, "project_id", return_value="project-id"), \
                 patch.object(planning, "project_fields", return_value=fields), \
                 patch.object(planning, "create_issue", return_value={
                     "number": 340, "url": "https://github.com/engineer-first/idea-boost/issues/340",
                 }) as create, \
                 patch.object(planning, "add_to_project", return_value="pbi-item") as add, \
                 patch.object(planning, "set_project_status") as set_status, \
                 patch.object(planning, "run"), patch("builtins.print"):
                planning.main()
        create.assert_called_once()
        created = create.call_args.args
        self.assertEqual(created[3:], ("PBI", "対象スプリント"))
        for content in ["参加者として、案を比較したい。なぜなら、結論を選びたいからだ", "受け入れ条件を保持する", "デモの見せ方を保持する", "画面で結果を確認できる", "注意点を保持する", "確認観点を保持する", "対象外を保持する"]:
            self.assertIn(content, created[2])
        add.assert_called_once_with(3, "engineer-first", "https://github.com/engineer-first/idea-boost/issues/340", 340)
        set_status.assert_called_once_with("pbi-item", "project-id", "status-id", "untriaged-id")


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
