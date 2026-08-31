FROM node:22-bookworm-slim

# Install system dependencies required for video transcoding
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pre-bundled standalone worker script
COPY dist/media-worker.js ./worker.js

CMD ["node", "worker.js"]
