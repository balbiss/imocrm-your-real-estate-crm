FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

EXPOSE 4000

CMD ["node", "src/index.js"]
