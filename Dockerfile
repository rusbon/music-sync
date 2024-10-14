FROM node:20.18-alpine AS build

WORKDIR /usr/src/app

COPY ./server/package*.json ./server/
COPY ./client/package.json ./client/
COPY ./client/yarn.lock ./client/

WORKDIR /usr/src/app/server
RUN npm ci

WORKDIR /usr/src/app/client
RUN yarn install --frozen-lockfile

WORKDIR /usr/src/app
COPY ./server ./server
COPY ./client ./client

WORKDIR /usr/src/app/server
RUN npx prisma generate
RUN npx tsc 

WORKDIR /usr/src/app/client
RUN npm run build

FROM node:20.18-alpine AS deploy

COPY --from=build /usr/src/app/dist /usr/src/app/dist
COPY --from=build /usr/src/app/server/node_modules /usr/src/app/dist/node_modules
COPY --from=build /usr/src/app/server/package*.json /usr/src/app/dist/
WORKDIR /usr/src/app/dist

EXPOSE 4000

CMD [ "node", "server.js" ]