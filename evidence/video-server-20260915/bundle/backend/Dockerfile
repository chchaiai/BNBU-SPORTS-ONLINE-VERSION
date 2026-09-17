FROM bnbu-backend-production:server-video-base-20260915
USER root
RUN apt-get update && apt-get install --yes --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --chown=10001:10001 dist/ /app/dist/
USER 10001:10001
