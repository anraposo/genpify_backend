# Use official Node.js 20 image
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy app
COPY . .

# Expose port (use PORT environment variable)
EXPOSE 3000

# Start service
CMD ["node", "gateway.js"]
