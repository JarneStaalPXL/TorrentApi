FROM node:18

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./

COPY . .

EXPOSE 3001 8085

CMD ["npm","start"]

