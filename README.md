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
- `REMOTE_BROWSER_SERVER_AUTH_TOKEN`: Authentication token for connecting clients (default: "your-secret-token")
- `AUTO_CLOSE_TIMEOUT`: Time in milliseconds to auto-close inactive browsers (default: 60000)
- `LOG_LEVEL`: Logging level (options: "debug", "info", "warn", "error", default: "info")

## API Usage

### Direct Connection (Recommended)

Connect directly to the browser using the Playwright API:

```typescript
// For Chromium (default)
const browser = await playwright.chromium.connect(
  'ws://your-server:3000/chromium/playwright?token=your-secret-token'
);

// For Firefox
const browser = await playwright.firefox.connect(
  'ws://your-server:3000/firefox/playwright?token=your-secret-token'
);

// For WebKit
const browser = await playwright.webkit.connect(
  'ws://your-server:3000/webkit/playwright?token=your-secret-token'
);
```

This approach is compatible with browserless.io and similar services.

### Browser Types

The server supports three browser types:
- Chromium: `/chromium/playwright`
- Firefox: `/firefox/playwright`
- WebKit: `/webkit/playwright`

Each browser type has its own endpoint, and you can connect to any of them using the appropriate Playwright API.

## Client Example

Here's a simple example of how to use the remote browser server with Playwright:

```typescript
import { chromium } from 'playwright';

async function main() {
  // Connect directly to the remote browser
  const browser = await chromium.connect(
    'ws://localhost:3000/chromium/playwright?token=your-secret-token'
  );
  
  try {
    // Create a new page
    const page = await browser.newPage();
    
    // Use the page for automation
    await page.goto('https://example.com');
    await page.screenshot({ path: 'screenshot.png' });
    
    // Close the page
    await page.close();
  } finally {
    // Always close the browser connection when done
    await browser.close();
  }
}

main().catch(console.error);
```

## Deployment

### Using Docker Compose

You can easily run the server using Docker Compose:

```bash
docker-compose up -d
```

For development with hot-reload:

```bash
docker-compose run dev
```

### Using Kamal

This project includes configuration for deployment using [Kamal](https://kamal-deploy.org/), which simplifies Docker-based deployments.

1. Install Kamal:
   ```bash
   gem install kamal
   ```

2. Set up your environment variables in a `.env` file:
   ```
   KAMAL_SERVER=your-server-ip
   BROWSER_HOST=browser.yourdomain.com
   REMOTE_BROWSER_SERVER_AUTH_TOKEN=your-secret-token
   GITHUB_USERNAME=your-github-username
   GITHUB_TOKEN=your-github-token
   ```

3. Deploy the application:
   ```bash
   kamal setup
   kamal deploy
   ```

4. To deploy the Playwright server as an accessory for other applications:
   ```bash
   kamal accessory boot playwright-browser
   ```

5. Useful commands:
   ```bash
   kamal app logs                # View application logs
   kamal app restart             # Restart the application
   kamal accessory status        # Check accessory status
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

- Always change the default `REMOTE_BROWSER_SERVER_AUTH_TOKEN` to a strong, unique value
- Consider running behind a reverse proxy with TLS for secure WebSocket connections (wss://)
- Use network isolation in production environments
- Implement rate limiting for authentication attempts

## License

MIT

## Acknowledgments

- [Playwright](https://playwright.dev/) for the awesome browser automation tool
- [Browserless.io](https://browserless.io/) for inspiration
