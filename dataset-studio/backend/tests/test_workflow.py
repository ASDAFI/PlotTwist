from copy import deepcopy
from pathlib import Path
import hashlib
import json
import zipfile
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app.config import Settings
from app.domain import Problem, contained, load_json, parse_response
from app.main import create_app
from app.service import Service

ACTOR = {'name': 'Test reviewer', 'openreview_id': '~Test_Reviewer1'}

@pytest.fixture
def setup(tmp_path):
    dataset, responses, exports, state = (tmp_path / x for x in ['dataset', 'responses', 'exports', 'state'])
    (dataset / 'images').mkdir(parents=True)
    (dataset / 'json').mkdir()
    responses.mkdir()
    Image.new('RGB', (120, 80), (100, 150, 180)).save(dataset / 'images/020.png')
    record = {
        'image': {'path': 'images/020.png', 'width': 120, 'height': 80, 'extra': 'keep'},
        'source': {'url': None, 'authored_date': None},
        'popularity': {'views': None}, 'problem': 'Who is rich?',
        'choices': {'A': 'Woman A', 'B': 'Woman B'},
        'ordered_deceptions': [{'id': 7, 'intended_option': None, 'deceptive_idea': 'Cash.', 'extra': ['keep'],
             'bounding_boxes': [{'box_id': 'one', 'x': 12.123456789, 'y': 20.2, 'width': 23.4, 'height': 10.5, 'note': 'unchanged'}]}],
        'answer': {'option': 'A', 'idea': 'The logo.', 'bounding_boxes': [], 'source': {'type': None, 'note': None}, 'extra': {'ok': True}},
        'difficulty': None, 'category': None, 'contributor': {'name': 'Original', 'openreview_id': None, 'extra': 9},
        'added_date': None, 'is_ai_generated': False, 'unknown': {'unicode': 'سلام', 'null': None},
    }
    raw = (json.dumps(record, ensure_ascii=False, indent=4) + '\n\n').encode()
    (dataset / 'json/020.json').write_bytes(raw)
    return Settings(dataset, responses, exports, state), record, raw

def opened(setup):
    settings, record, raw = setup
    svc = Service(settings)
    ws = svc.open_workspace('.', '.', ACTOR)
    item = svc.list_items(ws['id'])['items'][0]
    return svc, ws['id'], item

def run_export(svc, wid, name='review'):
    job = svc.export_request(wid, '.', name)
    svc.run_export(wid, job['id'])
    return svc.job(wid, job['id'])

def test_unchanged_export_is_byte_exact_and_images_unchanged(setup):
    svc, wid, item = opened(setup)
    settings, original, raw = setup
    result = run_export(svc, wid)
    assert result['status'] == 'succeeded', result
    assert (settings.exports_root / 'review/json/020.json').read_bytes() == raw
    assert (settings.dataset_root / 'json/020.json').read_bytes() == raw
    assert (settings.exports_root / 'review/images/020.png').read_bytes() == (settings.dataset_root / 'images/020.png').read_bytes()
    path, name = svc.archive(wid, result['id'])
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == 2
    with pytest.raises(Problem):
        svc.export_request(wid, '.', 'review')

def test_edit_persists_with_conflicts_and_preserves_unknown_fields(setup):
    svc, wid, item = opened(setup)
    edited = deepcopy(item['data'])
    edited['problem'] = 'Which woman is rich?'
    saved = svc.save_item(wid, item['id'], edited, False, item['version'], ACTOR)
    assert saved['version'] == 2
    with pytest.raises(Problem) as exc:
        svc.save_item(wid, item['id'], item['data'], False, 1, ACTOR)
    assert exc.value.status == 409
    restarted = Service(setup[0])
    assert restarted.list_items(wid)['items'][0]['data']['problem'] == edited['problem']
    result = run_export(restarted, wid)
    out = load_json((setup[0].exports_root / 'review/json/020.json').read_bytes())
    expected = deepcopy(edited)
    expected['contributor'].update(ACTOR)
    assert out == expected
    assert out['answer']['option'] == 'A'
    assert out['ordered_deceptions'][0]['bounding_boxes'][0]['x'] == 12.123456789
    assert setup[0].dataset_root.joinpath('json/020.json').read_bytes() == setup[2]

def test_reject_lossy_projection_or_choice_renumbering(setup):
    svc, wid, item = opened(setup)
    bad = deepcopy(item['data'])
    del bad['unknown']
    with pytest.raises(Problem):
        svc.save_item(wid, item['id'], bad, False, 1, ACTOR)
    bad = deepcopy(item['data'])
    bad['choices'] = {'1': 'Woman A', '2': 'Woman B'}
    bad['answer']['option'] = '1'
    with pytest.raises(Problem):
        svc.save_item(wid, item['id'], bad, False, 1, ACTOR)

def test_paths_and_symlinks_are_contained(setup, tmp_path):
    svc, wid, item = opened(setup)
    for p in ['../secret', '/etc/passwd', 'images/../../x', 'C:\\a']:
        with pytest.raises(Problem):
            contained(setup[0].dataset_root, p)
    outside = tmp_path / 'outside'
    outside.mkdir()
    (setup[0].dataset_root / 'escape').symlink_to(outside, target_is_directory=True)
    with pytest.raises(Problem):
        contained(setup[0].dataset_root, 'escape')
    with pytest.raises(RuntimeError):
        Settings(setup[0].dataset_root, setup[0].responses_root, setup[0].dataset_root / 'exports', setup[0].state_root).prepare()

def test_invalid_image_dimensions_block_import(setup):
    settings, record, raw = setup
    record['image']['width'] = 121
    settings.dataset_root.joinpath('json/020.json').write_text(json.dumps(record))
    with pytest.raises(Problem) as exc:
        Service(settings).open_workspace('.', '.', ACTOR)
    assert 'no records were silently skipped' in str(exc.value)
    assert 'dimensions' in exc.value.details['errors'][0]['message']

def test_failed_export_is_not_published(setup):
    svc, wid, item = opened(setup)
    setup[0].dataset_root.joinpath('images/020.png').write_bytes(b'broken image')
    result = run_export(svc, wid)
    assert result['status'] == 'failed'
    assert not setup[0].exports_root.joinpath('review').exists()
    assert not list(setup[0].exports_root.glob('.plottwist-stage-*'))

def test_exclusion_keeps_shared_images_and_can_be_restored(setup):
    settings, record, raw = setup
    settings.dataset_root.joinpath('json/021.json').write_bytes(raw)
    svc, wid, first = opened(setup)
    deleted = svc.save_item(wid, first['id'], first['data'], True, 1, ACTOR)
    result = run_export(svc, wid)
    assert result['status'] == 'succeeded'
    assert result['result']['items'] == 1
    assert not settings.exports_root.joinpath('review/json/020.json').exists()
    assert settings.exports_root.joinpath('review/images/020.png').exists()
    svc.save_item(wid, first['id'], first['data'], False, deleted['version'], ACTOR)
    assert sum(not i['deleted'] for i in svc.list_items(wid)['items']) == 2

def test_response_mapping_stages_import_and_preserves_all_trials(setup):
    settings, record, raw = setup
    second = deepcopy(record)
    second['problem'] = 'Whose logo is fake?'
    settings.dataset_root.joinpath('json/other.json').write_text(json.dumps(second))
    rows = [
        {'item_id': 'json/020.json', 'visible_output': '<reasoning>Clue.</reasoning><answer> B </answer>'},
        {'item_id': 'images/020.png', 'visible_output': '<answer>A</answer>'},
        {'item_id': 'json/020.json', 'visible_output': '<answer>Person A</answer>'},
        {'visible_output': '<answer>A</answer>'},
        {'item_id': 'json/other.json', 'visible_output': '<answer></answer>'},
    ]
    settings.responses_root.joinpath('model.jsonl').write_text('\n'.join(json.dumps(r) for r in rows) + '\nnot json\n')
    svc, wid, item = opened(setup)
    mapping = {'field': 'item_id', 'dataset_field': 'auto'}
    job = svc.create_job(wid, 'responses', mapping)
    svc.import_responses(wid, job['id'], mapping)
    report = svc.job(wid, job['id'])
    assert report['status'] == 'succeeded'
    assert report['result']['ambiguous'] == 1
    assert report['result']['unmatched'] == 1
    assert report['result']['invalid'] == 1
    assert report['result']['repeated'] == 1
    assert report['result']['out_of_choices'] == 1
    assert svc.responses(wid, item['id'])['total'] == 0
    svc.accept_import(wid, job['id'])
    matched = svc.responses(wid, item['id'])['rows']
    assert [r['answer'] for r in matched] == ['B', 'Person A']
    assert matched[0]['raw'] == rows[0]

def test_repeated_or_missing_answer_is_not_guessed():
    assert parse_response('<answer>A</answer><answer>B</answer>')['malformed']
    assert parse_response('<answer> </answer>')['malformed']
    assert parse_response('A')['answer'] is None

def test_real_api_round_trip(setup):
    with TestClient(create_app(setup[0])) as client:
        assert client.get('/api/health').json()['persistent'] is True
        ws = client.post('/api/workspaces', json={'actor': ACTOR}).json()
        items = client.get(f"/api/workspaces/{ws['id']}/items").json()['items']
        item = items[0]
        d = deepcopy(item['data'])
        d['problem'] = 'Edited through HTTP'
        url = f"/api/workspaces/{ws['id']}/items/{item['id']}"
        r = client.put(url, json={'data': d, 'deleted': False, 'version': 1, 'actor': ACTOR})
        assert r.status_code == 200, r.text
        assert client.put(url, json={'data': d, 'version': 1, 'actor': ACTOR}).status_code == 409
        assert client.get(url + '/image').status_code == 200
        assert client.get(url + '/thumbnail').headers['content-type'] == 'image/webp'
        assert client.post('/api/workspaces', json={'actor': ACTOR}, headers={'Origin': 'https://evil.example'}).status_code == 403
        job = client.post(f"/api/workspaces/{ws['id']}/exports", json={'name': 'api-export'}).json()
        result = client.get(f"/api/workspaces/{ws['id']}/jobs/{job['id']}").json()
        assert result['status'] == 'succeeded', result
        assert client.get(f"/api/workspaces/{ws['id']}/exports/{job['id']}/download").status_code == 200

def test_numeric_choice_keys_keep_source_order_through_browser_reordering(setup):
    settings, record, raw = setup
    record['choices'] = {'2': 'Woman B', '1': 'Woman A', '01': 'Literal zero-padded option'}
    record['answer']['option'] = '1'
    settings.dataset_root.joinpath('json/020.json').write_text(json.dumps(record))
    svc, wid, item = opened(setup)
    changed = deepcopy(item['data'])
    changed['choices'] = {k: changed['choices'][k] for k in ['1', '2', '01']}
    changed['problem'] = 'Edited in a JavaScript browser'
    svc.save_item(wid, item['id'], changed, False, 1, ACTOR)
    result = run_export(svc, wid)
    assert result['status'] == 'succeeded'
    out = load_json(settings.exports_root.joinpath('review/json/020.json').read_bytes())
    assert list(out['choices']) == ['2', '1', '01']
    assert out['answer']['option'] == '1'
