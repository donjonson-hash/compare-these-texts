"""Firefox-only AMO packaging of the offline emoji data, without changing glyphs."""
import json

MODULE_LIMIT = 2 * 1024 * 1024
NOTICE = '// Generated offline color glyphs. See COLOR-EMOJI-SOURCE.md and licenses.\n'


def module(value):
    return (NOTICE + 'export default ' + json.dumps(value, ensure_ascii=False, separators=(',', ':')) + ';\n').encode()


def split_color_emoji(files):
    # This asset is data, not arbitrary JS: reject unexpected source structures.
    source = files['emoji-color-vendor.mjs'].decode()
    if not source.startswith(NOTICE + 'export default ') or not source.endswith(';\n'):
        raise ValueError('Unexpected color emoji source module')
    data = json.loads(source[len(NOTICE + 'export default '):-2])
    if set(data) != {'sequences', 'images'} or not isinstance(data['sequences'], dict) or not isinstance(data['images'], list):
        raise ValueError('Unexpected color emoji collection')
    sequences = module(data['sequences'])
    if len(sequences) >= MODULE_LIMIT:
        raise ValueError('Color emoji sequence map exceeds the Firefox module limit')
    files['emoji-color-sequences.mjs'] = sequences
    chunks, current, length = [], [], len(module([]))
    for image in data['images']:
        encoded = json.dumps(image, ensure_ascii=False, separators=(',', ':')).encode()
        if len(encoded) + len(module([])) >= MODULE_LIMIT:
            raise ValueError('A color emoji image exceeds the Firefox module limit')
        additional = len(encoded) + bool(current)
        if current and length + additional >= MODULE_LIMIT:
            chunks.append(current)
            current, length = [], len(module([]))
        length += len(encoded) + bool(current)
        current.append(image)
    if current:
        chunks.append(current)
    imports = ["import sequences from './emoji-color-sequences.mjs';"]
    for index, chunk in enumerate(chunks):
        name = f'emoji-color-images-{index}.mjs'
        files[name] = module(chunk)
        assert len(files[name]) < MODULE_LIMIT
        imports.append(f"import images{index} from './{name}';")
    # Static imports keep the same synchronous default export and offline CSP.
    images = ','.join(f'...images{index}' for index in range(len(chunks)))
    files['emoji-color-vendor.mjs'] = (NOTICE + '\n'.join(imports) + '\nexport default {sequences,images:[' + images + ']};\n').encode()
