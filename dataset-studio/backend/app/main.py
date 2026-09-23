from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI, BackgroundTasks, Query, Request
from fastapi.responses import JSONResponse, FileResponse, Response
from pydantic import BaseModel, Field, ConfigDict
from .config import Settings
from .domain import Problem
from .service import Service

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class Actor(StrictModel):
    name: str = Field(max_length=200)
    openreview_id: str = Field(max_length=500)

class OpenWorkspace(StrictModel):
    dataset: str = '.'
    responses: str | None = '.'
    actor: Actor

class SaveItem(StrictModel):
    data: dict[str, Any]
    deleted: bool = False
    version: int = Field(ge=1)
    actor: Actor

class Mapping(StrictModel):
    field: str = Field(default='image.path', min_length=1, max_length=200)
    dataset_field: str = Field(default='auto', min_length=1, max_length=200)
    question_field: str = Field(default='', max_length=200)
    dataset_question_field: str = Field(default='problem', max_length=200)

class Export(StrictModel):
    parent: str = '.'
    name: str = Field(min_length=1, max_length=100)


def create_app(settings: Settings | None = None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.service = Service(settings or Settings.from_env())
        yield

    app = FastAPI(title='PlotTwist Studio', version='1.0.0', lifespan=lifespan)
    # Local deployment boundary: same-origin requests + explicit JSON bodies.
    # No CORS wildcard, no forwarded-host trust, and no arbitrary filesystem roots.
    @app.middleware('http')
    async def origin_guard(request: Request, call_next):
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('origin')
            if origin:
                from urllib.parse import urlsplit
                parsed = urlsplit(origin)
                if parsed.netloc != request.headers.get('host'):
                    return JSONResponse({'message': 'Cross-origin writes are not allowed.'}, status_code=403)
        return await call_next(request)

    @app.exception_handler(Problem)
    async def problem_handler(request, exc):
        return JSONResponse({'message': str(exc), 'details': exc.details}, status_code=exc.status)

    @app.exception_handler(OSError)
    async def io_handler(request, exc):
        return JSONResponse({'message': 'A filesystem operation failed. Check mounted paths, permissions, and free space.'}, status_code=500)

    def service(request):
        return request.app.state.service

    @app.get('/api/health')
    def health():
        return {'service': 'plottwist', 'status': 'ok', 'version': '1.0.0', 'persistent': True}

    @app.get('/api/roots')
    def roots():
        return {'roots': [{'id': 'dataset', 'label': 'Dataset mount', 'writable': False},
                          {'id': 'responses', 'label': 'Model-output mount', 'writable': False},
                          {'id': 'exports', 'label': 'Export mount', 'writable': True}]}

    @app.get('/api/directories')
    def directories(request: Request, root: str, path: str = '.'):
        return service(request).browse(root, path)

    @app.post('/api/workspaces')
    def open_workspace(body: OpenWorkspace, request: Request):
        return service(request).open_workspace(body.dataset, body.responses, body.actor.model_dump())

    @app.get('/api/workspaces/{wid}/items')
    def items(wid: str, request: Request, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
        return service(request).list_items(wid, offset, limit)

    @app.get('/api/workspaces/{wid}/items/{iid}')
    def item(wid: str, iid: str, request: Request):
        return service(request).public_item(service(request).item_row(wid, iid))

    @app.put('/api/workspaces/{wid}/items/{iid}')
    def save(wid: str, iid: str, body: SaveItem, request: Request):
        return service(request).save_item(wid, iid, body.data, body.deleted, body.version, body.actor.model_dump())

    @app.get('/api/workspaces/{wid}/items/{iid}/image')
    def image(wid: str, iid: str, request: Request):
        return FileResponse(service(request).image_path(wid, iid), headers={'X-Content-Type-Options': 'nosniff'})

    @app.get('/api/workspaces/{wid}/items/{iid}/thumbnail')
    def thumbnail(wid: str, iid: str, request: Request):
        return Response(service(request).thumbnail(wid, iid), media_type='image/webp', headers={'Cache-Control': 'private, max-age=300'})

    @app.post('/api/workspaces/{wid}/response-imports', status_code=202)
    def import_responses(wid: str, body: Mapping, tasks: BackgroundTasks, request: Request):
        svc = service(request)
        job = svc.create_job(wid, 'responses', body.model_dump())
        tasks.add_task(svc.import_responses, wid, job['id'], body.model_dump())
        return job

    @app.post('/api/workspaces/{wid}/response-imports/{jid}/accept')
    def accept(wid: str, jid: str, request: Request):
        return service(request).accept_import(wid, jid)

    @app.get('/api/workspaces/{wid}/responses')
    def responses(wid: str, request: Request, item_id: str | None = None, import_id: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500)):
        return service(request).responses(wid, item_id, import_id, offset, limit)

    @app.post('/api/workspaces/{wid}/exports', status_code=202)
    def export(wid: str, body: Export, tasks: BackgroundTasks, request: Request):
        svc = service(request)
        job = svc.export_request(wid, body.parent, body.name)
        tasks.add_task(svc.run_export, wid, job['id'])
        return job

    @app.get('/api/workspaces/{wid}/jobs/{jid}')
    def job(wid: str, jid: str, request: Request):
        return service(request).job(wid, jid)

    @app.post('/api/workspaces/{wid}/jobs/{jid}/cancel')
    def cancel(wid: str, jid: str, request: Request):
        svc = service(request)
        found = svc.job(wid, jid)
        if found['status'] not in ('queued', 'running'):
            raise Problem('This job cannot be cancelled now.', 409)
        svc.update_job(jid, cancel_requested=1)
        return {'cancellation_requested': True}

    @app.get('/api/workspaces/{wid}/exports/{jid}/download')
    def download(wid: str, jid: str, request: Request):
        path, filename = service(request).archive(wid, jid)
        return FileResponse(path, media_type='application/zip', filename=filename)

    return app

app = create_app()
