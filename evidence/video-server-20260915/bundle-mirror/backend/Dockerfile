FROM bnbu-backend-production:server-video-base-20260915
USER root
RUN sed -i "s|deb.debian.org|mirrors.ustc.edu.cn|g" /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install --yes --no-install-recommends ca-certificates && sed -i "s|http://mirrors.ustc.edu.cn|https://mirrors.ustc.edu.cn|g" /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install --yes --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --chown=10001:10001 dist/ /app/dist/
USER 10001:10001
