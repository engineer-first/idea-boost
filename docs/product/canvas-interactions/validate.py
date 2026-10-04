#!/usr/bin/env python3
"""Check the authoritative Markdown contracts; no generated index or visual sync."""
import argparse
import re
from pathlib import Path

SOURCE = Path(__file__).resolve().parent / "details.md"
FIELDS = ['区分', '状態', '入力', '主体・工程', '対象・前提', '結果', '取消', '失敗', '同時操作', '検証']
RULE = re.compile(r'^### (CI-[A-Z0-9]+-\d{3}) ([^\n]+)\n(.*?)(?=^<a id=|^### CI-|^## |\Z)', re.M | re.S)


def build(source):
    rules = []
    ids = set()
    tests = set()
    for match in RULE.finditer(source):
        rid, title, body = match.groups()
        if rid in ids:
            raise ValueError(f'duplicate rule: {rid}')
        ids.add(rid)
        fields = {}
        for name in FIELDS:
            values = re.findall(r'^- \*\*' + re.escape(name) + r'\*\*: (.+)$', body, re.M)
            if len(values) != 1 or not values[0].strip():
                raise ValueError(f'{rid}: expected one nonempty {name}')
            fields[name] = values[0]
        if fields['区分'] not in {'inherited', 'v1', 'future', 'pending'}:
            raise ValueError(f'{rid}: unknown status')
        test = re.match(r'AT-\d{3}', fields['検証'])
        if not test or test[0] in tests:
            raise ValueError(f'{rid}: missing or duplicate acceptance id')
        tests.add(test[0])
        anchor = f'<a id="{rid.lower()}"></a>'
        if source.count(anchor) != 1:
            raise ValueError(f'{rid}: missing or duplicate explicit anchor')
        rules.append(rid)
    if not rules:
        raise ValueError('no rules')
    return rules


def self_test(source):
    for bad in [source.replace('- **状態**:', '- **欠落**:', 1),
                source + '\n' + RULE.search(source)[0],
                source.replace('AT-002:', 'AT-001:', 1),
                source.replace('<a id="ci-mode-001"></a>', '', 1)]:
        try:
            build(bad)
        except ValueError:
            pass
        else:
            raise ValueError('negative test accepted malformed source')
    print('PASS self-test: missing field, duplicate rule, duplicate AT, missing anchor')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    source = SOURCE.read_text(encoding='utf-8')
    rules = build(source)
    if args.self_test:
        self_test(source)
    print(f'PASS {len(rules)} rules / unique AT IDs / required fields / explicit anchors')
    print('Structure only; runtime behavior, performance and diagrams are not verified.')


if __name__ == '__main__':
    main()
