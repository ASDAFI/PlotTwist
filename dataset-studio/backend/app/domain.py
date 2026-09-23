"""Lossless JSON validation: never rebuild the source through a schema projection."""
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse, parse_qs
import hashlib
import json
import math
import re
from PIL import Image

class Problem(Exception):
    def __init__(self, message, status=422, details=None):
        super().__init__(message)
        self.status, self.details = status, details

def relative_path(value, allow_root=False):
    if not isinstance(value, str):
        raise Problem('Path must be a string.')
    value = value.replace('\\', '/')
    if allow_root and value in ('', '.'):
        return '.'
    if (not value or value.startswith('/') or '\x00' in value or ':' in value
        or any(p in ('', '.', '..') for p in value.split('/'))):
        raise Problem('Only safe relative paths are accepted.')
    return value

def contained(root: Path, value='.', *, must_exist=True):
    rel = relative_path(value, allow_root=True)
    try:
        path = (root / rel).resolve(strict=must_exist)
    except (FileNotFoundError, RuntimeError, OSError) as exc:
        raise Problem(f'File or directory is unavailable: {rel}', 404) from exc
    if not path.is_relative_to(root.resolve()):
        raise Problem('Path escapes the configured root.', 403)
    return path

def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()

def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def load_json(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise ValueError(f'Duplicate JSON property: {key}')
            result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=pairs,
                          parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f'Non-finite number: {value}')))
    except (ValueError, UnicodeError) as exc:
        raise Problem(f'Invalid JSON: {exc}') from exc

def dumps(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))

def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def validate_record(d, *, export=False):
    def need(test, message):
        if not test:
            raise Problem(message)
    need(isinstance(d, dict), 'Record must be a JSON object.')
    image = d.get('image')
    need(isinstance(image, dict), 'Missing image object.')
    path = relative_path(image.get('path'))
    need(path.startswith('images/'), 'image.path must be relative to images/.')
    w, h = image.get('width'), image.get('height')
    need(finite(w) and finite(h) and w > 0 and h > 0 and int(w) == w and int(h) == h, 'Image dimensions must be positive integer pixel counts.')
    need(isinstance(d.get('problem'), str), 'problem must be the question string.')
    choices = d.get('choices')
    need(isinstance(choices, dict) and bool(choices) and all(isinstance(k, str) and k and isinstance(v, str) for k, v in choices.items()), 'choices must contain nonempty literal string keys and string descriptions.')
    need(isinstance(d.get('contributor'), dict), 'Missing contributor object.')
    deceptions = d.get('ordered_deceptions')
    need(isinstance(deceptions, list), 'ordered_deceptions must be an array.')
    ids, box_ids = set(), set()
    answer = d.get('answer')
    need(isinstance(answer, dict), 'Exactly one answer object is required.')
    for dec in deceptions:
        need(isinstance(dec, dict), 'Each deception must be an object.')
        identity = dec.get('id')
        need((isinstance(identity, int) and not isinstance(identity, bool)) or (isinstance(identity, str) and bool(identity)), 'Deception id must be a nonempty string or integer.')
        need(str(identity) not in ids, 'Duplicate deception id.')
        ids.add(str(identity))
        need(isinstance(dec.get('deceptive_idea'), str), 'deceptive_idea must be a string.')
        option = dec.get('intended_option')
        need(option is None or isinstance(option, str) and option in choices, 'Deception intended_option must be null or an exact choice key.')
        if export:
            need(bool(dec['deceptive_idea'].strip()), 'A deception has an empty idea.')
    need(isinstance(answer.get('idea'), str), 'answer.idea must be a string.')
    option = answer.get('option')
    need(option is None or isinstance(option, str) and option in choices, 'answer.option must be null or an exact choice key; no automatic conversion is applied.')
    for owner in [*deceptions, answer]:
        need(isinstance(owner.get('bounding_boxes'), list), 'bounding_boxes must be an array.')
        for b in owner['bounding_boxes']:
            need(isinstance(b, dict), 'Each bounding box must be an object.')
            bid = b.get('box_id')
            need(isinstance(bid, str) and bool(bid) and bid not in box_ids, 'Missing or duplicate box_id.')
            box_ids.add(bid)
            x, y, bw, bh = (b.get(k) for k in ('x', 'y', 'width', 'height'))
            need(all(finite(v) for v in (x, y, bw, bh)), 'Box coordinates must be finite numbers.')
            need(x >= 0 and y >= 0 and bw > 0 and bh > 0 and x + bw <= w + 1e-7 and y + bh <= h + 1e-7, 'Bounding box is outside the image or has no area.')
    if export:
        need(bool(d['problem'].strip()), 'Question cannot be blank on export.')
        need(option is not None, 'Choose a reference answer before export.')
        need(bool(answer['idea'].strip()), 'Solution explanation cannot be blank on export.')
    return d

def preserve_contract(old, new):
    """Limit writes to explicitly editable fields, preserving all other source keys."""
    editable = {'problem', 'choices', 'ordered_deceptions', 'answer'}
    for key in (set(old) | set(new)) - editable:
        if key not in old or key not in new or old[key] != new[key]:
            raise Problem(f'Unrelated field cannot be changed by the editor: {key}')
    if set(old['choices']) != set(new['choices']):
        raise Problem('Choice keys must be preserved literally.')
    for key in (set(old['answer']) | set(new['answer'])) - {'option', 'idea', 'bounding_boxes'}:
        if key not in old['answer'] or key not in new['answer'] or old['answer'][key] != new['answer'][key]:
            raise Problem(f'Unrelated answer field cannot be changed: {key}')
    # Unknown keys on surviving objects must not disappear or mutate.
    for collection, identity, allowed in [('ordered_deceptions', 'id', {'id', 'intended_option', 'deceptive_idea', 'bounding_boxes'})]:
        originals = {str(v[identity]): v for v in old[collection]}
        for obj in new[collection]:
            original = originals.get(str(obj[identity]))
            if original:
                for key in (set(original) | set(obj)) - allowed:
                    if key not in original or key not in obj or original[key] != obj[key]:
                        raise Problem(f'Unrelated deception field cannot be changed: {key}')
    original_boxes = {b['box_id']: b for c in [*old['ordered_deceptions'], old['answer']] for b in c['bounding_boxes']}
    for owner in [*new['ordered_deceptions'], new['answer']]:
        for box in owner['bounding_boxes']:
            original = original_boxes.get(box['box_id'])
            if original:
                for key in (set(original) | set(box)) - {'box_id', 'x', 'y', 'width', 'height'}:
                    if key not in original or key not in box or original[key] != box[key]:
                        raise Problem(f'Unrelated box field cannot be changed: {key}')

def image_info(path):
    try:
        with Image.open(path) as img:
            orientation = img.getexif().get(274, 1)
            if orientation != 1:
                raise Problem('Image has EXIF orientation. Normalize it and reconcile annotation coordinates explicitly before importing.')
            img.load()
            return img.size
    except Problem:
        raise
    except Exception as exc:
        raise Problem('Image cannot be decoded or is unsafe to load.') from exc

def validate_image(root, d):
    path = contained(root, d['image']['path'])
    if image_info(path) != (d['image']['width'], d['image']['height']):
        raise Problem('Decoded image dimensions differ from JSON; review the source dimensions/coordinates first.')
    return path

def profile(name, value):
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        raise Problem('Enter an annotator name (up to 200 characters).')
    if not isinstance(value, str):
        raise Problem('Enter an OpenReview profile ID or URL.')
    value = value.strip()
    if not value.startswith('~'):
        url = urlparse(value)
        if url.scheme not in ('https', 'http') or url.hostname != 'openreview.net' or url.path != '/profile':
            raise Problem('Use an OpenReview profile URL or an ID starting with ~.')
        value = parse_qs(url.query).get('id', [''])[0]
    if not re.fullmatch(r'~[^\s/<>?#]{1,200}', value):
        raise Problem('Invalid OpenReview profile ID.')
    return {'name': name.strip(), 'openreview_id': value}

def natural_key(path):
    return [int(s) if s.isdigit() else s.casefold() for s in re.split(r'(\d+)', path)]

def field(obj, dotted):
    for key in dotted.split('.'):
        if isinstance(obj, list) and key.isdecimal():
            obj = obj[int(key)] if int(key) < len(obj) else None
        elif isinstance(obj, dict):
            obj = obj.get(key)
        else:
            return None
    return obj

def parse_response(text):
    a = re.findall(r'<answer>\s*([\s\S]*?)\s*</answer>', text, re.I)
    r = re.findall(r'<reasoning>\s*([\s\S]*?)\s*</reasoning>', text, re.I)
    valid = len(a) == 1 and bool(a[0].strip())
    return {'answer': a[0].strip() if valid else None,
            'reasoning': r[0].strip() if len(r) == 1 else '',
            'malformed': not valid,
            'reasoning_warning': 'Expected at most one reasoning block.' if len(r) > 1 else None}

def match_candidates(records, identity, dataset_field='auto'):
    if not isinstance(identity, (str, int)) or isinstance(identity, bool):
        return []
    value = str(identity)
    if dataset_field != 'auto':
        return [r for r in records if isinstance(field(r['original'], dataset_field), (str, int)) and str(field(r['original'], dataset_field)) == value]
    value = value.replace('\\', '/')
    if value.startswith('./'):
        value = value[2:]
    exact = [r for r in records if value in (r['key'], 'json/' + r['key'])]
    if exact:
        return exact
    exact = [r for r in records if r['original']['image']['path'].replace('\\', '/') == value]
    if exact:
        return exact
    if '/' in value:
        return []
    stem = PurePosixPath(value).stem
    return [r for r in records if stem in (PurePosixPath(r['key']).stem, PurePosixPath(r['original']['image']['path']).stem)]
