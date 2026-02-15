FROM node:20-slim

# Install Java
RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps
COPY package*.json ./
RUN npm install --production

# Copy EVERYTHING (js + jar + csv)
COPY . .

EXPOSE 4000

CMD ["node", "service_improvisor.js"]
