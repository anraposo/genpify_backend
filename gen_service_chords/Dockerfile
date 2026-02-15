FROM node:20-slim

# Install Java runtime
RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps
COPY package*.json ./
RUN npm install --production

# Copy app + jar
COPY . .

EXPOSE 3002

CMD ["node", "service_chords.js"]
