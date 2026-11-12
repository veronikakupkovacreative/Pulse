# Build from the repository root:
# docker build -f services/youtube-worker/Dockerfile -t pulse-youtube .
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# JavaScript support is required by newer YouTube extraction.
RUN python3 -m pip install --break-system-packages --no-cache-dir \
    "yt-dlp[default]>=2025.12.0,<2027.0" yt-dlp-ejs
WORKDIR /srv
COPY --chown=node:node services/youtube-worker/ ./services/youtube-worker/
USER node
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","services/youtube-worker/server.mjs"]
