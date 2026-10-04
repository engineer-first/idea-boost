#!/usr/bin/env python3
"""Markdown is authoritative; create/check its derived index and visual references."""
import argparse
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / 'canvas-interactions.md'
INDEX = HERE / 'rules-index.json'
MANIFEST = HERE / 'visual-map.json'
FIELDS = ['区分', '状態', '入力', '主体・工程', '対象・前提', '結果', '取消', '失敗', '同時操作', '検証']
RULE = re.compile(r'^### (CI-[A-Z0-9]+-\d{3}) ([^\n]+)\n(.*?)(?=^<a id=|^### CI-|^## |\Z)', re.M | re.S)
BASELINE = 'ad244effde34662fbeedd83813aa3a0dbe7fd82a'


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


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
        rules.append({'id': rid, 'title': title, 'anchor': rid.lower(), 'status': fields['区分'],
                      'acceptanceId': test[0], 'contract': fields,
                      'sha256': digest(match[0].strip())})
    if not rules:
        raise ValueError('no rules')
    return {'$schema': './rules-index.schema.json', 'schemaVersion': '1.0.0',
            'source': '../canvas-interactions.md', 'sourceSha256': digest(source),
            'implementationBaseline': BASELINE, 'authority': 'markdown', 'rules': rules}


def check_manifest(index, manifest, strict=False):
    if manifest['boardUrl'] != 'https://www.figma.com/board/bpWlMnyv0Z9pvq7mMeQ0dj':
        raise ValueError('unexpected visual destination')
    lookup = {r['id']: r for r in index['rules']}
    sections, represented = set(), set()
    for section in manifest['sections']:
        if section['id'] in sections:
            raise ValueError('duplicate visual section')
        sections.add(section['id'])
        for rid in section['ruleIds']:
            if rid not in lookup:
                raise ValueError(f'unknown visual rule: {rid}')
            represented.add(rid)
        if section['status'] == 'verified':
            if set(section['ruleHashes']) != set(section['ruleIds']):
                raise ValueError(f"{section['id']}: missing verified hashes")
            if any(section['ruleHashes'][rid] != lookup[rid]['sha256'] for rid in section['ruleIds']):
                raise ValueError(f"{section['id']}: stale visual hashes")
        elif strict and section['ruleIds']:
            raise ValueError(f"{section['id']}: visual verification pending")
    missing = set(lookup) - represented
    if missing:
        raise ValueError('unmapped rules: ' + ', '.join(sorted(missing)))
    if strict and manifest.get('sourceSha256') != index['sourceSha256']:
        raise ValueError('visual manifest has stale source hash')


def self_test(source, index, manifest):
    for bad in [source.replace('- **状態**:', '- **欠落**:', 1),
                source + '\n' + RULE.search(source)[0],
                source.replace('AT-002:', 'AT-001:', 1)]:
        try:
            build(bad)
        except ValueError:
            pass
        else:
            raise ValueError('negative test did not reject malformed source')
    bad = json.loads(json.dumps(manifest))
    bad['sections'][0]['ruleIds'] = ['CI-MISSING-999']
    try:
        check_manifest(index, bad)
    except ValueError:
        pass
    else:
        raise ValueError('negative test accepted missing visual rule')
    print('PASS self-test: missing field, duplicate rule, duplicate acceptance, unknown visual rule')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--strict-visual', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    source = SOURCE.read_text(encoding='utf-8')
    index = build(source)
    encoded = json.dumps(index, ensure_ascii=False, indent=2) + '\n'
    if args.write:
        INDEX.write_text(encoded, encoding='utf-8')
    elif not INDEX.exists() or INDEX.read_text(encoding='utf-8') != encoded:
        raise ValueError('index stale: run --write; do not edit rules-index.json')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    check_manifest(index, manifest, args.strict_visual)
    if args.self_test:
        self_test(source, index, manifest)
    pending = [s['id'] for s in manifest['sections'] if s['status'] != 'verified' and s['ruleIds']]
    print(f"PASS {len(index['rules'])} rules / unique AT IDs / required fields / index hash / visual references")
    if pending:
        print('VISUAL PENDING ' + ', '.join(pending))
    print('This validates structure and provenance, not runtime behavior or semantic equivalence of diagrams.')


if __name__ == '__main__':
    main()
