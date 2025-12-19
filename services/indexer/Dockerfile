FROM node:20-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml* tsconfig.json ./
COPY src ./src

RUN corepack enable && pnpm install
RUN pnpm build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
