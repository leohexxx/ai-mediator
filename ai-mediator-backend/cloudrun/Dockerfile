FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

ENV PORT=9000
EXPOSE 9000

CMD ["node", "server.js"]
