import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import create_planning_issues as planning


class StoryPointsTests(unittest.TestCase):
    def apply(self, value, responses):
        with patch.object(planning, "run", side_effect=responses) as run:
            result = planning.set_story_points_if_empty("engineer-first/idea-boost", 123, value)
        return result, run

    def responses(self, value):
        return [json.dumps([{"id": 7, "name": "Story points", "data_type": "number"}]),
                json.dumps({"type": {"name": "PBI"}}), "[]", "[]",
                json.dumps([{"issue_field_id": 7, "value": value}])]

    def test_全選択値を数値のまま追加し全置換しない(self):
        for value in [0.1, 1, 2, 3, 5, 8, 13]:
            with self.subTest(value=value):
                result, run = self.apply(value, self.responses(value))
                self.assertEqual(result, "set")
                call = run.call_args_list[3]
                self.assertIn("POST", call.args[0])
                self.assertNotIn("PUT", call.args[0])
                self.assertEqual(json.loads(call.kwargs["input_text"]), {
                    "issue_field_values": [{"field_id": 7, "value": value}]})

    def test_省略や不正値は通信せず空欄で続行する(self):
        for value in [None, True, False, "5", 0, 4, 21, {}, []]:
            with self.subTest(value=value):
                result, run = self.apply(value, [])
                self.assertEqual(result, "skipped")
                run.assert_not_called()

    def test_既存値は許容値外やゼロでも上書きしない(self):
        for existing in [0.1, 8, 0, 4]:
            responses = self.responses(3)[:2] + [json.dumps([{"issue_field_id": 7, "value": existing}])]
            result, run = self.apply(3, responses)
            self.assertEqual(result, "preserved")
            self.assertEqual(run.call_count, 3)

    def test_Taskや型未設定を更新しない(self):
        for issue_type in [{"name": "Task"}, None]:
            result, run = self.apply(3, [self.responses(3)[0], json.dumps({"type": issue_type})])
            self.assertEqual(result, "skipped")
            self.assertEqual(run.call_count, 2)

    def test_同名の欠落や型違いは新設せず続行する(self):
        for fields in [[], [{"id": 7, "name": "Story points", "data_type": "text"}],
                       [{"id": 7, "name": "Story points", "data_type": "number"}] * 2]:
            result, run = self.apply(3, [json.dumps(fields)])
            self.assertEqual(result, "skipped")
            self.assertEqual(run.call_count, 1)

    def test_API失敗は再試行や起票失敗にしない(self):
        for index in range(5):
            responses = self.responses(3)[:index] + [RuntimeError("API unavailable")]
            result, run = self.apply(3, responses)
            self.assertEqual(result, "unconfirmed")
            self.assertEqual(run.call_count, index + 1)

    def test_読戻し不一致を成功と報告しない(self):
        responses = self.responses(3)
        responses[-1] = "[]"
        result, _ = self.apply(3, responses)
        self.assertEqual(result, "unconfirmed")

    def test_起票経路でSP失敗後も作成済みIssueを返す(self):
        spec = {"repo": "engineer-first/idea-boost", "pbi": {
            "id": "PBI-OPS-123", "title": "成果", "story": "利用者として…", "story_points": 8}}
        created = {"number": 123, "url": "https://github.com/engineer-first/idea-boost/issues/123"}
        with patch.object(planning, "create_issue", return_value=created) as create, \
             patch.object(planning, "run", side_effect=RuntimeError("forbidden")), \
             patch.object(planning, "set_story_points_if_empty", wraps=planning.set_story_points_if_empty) as estimate:
            self.assertEqual(planning.create_pbi_issue(spec), created)
            create.assert_called_once()
            estimate.assert_called_once_with(spec["repo"], 123, 8)

    def test_dry_runはSP候補を表示し外部通信しない(self):
        spec = {"pbi": {"id": "PBI-OPS-123", "title": "成果", "story": "利用者として…", "story_points": 0.1}}
        with patch.object(planning, "run") as run, redirect_stdout(io.StringIO()) as output:
            planning.render_dry_run(spec)
        run.assert_not_called()
        self.assertIn("Story points: 0.1", output.getvalue())

    def test_任意SP失敗後もProject登録と初期状態設定へ進む(self):
        import tempfile
        from pathlib import Path
        spec = {"repo": "engineer-first/idea-boost", "project_owner": "engineer-first", "project_number": 3,
                "pbi": {"id": "PBI-OPS-123", "title": "成果", "story": "利用者として…", "story_points": 13}}
        fields = [{"id": "status", "name": "Status", "options": [{"id": "initial", "name": "未整理"}]}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "spec.json"
            path.write_text(json.dumps(spec))
            with patch("sys.argv", ["create_planning_issues.py", str(path)]), \
                 patch.object(planning, "project_id", return_value="project"), \
                 patch.object(planning, "project_fields", return_value=fields), \
                 patch.object(planning, "create_issue", return_value={"number": 123, "url": "https://example.test/123"}) as create, \
                 patch.object(planning, "run", side_effect=RuntimeError("forbidden")), \
                 patch.object(planning, "add_to_project", return_value="item") as add, \
                 patch.object(planning, "set_project_status") as status:
                planning.main()
        create.assert_called_once()
        add.assert_called_once()
        status.assert_called_once_with("item", "project", "status", "initial")
