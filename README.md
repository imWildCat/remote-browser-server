# Playwright Remote Browser Server

A token-authenticated Playwright server that allows remote control of browsers via WebSockets. This project provides a Docker-based solution that works across platforms, including ARM64 architecture.

## Features

- 🔒 Token-based authentication for secure browser access
- 🌐 WebSocket communication for real-time browser control
- ⏱️ Auto-close inactive browser sessions after 60 seconds
- 🐳 Multi-architecture Docker support (amd64/x86_64 and arm64)
- 🚀 GitHub Actions workflow for automated builds
- 📝 Written in TypeScript for better type safety and developer experience

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Node.js](https://nodejs.org/) (for local development)
- [TypeScript](https://www.typescriptlang.org/) (for local development)

### Running with Docker

1. Clone this repository
   ```bash
   git clone https://github.com/yourusername/playwright-remote-browser-server.git
   cd playwright-remote-browser-server
   ```

2. Edit the environment variables in `docker-compose.yml` to set your own authentication token

3. Start the server
   ```bash
   docker-compose up -d
   ```

4. The server is now running on port 3000

### Local Development

1. Install dependencies
   ```bash
   npm install
   ```

2. Start the development server (with hot-reload)
   ```bash
   npm run dev
   ```

3. Or build and run the compiled JavaScript
   ```bash
   npm run build
   npm start
   ```

### Environment Variables

- `PORT`: WebSocket server port (default: 3000)
- `AUTH_TOKEN`: Authentication token for connecting clients (default: "your-secret-token")
- `AUTO_CLOSE_TIMEOUT`: Time in milliseconds to auto-close inactive browsers (default: 60000)
- `LOG_LEVEL`: Logging level (options: "debug", "info", "warn", "error", default: "info")

## API Usage

### Client-Side Connection

Connect to the WebSocket server using:

```
ws://your-server:3000/playwright?token=your-secret-token
```

or for secure connections:

```
wss://your-server:3000/playwright?token=your-secret-token
```

### WebSocket Commands

#### Launch Browser
```javascript
// Send
{
  "action": "launch"
}

// Receive
{
  "status": "launched",
  "wsEndpoint": "ws://localhost:54321/playwright",
  "sessionId": "12345-67890-abcdef"
}
```

#### Close Browser
```javascript
// Send
{
  "action": "close"
}

// Receive
{
  "status": "closed",
  "sessionId": "12345-67890-abcdef"
}
```

## Client Example

Here's a simple example of how to use the remote browser server with Playwright:

```typescript
import { chromium } from 'playwright';
import WebSocket from 'ws';

// Connect to server with token authentication
const ws = new WebSocket('ws://localhost:3000/playwright?token=your-secret-token');

ws.on('open', () => {
  // Request a browser instance
  ws.send(JSON.stringify({ action: 'launch' }));
});

ws.on('message', async (message) => {
  const data = JSON.parse(message.toString());
  
  if (data.status === 'launched' && data.wsEndpoint) {
    // Connect to the remote browser
    const browser = await chromium.connect({ wsEndpoint: data.wsEndpoint });
    const page = await browser.newPage();
    
    // Use the page for automation
    await page.goto('https://example.com');
    await page.screenshot({ path: 'screenshot.png' });
    
    // Close the browser connection
    await browser.close();
    
    // Tell the server to close the browser
    ws.send(JSON.stringify({ action: 'close' }));
  }
});
```

## Project Structure

```
.
├── src/                    # TypeScript source code
│   ├── server.ts           # Main server implementation
│   ├── client-example.ts   # Example client implementation
│   └── healthcheck.ts      # Health check utility
├── dist/                   # Compiled JavaScript (generated)
├── Dockerfile              # Production Docker image configuration
├── Dockerfile.dev          # Development Docker image configuration
├── docker-compose.yml      # Docker Compose configuration
├── package.json            # Node.js dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

## Building Multi-Architecture Docker Images

This project includes a GitHub Actions workflow that automatically builds Docker images for both x86_64 and ARM64 architectures.

The workflow is triggered when:
- Pushing to the main branch
- Creating a tag (v*)
- Manually triggering the workflow

## Security Considerations

- Always change the default `AUTH_TOKEN` to a strong, unique value
- Consider running behind a reverse proxy with TLS for secure WebSocket connections (wss://)
- Use network isolation in production environments
- Implement rate limiting for authentication attempts

## License

MIT

## Acknowledgments

- [Playwright](https://playwright.dev/) for the awesome browser automation tool
- [Browserless.io](https://browserless.io/) for inspiration
