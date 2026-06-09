FROM node:20-slim

# LibreOffice və Arial font quraşdır
RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-liberation \
    ttf-mscorefonts-installer \
    fontconfig \
    --no-install-recommends \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
