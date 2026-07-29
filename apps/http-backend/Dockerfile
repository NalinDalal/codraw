FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/ ./apps/
COPY packages/ ./packages/
RUN bun install --frozen-lockfile

WORKDIR /app/apps/http-backend
COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/apps/ ./apps/
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/http-backend/package.json ./apps/http-backend/package.json

RUN bun install --production --frozen-lockfile

COPY --from=builder /app/apps/http-backend/dist ./apps/http-backend/dist

ENV NODE_ENV=production
WORKDIR /app/apps/http-backend
EXPOSE 3001
CMD ["bun", "run", "start"]
