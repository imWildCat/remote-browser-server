import http from 'http';
import url from 'url';
import { WebSocketServer } from 'ws';
import { BrowserServer } from 'playwright';

// Access internal WebSocket server on BrowserServer
interface BrowserServerWithWebSocket extends BrowserServer {
  _wsServer: WebSocketServer;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface PlaywrightProxyConfig {
  port: number;
  authToken: string;
  logLevel: LogLevel;
  autoCloseTimeout: number;
}

interface BrowserSession {
  id: string;
  browserServer: BrowserServer;
  lastUsed: number;
}

type BrowserType = 'chromium' | 'firefox' | 'webkit';

class PlaywrightProxyServer {
  private server: http.Server;
  private config: PlaywrightProxyConfig;
  private activeSessions: Record<BrowserType, BrowserSession | undefined> = {
    chromium: undefined,
    firefox: undefined,
    webkit: undefined
  };
  
  private logLevels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(
    config: PlaywrightProxyConfig,
    private getBrowserServer: (browserType: BrowserType) => Promise<BrowserServer>,
    private closeSession: (browserType: BrowserType) => Promise<void>
  ) {
    this.config = config;

    // Create HTTP server
    this.server = http.createServer(this.handleHttpRequest.bind(this));

    // Add WebSocket server handling
    this.server.on('upgrade', this.handleWebSocketUpgrade.bind(this));

    // Set up auto-close interval
    this.setupAutoClose();
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (this.logLevels[level] >= this.logLevels[this.config.logLevel]) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${level.toUpperCase()}] ${timestamp}: ${message}`;
      console.log(logMessage, data ? data : '');
    }
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = url.parse(req.url || '', true);
    
    // Health check endpoint
    if (parsedUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        activeSessions: Object.values(this.activeSessions).filter(Boolean).length
      }));
      return;
    }
    
    // Handle all other requests
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private async handleWebSocketUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true);
    
    // Check if this is a browser request
    const browserTypeMatch = parsedUrl.pathname?.match(/^\/(chromium|firefox|webkit)\/playwright$/);
    if (browserTypeMatch) {
      const browserType = browserTypeMatch[1] as BrowserType;
      const token = parsedUrl.query.token as string;
      
      // Verify token
      if (token !== this.config.authToken) {
        this.log('warn', 'Unauthorized WebSocket upgrade attempt', { 
          ip: req.socket.remoteAddress,
          browserType
        });
        
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      
      try {
        this.log('debug', `Received WebSocket upgrade request for ${browserType}`, {
          headers: req.headers
        });
        
        // Get or create browser server for the specified type
        const browserServer = await this.getBrowserServer(browserType);
        
        // Forward the WebSocket connection directly
        this.log('debug', `WebSocket connection established for ${browserType}`);
        
        // Let the client connect directly to the browser's WebSocket endpoint
        const wsEndpoint = browserServer.wsEndpoint();
        const wsUrl = new URL(wsEndpoint);
        
        // We need to create a direct WebSocket connection to forward the client
        const browserWsPath = wsUrl.pathname + (wsUrl.search || '');
        
        // Rewrite the URL to match the browser server's expected format
        req.url = browserWsPath;
        
        // Forward the WebSocket upgrade request to the browser's WebSocket server
        const browserServerWithWs = browserServer as unknown as BrowserServerWithWebSocket;
        browserServerWithWs._wsServer.handleUpgrade(req, socket, head, (ws) => {
          browserServerWithWs._wsServer.emit('connection', ws, req);
        });
        
      } catch (error) {
        this.log('error', `Error handling WebSocket upgrade for ${browserType}`, { error });
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      }
      
      return;
    }
    
    // Unhandled WebSocket upgrade
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }

  private setupAutoClose(): void {
    // Auto-close inactive browser sessions
    setInterval(() => {
      const now = Date.now();
      
      for (const [browserType, session] of Object.entries(this.activeSessions)) {
        if (session && now - session.lastUsed > this.config.autoCloseTimeout) {
          this.log('info', `Auto-closing inactive ${browserType} browser`, { 
            id: session.id, 
            idleTime: now - session.lastUsed 
          });
          
          this.closeSession(browserType as BrowserType);
        }
      }
    }, 10000); // Check every 10 seconds
  }

  public listen(): void {
    this.server.listen(this.config.port, () => {
      this.log('info', `Playwright browser server listening on port ${this.config.port}`);
      this.log('info', `Connect using:`);
      this.log('info', `  - Chromium: playwright.chromium.connect("ws://your-host:${this.config.port}/chromium/playwright?token=${this.config.authToken}")`);
      this.log('info', `  - Firefox: playwright.firefox.connect("ws://your-host:${this.config.port}/firefox/playwright?token=${this.config.authToken}")`);
      this.log('info', `  - WebKit: playwright.webkit.connect("ws://your-host:${this.config.port}/webkit/playwright?token=${this.config.authToken}")`);
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.log('info', 'Server shut down');
        resolve();
      });
    });
  }

  public getActiveSessions(): Record<BrowserType, BrowserSession | undefined> {
    return this.activeSessions;
  }

  public setActiveSession(browserType: BrowserType, session: BrowserSession): void {
    this.activeSessions[browserType] = session;
  }
}

export { PlaywrightProxyServer, PlaywrightProxyConfig, BrowserSession, BrowserType, LogLevel };
