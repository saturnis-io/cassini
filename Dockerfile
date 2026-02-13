# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Runtime
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml ./backend/
COPY backend/src/ ./backend/src/
RUN pip install --no-cache-dir ./backend

COPY backend/alembic.ini ./backend/
COPY backend/alembic/ ./backend/alembic/

COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV OPENSPC_HOST=0.0.0.0
ENV OPENSPC_PORT=8000
ENV OPENSPC_DATABASE_URL=sqlite+aiosqlite:///./data/openspc.db

RUN mkdir -p /app/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')" || exit 1

CMD ["uvicorn", "openspc.main:app", "--host", "0.0.0.0", "--port", "8000"]
