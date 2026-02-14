# XTrend Batch - Cloud Run Dockerfile
# Multi-stage build for minimal image size

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM gcr.io/distroless/nodejs20-debian12

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Cloud Run expects PORT env var
ENV PORT=8080

# Run as non-root
USER nonroot

EXPOSE 8080

CMD ["dist/index.js"]
