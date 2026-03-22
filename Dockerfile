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

# Install system dependencies for Playwright's Chromium
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Create data directory for SQLite persistence
RUN mkdir -p /data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

# Let Playwright download its own Chromium headless shell
RUN npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/leads.db

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
