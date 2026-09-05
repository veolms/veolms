FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY dist/fleet-manager.cjs ./fleet-manager.cjs

USER node

CMD ["node", "fleet-manager.cjs", "run"]
