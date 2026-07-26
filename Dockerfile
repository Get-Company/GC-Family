# Backend-Image (Django + Ninja), gebaut mit uv.
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# uv aus dem offiziellen Image kopieren.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Abhängigkeiten zuerst installieren (bessere Layer-Caches).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Projektcode.
COPY . .
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

ENTRYPOINT ["/app/docker/backend-entrypoint.sh"]
CMD ["gunicorn", "gc_family.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
