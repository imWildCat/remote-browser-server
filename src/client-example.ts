import { chromium, Browser, Page } from 'playwright';
import WebSocket from 'ws';

// Define server response interface
interface ServerResponse {
  status: string;
  sessionId?: string;
  wsEndpoint?: string;
  message?: string;
  [key: string]: any;
}

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000/playwright';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-secret-token';

async function main(): Promise<void> {
  console.log('Connecting to remote browser server...');
  
  // Connect to the WebSocket server with token authentication
  const ws = new WebSocket(`${SERVER_URL}?token=${AUTH_TOKEN}`);
  
  // Handle connection errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    process.exit(1);
  });
  
  // Handle connection open
  ws.on('open', () => {
    console.log('Connected to remote browser server');
    
    // Request a browser instance
    ws.send(JSON.stringify({ action: 'launch' }));
  });
  
  // Handle WebSocket messages
  ws.on('message', async (message: WebSocket.RawData) => {
    const data = JSON.parse(message.toString()) as ServerResponse;
    console.log('Received:', data);
    
    // Handle browser launch response
    if (data.status === 'launched' && data.wsEndpoint) {
      console.log(`Browser launched with endpoint: ${data.wsEndpoint}`);
      
      try {
        // Connect to the remote browser using Playwright
        const browser: Browser = await chromium.connect({ wsEndpoint: data.wsEndpoint });
        console.log('Connected to browser');
        
        // Create a new page
        const page: Page = await browser.newPage();
        
        // Navigate to a website
        await page.goto('https://example.com');
        console.log('Navigated to example.com');
        
        // Take a screenshot
        await page.screenshot({ path: 'screenshot.png' });
        console.log('Screenshot saved to screenshot.png');
        
        // Close the browser connection
        await browser.close();
        console.log('Browser connection closed');
        
        // Request server to close the browser
        ws.send(JSON.stringify({ action: 'close' }));
      } catch (error) {
        console.error('Error:', error);
        ws.close();
      }
    }
    
    // Handle browser close response
    if (data.status === 'closed') {
      console.log('Browser session closed');
      ws.close();
    }
    
    // Handle errors
    if (data.status === 'error') {
      console.error('Error from server:', data.message);
      ws.close();
    }
  });
  
  // Handle WebSocket close
  ws.on('close', () => {
    console.log('Disconnected from remote browser server');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
