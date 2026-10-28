FROM denoland/deno:bin-2.9.8 AS deno
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=deno /deno /usr/local/bin/deno
ENV DENO_DIR=/tmp/deno DENO_NO_UPDATE_CHECK=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./server.py
COPY backend ./backend
RUN useradd --uid 10001 -m pulse
USER pulse
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn backend.api:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --proxy-headers"]
