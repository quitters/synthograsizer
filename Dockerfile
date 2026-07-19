# Synthograsizer Suite — Cloud Run image.
# Build:  docker build -t synthograsizer .
# Local service-mode stack: docker compose -f docker-compose.dev.yml up
FROM python:3.12-slim

# ffmpeg backs /api/video/combine (admin tool). Everything else is pure Python.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY static/ static/
COPY scripts/ scripts/

ENV PYTHONUNBUFFERED=1

# Cloud Run injects PORT; default matches its convention.
CMD exec uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8080}
