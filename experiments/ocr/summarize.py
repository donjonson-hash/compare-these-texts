"""Score OCR runs against fixtures; never treat failed/missing pages as success."""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import statistics
from metrics import evaluate, normalize
from table_text import plain_table_text


def summarize(manifest_path, run_path):
    fixtures = json.loads(manifest_path.read_text(encoding='utf-8'))
    run = json.loads(run_path.read_text(encoding='utf-8'))
    if run.get('manifest_sha256') != hashlib.sha256(manifest_path.read_bytes()).hexdigest():
        raise ValueError('Manifest hash missing or changed since OCR run')
    rows = run.get('results', [])
    ids = [r['id'] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate result IDs')
    known = {f['id'] for f in fixtures}
    if set(ids) - known:
        raise ValueError('Unknown result IDs')
    by_id = {r['id']: r for r in rows}
    pages, pairs = [], defaultdict(list)
    for fixture in fixtures:
        raw = by_id.get(fixture['id'], {'status': 'missing'})
        truth_path = manifest_path.parent / fixture['truth']
        truth = truth_path.read_text(encoding='utf-8')
        page = {k: fixture[k] for k in ('id', 'lang', 'category', 'pair_id', 'variant')}
        page.update(status=raw.get('status'), truth_sha256=hashlib.sha256(truth_path.read_bytes()).hexdigest(),
                    image_sha256=hashlib.sha256((manifest_path.parent / fixture['image']).read_bytes()).hexdigest())
        if fixture['id'] in by_id and any(raw.get(k) != page[k] for k in ('image_sha256', 'truth_sha256')):
            raise ValueError(f"Input hash missing or changed: {fixture['id']}")
        if page['status'] == 'ok':
            text = raw['text']
            if not isinstance(text, str) or max(len(truth), len(text)) > 20000:
                raise ValueError('Text must be a string of at most 20000 characters')
            page['metrics'] = evaluate(truth, text)
            table_truth, table_text = plain_table_text(truth), plain_table_text(text)
            page['table_format_diagnostic'] = {
                'reference_tables_converted': table_truth['converted_tables'],
                'hypothesis_tables_converted': table_text['converted_tables'],
                'metrics': evaluate(table_truth['text'], table_text['text']),
            }
            page['elapsed_ms'] = raw.get('elapsed_ms')
        pages.append(page)
        pairs[fixture['pair_id']].append((fixture, raw, truth))
    pair_results = []
    for pair_id, members in pairs.items():
        if len(members) != 2 or {m[0]['variant'] for m in members} != {'A', 'B'}:
            raise ValueError(f'Invalid pair: {pair_id}')
        expected_changed = normalize(members[0][2]) != normalize(members[1][2])
        complete = all(m[1].get('status') == 'ok' for m in members)
        observed_changed = (normalize(members[0][1]['text']) != normalize(members[1][1]['text'])) if complete else None
        pair_results.append({'pair_id': pair_id, 'complete': complete,
                             'expected_changed': expected_changed, 'observed_changed': observed_changed,
                             'false_difference': complete and not expected_changed and observed_changed,
                             'missed_change': complete and expected_changed and not observed_changed})
    groups = {}
    for group, subset in [('all', pages)] + [(lang, [p for p in pages if p['lang'] == lang]) for lang in ('eng', 'rus')]:
        good = [p for p in subset if p['status'] == 'ok']
        def rate(numerator, denominator):
            d = sum(p['metrics'][denominator] for p in good)
            return sum(p['metrics'][numerator] for p in good) / d if d else None
        timings = [p['elapsed_ms'] for p in good if isinstance(p.get('elapsed_ms'), (int, float))]
        groups[group] = {'total': len(subset), 'succeeded': len(good),
                         'exact_pages': sum(p['metrics']['exact_match'] for p in good),
                         'cer_micro': rate('character_edits', 'reference_characters'),
                         'wer_micro': rate('word_edits', 'reference_words'),
                         'numeric_recall_micro': rate('matched_numeric_tokens', 'reference_numeric_tokens'),
                         'numeric_precision_micro': rate('matched_numeric_tokens', 'hypothesis_numeric_tokens'),
                         'median_elapsed_ms': statistics.median(timings) if timings else None}
        diag = [p['table_format_diagnostic']['metrics'] for p in good]
        diag_chars = sum(m['reference_characters'] for m in diag)
        groups[group]['table_format_diagnostic'] = {
            'cer_micro': sum(m['character_edits'] for m in diag) / diag_chars if diag_chars else None,
            'exact_pages': sum(m['exact_match'] for m in diag),
            'hypothesis_tables_converted': sum(p['table_format_diagnostic']['hypothesis_tables_converted'] for p in good),
        }
    pair_summary = {
        'completed_equal_pairs': sum(p['complete'] and not p['expected_changed'] for p in pair_results),
        'completed_changed_pairs': sum(p['complete'] and p['expected_changed'] for p in pair_results),
        'incomplete_pairs': sum(not p['complete'] for p in pair_results),
        'false_difference_pairs': sum(bool(p['false_difference']) for p in pair_results),
        'missed_change_pairs': sum(bool(p['missed_change']) for p in pair_results),
    }
    return {'generated_utc': datetime.now(timezone.utc).isoformat(), 'engine': run.get('engine'),
            'version': run.get('version'), 'environment': run.get('environment'),
            'run_sha256': hashlib.sha256(run_path.read_bytes()).hexdigest(),
            'groups': groups, 'pair_summary': pair_summary, 'pairs': pair_results, 'pages': pages,
            'limitations': ['Synthetic pages only; not representative user documents.',
                           'Raw CER/WER include output Markdown/case differences, not only glyph recognition errors.',
                           'Table-format diagnostic removes only simple validated Markdown table syntax; it is not a fidelity score.',
                           'Metrics normalize whitespace; page layout is not scored.',
                           'Pair detection scores whether ANY change exists, not edit localization.',
                           'Numeric scores are multisets; they do not validate positions or labels.',
                           'Success-only error rates must be read with succeeded/total counts.']}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    parser.add_argument('--manifest', type=Path, default=Path(__file__).parent / 'fixtures/manifest.json')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = summarize(args.manifest, args.run)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result['groups'], ensure_ascii=False, indent=2))
    print(json.dumps(result['pair_summary'], indent=2))
