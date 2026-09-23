from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4
from copy import deepcopy
import ctypes
import errno
import io
import json
import os
import shutil
import sys
import zipfile
from PIL import Image
from .domain import (Problem, contained, relative_path, load_json, dumps, sha256_bytes, file_hash,
                     validate_record, validate_image, preserve_contract, profile, natural_key,
                     parse_response, match_candidates, field)
from .storage import Store


def now():
    return datetime.now(timezone.utc).isoformat()


def fsync_dir(path):
    if os.name == 'posix':
        fd = os.open(path, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def rename_new(source, destination):
    """No-clobber atomic publication on Linux (the Docker runtime)."""
    if sys.platform.startswith('linux'):
        libc = ctypes.CDLL(None, use_errno=True)
        renameat2 = getattr(libc, 'renameat2', None)
        if renameat2:
            renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
            result = renameat2(-100, os.fsencode(source), -100, os.fsencode(destination), 1)
            if result:
                code = ctypes.get_errno()
                raise OSError(code, os.strerror(code), str(destination))
            return
    raise Problem('Atomic no-replace exports require Linux with renameat2. Run the Docker application.')


class Service:
    def __init__(self, settings):
        settings.prepare()
        self.settings = settings
        self.store = Store(settings.state_root)
        self.recover_jobs()

    def workspace(self, wid):
        with self.store.connection() as db:
            row = db.execute('SELECT * FROM workspaces WHERE id=?', (wid,)).fetchone()
        if row is None:
            raise Problem('Workspace not found.', 404)
        return dict(row)

    def dataset_root(self, workspace):
        return contained(self.settings.dataset_root, workspace['dataset_rel'])

    def browse(self, root_name, rel):
        roots = {'dataset': self.settings.dataset_root, 'responses': self.settings.responses_root, 'exports': self.settings.exports_root}
        if root_name not in roots:
            raise Problem('Unknown mounted root.')
        root, rel = roots[root_name], relative_path(rel, allow_root=True)
        path = contained(root, rel)
        if not path.is_dir():
            raise Problem('Select a directory.')
        directories = []
        for entry in sorted(path.iterdir(), key=lambda p: natural_key(p.name)):
            if entry.name.startswith('.'):
                continue
            if entry.is_dir() and entry.resolve().is_relative_to(root):
                directories.append({'name': entry.name, 'path': entry.relative_to(root).as_posix()})
        return {'root': root_name, 'path': rel, 'directories': directories,
                'is_dataset': (path / 'images').is_dir() and (path / 'json').is_dir(),
                'jsonl_count': sum(1 for p in path.glob('*.jsonl') if p.is_file())}

    def open_workspace(self, dataset_rel, responses_rel, actor):
        actor = profile(actor['name'], actor['openreview_id'])
        rel = relative_path(dataset_rel, allow_root=True)
        root = contained(self.settings.dataset_root, rel)
        if not root.is_dir() or not (root / 'json').is_dir() or not (root / 'images').is_dir():
            raise Problem('Select a dataset folder containing images/ and json/.')
        if responses_rel is not None:
            responses_rel = relative_path(responses_rel, allow_root=True)
            if not contained(self.settings.responses_root, responses_rel).is_dir():
                raise Problem('Response folder is not a directory.')
        paths = sorted((root / 'json').rglob('*.json'), key=lambda p: natural_key(p.relative_to(root).as_posix()))
        if not paths:
            raise Problem('No JSON records were found.')
        collected, errors, images, hash_cache = [], [], set(), {}
        for p in paths:
            key = p.relative_to(root / 'json').as_posix()
            try:
                p = contained(root, 'json/' + key)
                if p.stat().st_size > self.settings.max_json_bytes:
                    raise Problem('JSON record is larger than the configured 10 MB limit.')
                raw = p.read_bytes()
                d = validate_record(load_json(raw))
                image_path = contained(root, d['image']['path'])
                signature = (d['image']['path'], d['image']['width'], d['image']['height'])
                if signature not in hash_cache:
                    validate_image(root, d)
                    hash_cache[signature] = file_hash(image_path)
                images.add(d['image']['path'])
                collected.append((key, raw, d, hash_cache[signature]))
            except (Problem, OSError) as exc:
                errors.append({'file': 'json/' + key, 'message': str(exc)})
        if errors:
            raise Problem('Dataset validation failed; no records were silently skipped.', details={'errors': errors})
        warnings = []
        orphans = sorted(p.relative_to(root).as_posix() for p in (root / 'images').rglob('*') if p.is_file() and p.relative_to(root).as_posix() not in images)
        if orphans:
            warnings.append({'message': 'Unreferenced images are not exported.', 'files': orphans})
        with self.store.connection(immediate=True) as db:
            existing = db.execute('SELECT * FROM workspaces WHERE dataset_rel=?', (rel,)).fetchone()
            if existing:
                wid = existing['id']
                current = {r['relative_key']: r for r in db.execute('SELECT * FROM items WHERE workspace_id=?', (wid,))}
                source_changed = [key for key, raw, _, ih in collected if key in current and (current[key]['source_hash'] != sha256_bytes(raw) or current[key]['image_hash'] != ih)]
                missing = set(current) - {v[0] for v in collected}
                if source_changed or missing:
                    raise Problem('Source files changed since this workspace was opened. Restore the sources or open a separately named copy; saved edits were retained.', 409, {'changed': source_changed, 'missing': sorted(missing)})
                if existing['responses_rel'] != responses_rel:
                    db.execute('UPDATE workspaces SET active_import_id=NULL WHERE id=?', (wid,))
                db.execute('UPDATE workspaces SET responses_rel=? WHERE id=?', (responses_rel, wid))
            else:
                wid = uuid4().hex
                current = {}
                db.execute('INSERT INTO workspaces(id,dataset_rel,responses_rel,created_at) VALUES(?,?,?,?)', (wid, rel, responses_rel, now()))
            added = False
            for key, raw, d, ih in collected:
                if key in current:
                    continue
                added = True
                db.execute('INSERT INTO items(id,workspace_id,relative_key,original_bytes,source_hash,image_hash,data_json,updated_at) VALUES(?,?,?,?,?,?,?,?)',
                           (uuid4().hex, wid, key, raw, sha256_bytes(raw), ih, dumps(d), now()))
            if added and existing:
                db.execute('UPDATE workspaces SET active_import_id=NULL WHERE id=?', (wid,))
        return {'id': wid, 'name': root.name, 'count': len(collected), 'warnings': warnings,
                'responses_rel': responses_rel, 'resumed': bool(existing), 'actor': actor}

    @staticmethod
    def public_item(row):
        d = load_json(row['data_json'])
        original = load_json(row['original_bytes'])
        base = f"/api/workspaces/{row['workspace_id']}/items/{row['id']}"
        return {'id': row['id'], 'key': row['relative_key'], 'data': d,
                'imageUrl': base + '/image', 'thumbnailUrl': base + '/thumbnail',
                'version': row['version'], 'changed': bool(row['modified']), 'deleted': bool(row['deleted']),
                'originalProblem': original['problem'], 'lastEditor': load_json(row['editor_json']) if row['editor_json'] else None}

    def item_row(self, wid, iid):
        with self.store.connection() as db:
            row = db.execute('SELECT * FROM items WHERE workspace_id=? AND id=?', (wid, iid)).fetchone()
        if row is None:
            raise Problem('Item not found.', 404)
        return dict(row)

    def list_items(self, wid, offset=0, limit=100):
        self.workspace(wid)
        with self.store.connection() as db:
            rows = sorted(db.execute('SELECT * FROM items WHERE workspace_id=?', (wid,)).fetchall(), key=lambda r: natural_key(r['relative_key']))
        return {'total': len(rows), 'offset': offset, 'items': [self.public_item(r) for r in rows[offset:offset+limit]]}

    def save_item(self, wid, iid, data, deleted, version, actor):
        actor = profile(actor['name'], actor['openreview_id'])
        validate_record(data)
        with self.store.connection(immediate=True) as db:
            row = db.execute('SELECT * FROM items WHERE workspace_id=? AND id=?', (wid, iid)).fetchone()
            if row is None:
                raise Problem('Item not found.', 404)
            if version != row['version']:
                raise Problem('This item was saved by another editor. Your local draft has been kept.', 409, {'current': self.public_item(row)})
            old, original = load_json(row['data_json']), load_json(row['original_bytes'])
            preserve_contract(old, data)
            # JavaScript enumerates integer-looking keys in numeric order.
            # Restore source choice ordering without altering any key or value.
            data = deepcopy(data)
            data['choices'] = {key: data['choices'][key] for key in old['choices']}
            if old == data and bool(row['deleted']) == deleted:
                return self.public_item(row)
            modified = data != original
            db.execute('INSERT INTO history(item_id,previous_data,previous_deleted,actor_json,version,created_at) VALUES(?,?,?,?,?,?)',
                       (iid, row['data_json'], row['deleted'], dumps(actor), row['version'], now()))
            editor = dumps(actor) if old != data else row['editor_json']
            db.execute('UPDATE items SET data_json=?,deleted=?,modified=?,editor_json=?,version=version+1,updated_at=? WHERE id=?',
                       (dumps(data), int(deleted), int(modified), editor, now(), iid))
            saved = db.execute('SELECT * FROM items WHERE id=?', (iid,)).fetchone()
        return self.public_item(saved)

    def image_path(self, wid, iid):
        row = self.item_row(wid, iid)
        return contained(self.dataset_root(self.workspace(wid)), load_json(row['original_bytes'])['image']['path'])

    def thumbnail(self, wid, iid):
        path = self.image_path(wid, iid)
        with Image.open(path) as img:
            img.thumbnail((160, 120))
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGB')
            out = io.BytesIO()
            img.save(out, format='WEBP', quality=75)
            return out.getvalue()

    def create_job(self, wid, kind, request):
        self.workspace(wid)
        jid = uuid4().hex
        with self.store.connection(immediate=True) as db:
            if kind == 'export':
                # Prevent two workers in this application from targeting the same final path.
                final = request['destination']
                for job in db.execute("SELECT request_json FROM jobs WHERE kind='export' AND status IN ('queued','running','publishing')"):
                    if load_json(job['request_json'])['destination'] == final:
                        raise Problem('An export to this destination is already running.', 409)
            db.execute('INSERT INTO jobs(id,workspace_id,kind,status,request_json,created_at) VALUES(?,?,?,?,?,?)',
                       (jid, wid, kind, 'queued', dumps(request), now()))
        return self.job(wid, jid)

    def job(self, wid, jid):
        with self.store.connection() as db:
            row = db.execute('SELECT * FROM jobs WHERE workspace_id=? AND id=?', (wid, jid)).fetchone()
        if not row:
            raise Problem('Job not found.', 404)
        result = load_json(row['result_json']) if row['result_json'] else None
        if result:
            result.pop('checksums', None)
        return {'id': jid, 'kind': row['kind'], 'status': row['status'], 'progress': row['progress'], 'total': row['total'], 'result': result, 'error': row['error']}

    def update_job(self, jid, **values):
        allowed = {'status', 'progress', 'total', 'result_json', 'error', 'cancel_requested'}
        assert set(values) <= allowed
        with self.store.connection() as db:
            db.execute('UPDATE jobs SET ' + ','.join(f'{k}=?' for k in values) + ' WHERE id=?', [*values.values(), jid])

    def cancelled(self, jid):
        with self.store.connection() as db:
            row = db.execute('SELECT cancel_requested FROM jobs WHERE id=?', (jid,)).fetchone()
        if row and row[0]:
            raise Problem('Cancelled by the user.', 409)

    def import_responses(self, wid, jid, mapping):
        try:
            self.update_job(jid, status='running')
            ws = self.workspace(wid)
            if ws['responses_rel'] is None:
                raise Problem('No model-response folder is selected.')
            root = contained(self.settings.responses_root, ws['responses_rel'])
            with self.store.connection() as db:
                records = [{'id': row['id'], 'key': row['relative_key'], 'original': load_json(row['original_bytes'])} for row in db.execute('SELECT * FROM items WHERE workspace_id=?', (wid,))]
            stats = {'total': 0, 'matched': 0, 'unmatched': 0, 'ambiguous': 0, 'invalid': 0, 'malformed': 0, 'out_of_choices': 0, 'repeated': 0, 'files': []}
            seen = set()
            paths = sorted(root.rglob('*.jsonl'), key=lambda p: natural_key(p.relative_to(root).as_posix()))
            if not paths:
                raise Problem('No JSONL response files were found.')
            self.update_job(jid, total=len(paths))
            for file_index, path in enumerate(paths):
                path = contained(root, path.relative_to(root).as_posix())
                before = path.stat()
                digest = __import__('hashlib').sha256()
                filename = path.relative_to(root).as_posix()
                pending = []
                with path.open('rb') as stream:
                    line_no = 0
                    while True:
                        line = stream.readline(self.settings.max_response_line_bytes + 1)
                        if not line:
                            break
                        line_no += 1
                        digest.update(line)
                        if len(line) > self.settings.max_response_line_bytes:
                            raise Problem(f'{filename}:{line_no}: line exceeds 8 MB.')
                        if not line.strip():
                            continue
                        self.cancelled(jid)
                        stats['total'] += 1
                        raw, text, answer, reasoning, error, item_id = None, None, None, None, None, None
                        match_status, parse_status = 'invalid', 'invalid'
                        try:
                            raw = load_json(line)
                            if not isinstance(raw, dict) or not isinstance(raw.get('visible_output'), str):
                                raise Problem('Missing visible_output string.')
                            text = raw['visible_output']
                            parsed = parse_response(text)
                            answer, reasoning = parsed['answer'], parsed['reasoning']
                            parse_status = 'malformed' if parsed['malformed'] else 'parsed'
                            error = 'Expected one complete, nonempty answer block.' if parsed['malformed'] else parsed['reasoning_warning']
                            candidates = match_candidates(records, field(raw, mapping['field']), mapping.get('dataset_field', 'auto'))
                            if mapping.get('question_field'):
                                q = field(raw, mapping['question_field'])
                                candidates = [r for r in candidates if q is not None and field(r['original'], mapping.get('dataset_question_field', 'problem')) == q]
                            if len(candidates) == 1:
                                record = candidates[0]
                                item_id, match_status = record['id'], 'matched'
                                if answer and answer not in record['original']['choices']:
                                    parse_status = 'out_of_choices'
                                signature = (filename, item_id)
                                if signature in seen:
                                    stats['repeated'] += 1
                                seen.add(signature)
                            else:
                                match_status = 'ambiguous' if candidates else 'unmatched'
                            stats[match_status] += 1
                            if parse_status in ('malformed', 'out_of_choices'):
                                stats[parse_status] += 1
                        except Problem as exc:
                            error = str(exc)
                            stats['invalid'] += 1
                        pending.append((jid, item_id, filename, line_no, path.stem, match_status, parse_status, text, answer, reasoning, dumps(raw) if raw is not None else None, error))
                        if len(pending) >= 100:
                            self._insert_responses(pending)
                            pending = []
                self._insert_responses(pending)
                after = path.stat()
                if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                    raise Problem(f'{filename} changed while importing; retry with a stable file.')
                stats['files'].append({'filename': filename, 'sha256': digest.hexdigest()})
                self.update_job(jid, progress=file_index+1)
            self.update_job(jid, status='succeeded', result_json=dumps(stats))
            # Imports are staged. The mapping preview must be accepted explicitly.
        except Exception as exc:
            self.update_job(jid, status='cancelled' if str(exc).startswith('Cancelled') else 'failed', error=str(exc))

    def _insert_responses(self, pending):
        if pending:
            with self.store.connection() as db:
                db.executemany('INSERT INTO response_rows(import_id,item_id,filename,line_number,model,match_status,parse_status,visible_output,answer,reasoning,raw_json,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', pending)

    def accept_import(self, wid, jid):
        with self.store.connection(immediate=True) as db:
            row = db.execute("SELECT * FROM jobs WHERE id=? AND workspace_id=? AND kind='responses' AND status='succeeded'", (jid, wid)).fetchone()
            if not row:
                raise Problem('Only a completed response import can be accepted.')
            db.execute('UPDATE workspaces SET active_import_id=?,mapping_json=? WHERE id=?', (jid, row['request_json'], wid))
        return {'accepted': True, 'id': jid}

    def responses(self, wid, iid=None, import_id=None, offset=0, limit=100):
        ws = self.workspace(wid)
        jid = import_id or ws['active_import_id']
        if not jid:
            return {'rows': [], 'total': 0, 'report': None}
        self.job(wid, jid)
        with self.store.connection() as db:
            where, args = 'import_id=?', [jid]
            if iid:
                where += ' AND item_id=?'
                args.append(iid)
            total = db.execute('SELECT count(*) FROM response_rows WHERE ' + where, args).fetchone()[0]
            rows = db.execute('SELECT * FROM response_rows WHERE ' + where + ' ORDER BY filename,line_number LIMIT ? OFFSET ?', [*args, limit, offset]).fetchall()
        return {'total': total, 'report': self.job(wid, jid), 'rows': [
            {'model': r['model'], 'filename': r['filename'], 'line': r['line_number'],
             'raw': load_json(r['raw_json']) if r['raw_json'] else {}, 'text': r['visible_output'] or '',
             'answer': r['answer'], 'reasoning': r['reasoning'] or '', 'malformed': r['parse_status'] in ('invalid', 'malformed'),
             'matchKey': r['item_id'], 'matchStatus': r['match_status'], 'parseStatus': r['parse_status'], 'error': r['error']}
            for r in rows]}

    def export_request(self, wid, parent, name):
        import re
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', name):
            raise Problem('Use a simple export folder name (letters, digits, hyphens, underscores; maximum 100 characters).')
        parent_path = contained(self.settings.exports_root, parent)
        if not parent_path.is_dir():
            raise Problem('Select an export directory.')
        final = parent_path / name
        if final.exists():
            raise Problem('The export destination already exists; choose a new name.', 409)
        return self.create_job(wid, 'export', {'destination': final.relative_to(self.settings.exports_root).as_posix()})

    def run_export(self, wid, jid):
        stage = None
        published = False
        try:
            self.update_job(jid, status='running')
            ws = self.workspace(wid)
            root = self.dataset_root(ws)
            with self.store.connection() as db:
                request = load_json(db.execute('SELECT request_json FROM jobs WHERE id=?', (jid,)).fetchone()[0])
                # Immutable snapshot: later editor saves cannot change this export.
                rows = [dict(r) for r in db.execute('SELECT * FROM items WHERE workspace_id=?', (wid,))]
            retained = [r for r in rows if not r['deleted']]
            if not retained:
                raise Problem('There are no retained items to export.')
            final = contained(self.settings.exports_root, request['destination'], must_exist=False)
            if final.exists():
                raise Problem('The export destination already exists.', 409)
            stage = final.parent / ('.plottwist-stage-' + jid)
            stage.mkdir(mode=0o700)
            (stage / 'images').mkdir()
            (stage / 'json').mkdir()
            self.update_job(jid, total=len(retained))
            copied_images, checksums = {}, {}
            for n, row in enumerate(retained):
                self.cancelled(jid)
                d = validate_record(load_json(row['data_json']), export=True)
                raw_source = contained(root, 'json/' + row['relative_key']).read_bytes()
                if sha256_bytes(raw_source) != row['source_hash']:
                    raise Problem(f"json/{row['relative_key']} changed outside this workspace. Reconcile it before exporting.")
                image_rel = relative_path(d['image']['path'])
                image_source = validate_image(root, d)
                if image_rel in copied_images:
                    if copied_images[image_rel] != row['image_hash']:
                        raise Problem('Conflicting source image fingerprints.')
                else:
                    image_target = stage / image_rel
                    image_target.parent.mkdir(parents=True, exist_ok=True)
                    digest = __import__('hashlib').sha256()
                    with image_source.open('rb') as src, image_target.open('xb') as out:
                        for block in iter(lambda: src.read(1024 * 1024), b''):
                            self.cancelled(jid)
                            out.write(block)
                            digest.update(block)
                        out.flush()
                        os.fsync(out.fileno())
                    if digest.hexdigest() != row['image_hash']:
                        raise Problem(f'{image_rel} changed outside this workspace.')
                    checksums[image_rel] = copied_images[image_rel] = digest.hexdigest()
                target_rel = 'json/' + relative_path(row['relative_key'])
                target = stage / target_rel
                target.parent.mkdir(parents=True, exist_ok=True)
                if row['modified']:
                    actor = load_json(row['editor_json'])
                    d = deepcopy(d)
                    d['contributor'] = {**d['contributor'], **actor}
                    raw = (json.dumps(d, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode('utf-8')
                else:
                    raw = bytes(row['original_bytes'])
                with target.open('xb') as out:
                    out.write(raw)
                    out.flush()
                    os.fsync(out.fileno())
                checksums[target_rel] = sha256_bytes(raw)
                validate_record(load_json(target.read_bytes()), export=True)
                self.update_job(jid, progress=n+1)
            self.cancelled(jid)
            # Receipt lives in SQLite, never in the exported dataset.
            receipt = {'destination': request['destination'], 'items': len(retained), 'images': len(copied_images),
                       'excluded': len(rows)-len(retained), 'checksums': checksums,
                       'revisions': {r['id']: r['version'] for r in retained}}
            for folder in sorted([p for p in stage.rglob('*') if p.is_dir()], key=lambda p: len(p.parts), reverse=True):
                fsync_dir(folder)
            fsync_dir(stage)
            self.update_job(jid, status='publishing', result_json=dumps(receipt))
            rename_new(stage, final)
            published = True
            fsync_dir(final.parent)
            self.update_job(jid, status='succeeded')
        except Exception as exc:
            if not published:
                self.update_job(jid, status='cancelled' if str(exc).startswith('Cancelled') else 'failed', error=str(exc))
            # If rename succeeded but final bookkeeping failed, recovery verifies the receipt.
        finally:
            if stage and stage.exists() and not published:
                shutil.rmtree(stage)

    def archive(self, wid, jid):
        job = self.job(wid, jid)
        if job['kind'] != 'export' or job['status'] != 'succeeded':
            raise Problem('Export is not complete.', 409)
        root = contained(self.settings.exports_root, job['result']['destination'])
        with self.store.connection() as db:
            receipt = load_json(db.execute('SELECT result_json FROM jobs WHERE id=?', (jid,)).fetchone()[0])
        cache = self.settings.state_root / 'archives'
        cache.mkdir(exist_ok=True)
        target = cache / (jid + '.zip')
        # Revalidate a completed export before packaging, including containment.
        for path, digest in receipt['checksums'].items():
            if file_hash(contained(root, path)) != digest:
                raise Problem('Export files changed after completion; generate a fresh export.', 409)
        if not target.exists():
            temp = cache / (jid + '-' + uuid4().hex + '.tmp')
            try:
                with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                    for rel in sorted(receipt['checksums']):
                        archive.write(contained(root, rel), root.name + '/' + rel)
                os.replace(temp, target)
            finally:
                temp.unlink(missing_ok=True)
        return target, root.name + '.zip'

    def recover_jobs(self):
        with self.store.connection() as db:
            jobs = [dict(row) for row in db.execute("SELECT * FROM jobs WHERE status IN ('queued','running','publishing')")]
        for job in jobs:
            recovered = False
            if job['kind'] == 'export':
                request = load_json(job['request_json'])
                final = contained(self.settings.exports_root, request['destination'], must_exist=False)
                if job['status'] == 'publishing' and job['result_json'] and final.is_dir():
                    receipt = load_json(job['result_json'])
                    try:
                        recovered = bool(receipt['checksums']) and all(file_hash(contained(final, p)) == h for p, h in receipt['checksums'].items())
                    except (Problem, OSError):
                        recovered = False
                stage = final.parent / ('.plottwist-stage-' + job['id'])
                if stage.is_dir() and not stage.is_symlink():
                    shutil.rmtree(stage)
            self.update_job(job['id'], status='succeeded' if recovered else 'interrupted', error=None if recovered else 'Interrupted by application restart. No source files were modified; start a new job.')
