FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/ ./apps/
COPY packages/ ./packages/
RUN bun install --frozen-lockfile

WORKDIR /app/apps/ws-backend
COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/apps/ ./apps/
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/ws-backend/package.json ./apps/ws-backend/package.json

RUN bun install --production --frozen-lockfile

COPY --from=builder /app/apps/ws-backend/dist ./apps/ws-backend/dist

ENV NODE_ENV=production
WORKDIR /app/apps/ws-backend
EXPOSE 8080
CMD ["bun", "run", "start"]
