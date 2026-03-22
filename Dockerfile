# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-slim AS runner

WORKDIR /app

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y \
  chromium \
  chromium-driver \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libx11-xcb1 \
  libnss3 \
  libxss1 \
  libasound2t64 \
  libgbm1 \
  libxshmfence1 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Create data directory for SQLite persistence
RUN mkdir -p /data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/leads.db

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
