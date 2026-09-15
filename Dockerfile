FROM node:20-slim

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Persistent volume recommended for the SQLite DB and uploads
# On Railway: mount a volume at /data
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV DB_PATH=/data/hustle-hub.db
ENV UPLOAD_DIR=/data/uploads
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
