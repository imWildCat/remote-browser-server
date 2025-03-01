import { chromium, firefox, webkit, BrowserServer } from 'playwright';
import crypto from 'crypto';
import { PlaywrightProxyServer, PlaywrightProxyConfig, BrowserSession, BrowserType } from './server/PlaywrightProxyServer';

// Configuration from environment
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const REMOTE_BROWSER_SERVER_AUTH_TOKEN = process.env.REMOTE_BROWSER_SERVER_AUTH_TOKEN || 'your-secret-token';
const AUTO_CLOSE_TIMEOUT = process.env.AUTO_CLOSE_TIMEOUT ? parseInt(process.env.AUTO_CLOSE_TIMEOUT) : 60000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Active browser sessions by browser type
const activeSessions: Record<BrowserType, BrowserSession | undefined> = {
  chromium: undefined,
  firefox: undefined,
  webkit: undefined
};

// Get or create a browser server for a specific browser type
async function getBrowserServer(browserType: BrowserType): Promise<BrowserServer> {
  // Return existing browser server if available
  if (activeSessions[browserType]) {
    activeSessions[browserType]!.lastUsed = Date.now();
    return activeSessions[browserType]!.browserServer;
  }

  // Launch a new browser server based on type
  console.log(`[INFO] ${new Date().toISOString()}: Launching new ${browserType} browser server`);
  
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

// Close a browser session
async function closeSession(browserType: BrowserType): Promise<void> {
  const session = activeSessions[browserType];
  if (session) {
    try {
      await session.browserServer.close();
      console.log(`[INFO] ${new Date().toISOString()}: ${browserType} browser server closed`, { id: session.id });
    } catch (error) {
      console.log(`[ERROR] ${new Date().toISOString()}: Error closing ${browserType} browser server`, { id: session.id, error });
    }
    
    delete activeSessions[browserType];
  }
}

// Create the proxy server configuration
const proxyConfig: PlaywrightProxyConfig = {
  port: PORT,
  authToken: REMOTE_BROWSER_SERVER_AUTH_TOKEN,
  autoCloseTimeout: AUTO_CLOSE_TIMEOUT,
  logLevel: LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error'
};

// Create and start the proxy server
const proxyServer = new PlaywrightProxyServer(
  proxyConfig, 
  getBrowserServer, 
  closeSession,
  activeSessions
);

// Handle termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown(): Promise<void> {
  console.log(`[INFO] ${new Date().toISOString()}: Shutting down server`);
  
  // Close all browser sessions
  for (const browserType of ['chromium', 'firefox', 'webkit'] as const) {
    await closeSession(browserType);
  }
  
  // Close server
  await proxyServer.close();
  process.exit(0);
}

// Start the server
proxyServer.listen();
