# ---- Build stage ----
# Use Debian-based node (NOT alpine) so native modules like better-sqlite3
# compile with glibc and work in the same runtime image
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build tools needed for better-sqlite3 native addon
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Install Playwright Chromium browser (skip other browsers)
ENV PLAYWRIGHT_BROWSERS_PATH=/app/playwright-browsers
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install Playwright system dependencies (chromium runtime libs)
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libx11-xcb1 \
  libnss3 \
  libxss1 \
  libasound2t64 \
  libgbm1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Create data directory for SQLite persistence
RUN mkdir -p /data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install production deps only — native modules rebuild for this exact image
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends \
  && npm ci --omit=dev \
  && apt-get remove -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/leads.db

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
