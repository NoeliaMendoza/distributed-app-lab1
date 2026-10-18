FROM node:22-alpine

WORKDIR /app

ARG APP_VERSION=v2

ENV APP_VERSION=${APP_VERSION}

COPY server.js .

EXPOSE 3000

CMD ["node", "server.js"]
