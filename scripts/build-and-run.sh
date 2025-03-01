#!/bin/bash

# Create scripts directory if it doesn't exist
mkdir -p scripts

# Ensure script is executable
chmod +x scripts/build-and-run.sh

# Build the Docker image
echo "Building Docker image..."
docker build -t playwright-browser-server .

# Stop any running container with the same name
echo "Stopping existing containers..."
docker stop playwright-server 2>/dev/null || true
docker rm playwright-server 2>/dev/null || true

# Run the container
echo "Starting container..."
docker run -d --name playwright-server \
  -p 3000:3000 \
  -e AUTH_TOKEN=test-token \
  -e LOG_LEVEL=debug \
  playwright-browser-server

echo "Container started! Access at ws://localhost:3000/playwright?token=test-token"
echo "Health check: http://localhost:3000/health"
