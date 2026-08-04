FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Prisma generation does not connect to this placeholder database. Runtime
# startup requires the real PostgreSQL DATABASE_URL before migrations deploy.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/asylum_build" npm run db:production:generate && npm run build

CMD ["npm", "run", "docker-start"]
