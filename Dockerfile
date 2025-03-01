FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Install Node.js dependencies
COPY package.json package-lock.json tsconfig.json ./
RUN npm install

# Copy TypeScript source code
COPY src ./src

# Build TypeScript code to JavaScript
RUN npm run build

# Make healthcheck executable
RUN chmod +x dist/healthcheck.js

# Environment variables for configuration
ENV PORT=3000
ENV REMOTE_BROWSER_SERVER_AUTH_TOKEN=your-secret-token
ENV AUTO_CLOSE_TIMEOUT=60000
ENV LOG_LEVEL=info

# Expose WebSocket port
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "dist/healthcheck.js"]

# Start the server
CMD ["node", "dist/server.js"]
