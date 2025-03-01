import { chromium, Browser, BrowserServer } from 'playwright';
import WebSocket from 'ws';
import http from 'http';
import url from 'url';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// Define session interface
interface BrowserSession {
  browser: Browser;
  browserServer: BrowserServer;
  lastActivity: number;
  timeoutId: NodeJS.Timeout;
}

// Define message interface
interface ClientMessage {
  action: string;
  [key: string]: any;
}

// Define server response interface
interface ServerResponse {
  status: string;
  sessionId?: string;
  wsEndpoint?: string;
  message?: string;
  [key: string]: any;
}

// Config - can be overridden with environment variables
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-secret-token';
const AUTO_CLOSE_TIMEOUT = process.env.AUTO_CLOSE_TIMEOUT ? parseInt(process.env.AUTO_CLOSE_TIMEOUT) : 60000; // 60 seconds
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // 'debug', 'info', 'warn', 'error'

// Browser instances map: sessionId -> { browser, lastActivity, timeoutId }
const browserSessions = new Map<string, BrowserSession>();

// Simple logging utility
const logger = {
  debug: (...args: any[]) => LOG_LEVEL === 'debug' && console.log(`[DEBUG] ${new Date().toISOString()}:`, ...args),
  info: (...args: any[]) => ['debug', 'info'].includes(LOG_LEVEL) && console.log(`[INFO] ${new Date().toISOString()}:`, ...args),
  warn: (...args: any[]) => ['debug', 'info', 'warn'].includes(LOG_LEVEL) && console.log(`[WARN] ${new Date().toISOString()}:`, ...args),
  error: (...args: any[]) => console.error(`[ERROR] ${new Date().toISOString()}:`, ...args)
};

// Create HTTP server
const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Invalid request' }));
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  // Health check endpoint
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', activeSessions: browserSessions.size }));
    return;
  }
  
  // Default response for unhandled routes
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle new WebSocket connections
wss.on('connection', async (ws, req) => {
  if (!req.url) {
    ws.close(1008, 'Invalid request');
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const token = parsedUrl.query.token as string;
  
  // Validate token
  if (token !== AUTH_TOKEN) {
    logger.warn('Unauthorized connection attempt with token:', token);
    ws.close(1008, 'Unauthorized');
    return;
  }
  
  // Generate unique session ID
  const sessionId = crypto.randomUUID();
  logger.info(`New client connected: ${sessionId}`);
  
  // Setup message handling
  ws.on('message', async (message: WebSocket.RawData) => {
    try {
      const data = JSON.parse(message.toString()) as ClientMessage;
      logger.debug(`Received message from ${sessionId}:`, data);
      
      switch (data.action) {
        case 'launch':
          await handleLaunch(ws, sessionId, data);
          break;
        
        case 'close':
          await handleClose(ws, sessionId);
          break;
          
        default:
          sendError(ws, 'Unknown action');
      }
    } catch (error) {
      logger.error('Error processing message:', error);
      sendError(ws, `Error processing message: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    logger.info(`Client disconnected: ${sessionId}`);
    cleanupSession(sessionId);
  });
  
  // Send initial connection confirmation
  send(ws, { status: 'connected', sessionId });
});

// Handle browser launch request
async function handleLaunch(ws: WebSocket, sessionId: string, data: ClientMessage): Promise<void> {
  // Close existing browser if any
  if (browserSessions.has(sessionId)) {
    await cleanupSession(sessionId);
  }
  
  try {
    // Launch new browser
    logger.info(`Launching browser for session ${sessionId}`);
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    // Create a browser server
    const browserServer = await chromium.launchServer({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    const wsEndpoint = browserServer.wsEndpoint();
    
    // Store session info
    const timeoutId = setTimeout(() => {
      logger.info(`Auto-closing session ${sessionId} due to inactivity`);
      cleanupSession(sessionId);
      send(ws, { status: 'timeout', message: 'Browser session closed due to inactivity' });
    }, AUTO_CLOSE_TIMEOUT);
    
    browserSessions.set(sessionId, {
      browser,
      browserServer,
      lastActivity: Date.now(),
      timeoutId
    });
    
    // Send success response with connection details
    send(ws, {
      status: 'launched',
      wsEndpoint,
      sessionId
    });
  } catch (error) {
    logger.error(`Error launching browser for session ${sessionId}:`, error);
    sendError(ws, `Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Handle browser close request
async function handleClose(ws: WebSocket, sessionId: string): Promise<void> {
  try {
    if (await cleanupSession(sessionId)) {
      send(ws, { status: 'closed', sessionId });
    } else {
      sendError(ws, `No active session found with ID: ${sessionId}`);
    }
  } catch (error) {
    logger.error(`Error closing browser for session ${sessionId}:`, error);
    sendError(ws, `Failed to close browser: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Cleanup browser session resources
async function cleanupSession(sessionId: string): Promise<boolean> {
  const session = browserSessions.get(sessionId);
  if (!session) return false;
  
  logger.info(`Cleaning up session ${sessionId}`);
  
  // Clear timeout if exists
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }
  
  // Close browser
  try {
    if (session.browser) {
      await session.browser.close();
    }
    if (session.browserServer) {
      await session.browserServer.close();
    }
  } catch (error) {
    logger.error(`Error while closing browser for session ${sessionId}:`, error);
  }
  
  // Remove from sessions map
  browserSessions.delete(sessionId);
  return true;
}

// Helper to send success response
function send(ws: WebSocket, data: ServerResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Helper to send error response
function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ status: 'error', message }));
  }
}

// Start server
server.listen(PORT, () => {
  logger.info(`Playwright browser server listening on port ${PORT}`);
  logger.info(`Connect using: wss://your-host:${PORT}/playwright?token=YOUR_TOKEN`);
});
