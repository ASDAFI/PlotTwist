FROM python:3.12-slim-bookworm
ARG APP_UID=1000
ARG APP_GID=1000
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.lock ./
RUN pip install --require-hashes -r requirements.lock \
    && groupadd --gid "$APP_GID" plottwist \
    && useradd --uid "$APP_UID" --gid "$APP_GID" --no-create-home plottwist \
    && mkdir -p /state /exports \
    && chown plottwist:plottwist /state /exports
COPY --chown=plottwist:plottwist app ./app
USER plottwist
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health',timeout=2)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers"]
