import { chromium, firefox, webkit, BrowserServer } from 'playwright';
import http from 'http';
import url from 'url';
import crypto from 'crypto';

// Define session interface
interface BrowserSession {
  id: string;
  browserServer: BrowserServer;
  lastUsed: number;
}

// Configuration from environment
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const REMOTE_BROWSER_SERVER_AUTH_TOKEN = process.env.REMOTE_BROWSER_SERVER_AUTH_TOKEN || 'your-secret-token';
const AUTO_CLOSE_TIMEOUT = process.env.AUTO_CLOSE_TIMEOUT ? parseInt(process.env.AUTO_CLOSE_TIMEOUT) : 60000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Active browser sessions by browser type
const activeSessions: {
  chromium?: BrowserSession;
  firefox?: BrowserSession;
  webkit?: BrowserSession;
} = {};

// Logging levels
const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Logging function
function log(level: keyof typeof logLevels, message: string, data?: any): void {
  if (logLevels[level] >= logLevels[LOG_LEVEL as keyof typeof logLevels]) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${level.toUpperCase()}] ${timestamp}: ${message}`;
    console.log(logMessage, data ? data : '');
  }
}

// Get or create a browser server for a specific browser type
async function getBrowserServer(browserType: 'chromium' | 'firefox' | 'webkit'): Promise<BrowserServer> {
  // Return existing browser server if available
  if (activeSessions[browserType]) {
    activeSessions[browserType]!.lastUsed = Date.now();
    return activeSessions[browserType]!.browserServer;
  }

  // Launch a new browser server based on type
  log('info', `Launching new ${browserType} browser server`);
  
  let browserServer: BrowserServer;
  
  switch(browserType) {
    case 'firefox':
      browserServer = await firefox.launchServer({
        headless: true
      });
      break;
    case 'webkit':
      browserServer = await webkit.launchServer({
        headless: true
      });
      break;
    default:
      browserServer = await chromium.launchServer({
        headless: true
      });
  }
  
  // Store the browser server
  activeSessions[browserType] = {
    id: crypto.randomUUID(),
    browserServer,
    lastUsed: Date.now()
  };
  
  return browserServer;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  
  // Health check endpoint
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      activeSessions: Object.keys(activeSessions).length
    }));
    return;
  }
  
  // Handle browser requests
  if (parsedUrl.pathname?.match(/^\/(chromium|firefox|webkit)\/playwright$/)) {
    const browserType = parsedUrl.pathname.split('/')[1] as 'chromium' | 'firefox' | 'webkit';
    const token = parsedUrl.query.token as string;
    
    // Verify token
    if (token !== REMOTE_BROWSER_SERVER_AUTH_TOKEN) {
      log('warn', 'Unauthorized access attempt', { 
        ip: req.socket.remoteAddress,
        browserType
      });
      
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
      return;
    }
    
    try {
      // Get or create browser server for the specified type
      const browserServer = await getBrowserServer(browserType);
      
      // Handle the request via Playwright's built-in HTTP handling
      // This is what allows direct connection using playwright.chromium.connect(url)
      await browserServer.wsEndpoint();
      
      // The request will be handled by the browser server's WebSocket handler
      // We don't need to do anything else here
    } catch (error) {
      log('error', `Error creating browser server for ${browserType}`, { error });
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
    
    return;
  }

  // Default response for unhandled routes
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Auto-close inactive browser sessions
setInterval(() => {
  const now = Date.now();
  
  for (const [browserType, session] of Object.entries(activeSessions)) {
    if (session && now - session.lastUsed > AUTO_CLOSE_TIMEOUT) {
      log('info', `Auto-closing inactive ${browserType} browser`, { 
        id: session.id, 
        idleTime: now - session.lastUsed 
      });
      
      closeSession(browserType as 'chromium' | 'firefox' | 'webkit');
    }
  }
}, 10000); // Check every 10 seconds

// Close a browser session
async function closeSession(browserType: 'chromium' | 'firefox' | 'webkit'): Promise<void> {
  const session = activeSessions[browserType];
  if (session) {
    try {
      await session.browserServer.close();
      log('info', `${browserType} browser server closed`, { id: session.id });
    } catch (error) {
      log('error', `Error closing ${browserType} browser server`, { id: session.id, error });
    }
    
    delete activeSessions[browserType];
  }
}

// Start server
server.listen(PORT, () => {
  log('info', `Playwright browser server listening on port ${PORT}`);
  log('info', `Connect using:`);
  log('info', `  - Chromium: playwright.chromium.connect("ws://your-host:${PORT}/chromium/playwright?token=${REMOTE_BROWSER_SERVER_AUTH_TOKEN}")`);
  log('info', `  - Firefox: playwright.firefox.connect("ws://your-host:${PORT}/firefox/playwright?token=${REMOTE_BROWSER_SERVER_AUTH_TOKEN}")`);
  log('info', `  - WebKit: playwright.webkit.connect("ws://your-host:${PORT}/webkit/playwright?token=${REMOTE_BROWSER_SERVER_AUTH_TOKEN}")`);
});

// Handle termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown(): Promise<void> {
  log('info', 'Shutting down server');
  
  // Close all browser sessions
  for (const browserType of ['chromium', 'firefox', 'webkit'] as const) {
    await closeSession(browserType);
  }
  
  // Close server
  server.close(() => {
    log('info', 'Server shut down');
    process.exit(0);
  });
}
