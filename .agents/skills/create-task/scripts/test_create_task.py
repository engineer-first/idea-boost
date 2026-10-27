import unittest
from unittest.mock import patch
import create_task as m

REPO = "engineer-first/idea-boost"
PARENT = {"id": 1234, "type": {"name": "PBI"}}
TASK = {"number": 42, "html_url": "https://github.com/engineer-first/idea-boost/issues/42", "type": {"name": "Task"}}
FIELD = {"id": 55, "name": "Estimate Hours", "data_type": "number"}

class TaskTests(unittest.TestCase):
    def test_create_and_estimate_preserves_other_field(self):
        responses = [PARENT, TASK, TASK, PARENT, [FIELD], [{"issue_field_id": 99, "value": 3}], {}, [{"issue_field_id": 55, "value": 1.5}]]
        with patch.object(m, "api", side_effect=responses) as api:
            created, status = m.create_task({"title": "確認を整える", "why": "結果が分からない", "parent_pbi": 7, "estimate_hours": 1.5})
        self.assertEqual((created, status), (TASK, "set"))
        writes = [c for c in api.call_args_list if c.kwargs.get("payload") is not None]
        self.assertEqual(writes[0].kwargs["payload"]["parent_issue_id"], 1234)
        self.assertEqual(writes[0].kwargs["payload"]["type"], "Task")
        self.assertEqual(writes[1].kwargs["payload"], {"issue_field_values": [{"field_id": 55, "value": 1.5}]})
        self.assertEqual(len(writes), 2)

    def test_existing_value_including_zero_is_preserved(self):
        for value in [0, 2.5]:
            with self.subTest(value=value), patch.object(m, "api", side_effect=[TASK, PARENT, [FIELD], [{"issue_field_id": 55, "value": value}]]) as api:
                self.assertEqual(m.set_estimate_if_empty(42, 1234, 2), "preserved")
                self.assertTrue(all(not c.kwargs for c in api.call_args_list))

    def test_invalid_or_absent_estimate_never_calls_api(self):
        for value in [None, True, 0, -1, "3", float("nan"), float("inf")]:
            with self.subTest(value=value), patch.object(m, "api") as api:
                self.assertEqual(m.set_estimate_if_empty(42, 1234, value), "skipped")
                api.assert_not_called()

    def test_wrong_type_parent_or_field_never_writes(self):
        cases = [[{"type": {"name": "PBI"}}], [TASK, {"id": 99, "type": {"name": "PBI"}}], [TASK, {"id": 1234, "type": {"name": "Task"}}], [TASK, PARENT, []], [TASK, PARENT, [FIELD, FIELD]], [TASK, PARENT, [{**FIELD, "data_type": "text"}]]]
        for responses in cases:
            with self.subTest(responses=responses), patch.object(m, "api", side_effect=responses) as api:
                self.assertEqual(m.set_estimate_if_empty(42, 1234, 2), "skipped")
                self.assertTrue(all(not c.kwargs for c in api.call_args_list))

    def test_api_failure_never_retries_or_blocks_created_task(self):
        for failure_at in range(6):
            responses = [TASK, PARENT, [FIELD], [], {}, [{"issue_field_id": 55, "value": 2}]]
            responses[failure_at] = RuntimeError("unavailable")
            with self.subTest(failure_at=failure_at), patch.object(m, "api", side_effect=[PARENT, TASK, *responses]) as api:
                created, status = m.create_task({"title": "題", "why": "理由", "parent_pbi": 7, "estimate_hours": 2})
                self.assertEqual((created, status), (TASK, "unconfirmed"))
                self.assertEqual(api.call_count, 3 + failure_at)

    def test_readback_mismatch_is_unconfirmed(self):
        with patch.object(m, "api", side_effect=[TASK, PARENT, [FIELD], [], {}, []]):
            self.assertEqual(m.set_estimate_if_empty(42, 1234, 2), "unconfirmed")

    def test_standalone_and_missing_hours_create_without_estimate(self):
        with patch.object(m, "api", return_value=TASK) as api:
            self.assertEqual(m.create_task({"title": "題", "why": "理由", "estimate_hours": 2}), (TASK, "skipped"))
            self.assertEqual(api.call_count, 1)
            self.assertNotIn("parent_issue_id", api.call_args.kwargs["payload"])
        with patch.object(m, "api", side_effect=[PARENT, TASK]) as api:
            self.assertEqual(m.create_task({"title": "題", "why": "理由", "parent_pbi": 7}), (TASK, "skipped"))
            self.assertEqual(api.call_count, 2)

    def test_invalid_parent_prevents_wrong_attachment(self):
        with patch.object(m, "api", return_value={"id": 1, "type": {"name": "Task"}}) as api:
            with self.assertRaises(ValueError):
                m.create_task({"title": "題", "why": "理由", "parent_pbi": 7})
            self.assertEqual(api.call_count, 1)

    def test_unknown_creation_outcome_does_not_retry(self):
        with patch.object(m, "api", side_effect=RuntimeError("timeout")) as api:
            with self.assertRaisesRegex(RuntimeError, "再実行"):
                m.create_task({"title": "題", "why": "理由"})
            self.assertEqual(api.call_count, 1)

    def test_dry_run_has_no_external_calls(self):
        with patch.object(m, "api") as api:
            rendered = m.render({"title": "題", "why": "理由"})
            self.assertIn("## Why", rendered)
            self.assertNotIn("Estimate", rendered)
            api.assert_not_called()

if __name__ == "__main__":
    unittest.main()
