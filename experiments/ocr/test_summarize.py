import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from summarize import summarize

class ReportTests(unittest.TestCase):
    def make_run(self, directory, texts, results):
        path = Path(directory)
        manifest = []
        for variant, text in zip(('A', 'B'), texts):
            (path / f'{variant}.txt').write_text(text)
            (path / f'{variant}.png').write_bytes(b'image-for-hash-only')
            manifest.append({'id': variant, 'pair_id': 'pair', 'variant': variant,
                             'image': f'{variant}.png', 'truth': f'{variant}.txt',
                             'lang': 'eng', 'category': 'test'})
        (path / 'manifest.json').write_text(json.dumps(manifest))
        for r in results:
            if r['id'] in ('A', 'B'):
                r['image_sha256'] = hashlib.sha256((path / (r['id'] + '.png')).read_bytes()).hexdigest()
                r['truth_sha256'] = hashlib.sha256((path / (r['id'] + '.txt')).read_bytes()).hexdigest()
        (path / 'run.json').write_text(json.dumps({'manifest_sha256': hashlib.sha256((path / 'manifest.json').read_bytes()).hexdigest(), 'results': results}))
        return summarize(path / 'manifest.json', path / 'run.json')

    def test_failed_page_is_not_an_empty_success_or_false_difference(self):
        with tempfile.TemporaryDirectory() as d:
            report = self.make_run(d, ['100', '100'], [{'id':'A', 'status':'ok', 'text':'100'}])
        self.assertEqual(report['groups']['all']['succeeded'], 1)
        self.assertEqual(report['groups']['all']['total'], 2)
        self.assertFalse(report['pairs'][0]['complete'])
        self.assertIsNone(report['pairs'][0]['observed_changed'])
        self.assertFalse(report['pairs'][0]['false_difference'])
        self.assertEqual(report['pair_summary']['completed_equal_pairs'], 0)
        self.assertEqual(report['pair_summary']['incomplete_pairs'], 1)

    def test_false_difference_and_missed_change(self):
        with tempfile.TemporaryDirectory() as d:
            report = self.make_run(d, ['100', '100'], [
                {'id':'A','status':'ok','text':'100'}, {'id':'B','status':'ok','text':'1OO'}])
            self.assertTrue(report['pairs'][0]['false_difference'])
            report = self.make_run(d, ['100', '200'], [
                {'id':'A','status':'ok','text':'100'}, {'id':'B','status':'ok','text':'100'}])
            self.assertTrue(report['pairs'][0]['missed_change'])

    def test_changed_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.make_run(d, ['100', '100'], [{'id':'A', 'status':'ok', 'text':'100'}])
            (Path(d) / 'A.png').write_bytes(b'different-image')
            with self.assertRaisesRegex(ValueError, 'Input hash'):
                summarize(Path(d) / 'manifest.json', Path(d) / 'run.json')

    def test_duplicate_result_ids_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                self.make_run(d, ['x', 'x'], [{'id':'A'}, {'id':'A'}])

if __name__ == '__main__':
    unittest.main()
