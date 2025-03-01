import { chromium, firefox, webkit } from 'playwright';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000';
const REMOTE_BROWSER_SERVER_AUTH_TOKEN = process.env.REMOTE_BROWSER_SERVER_AUTH_TOKEN || 'your-secret-token';
const BROWSER_TYPE = (process.env.BROWSER_TYPE || 'chromium') as 'chromium' | 'firefox' | 'webkit';

async function main() {
  console.log(`Connecting to ${BROWSER_TYPE} at ${SERVER_URL}...`);
  
  // Direct connection to browser server with token in URL
  const connectionUrl = `${SERVER_URL}/${BROWSER_TYPE}/playwright?token=${REMOTE_BROWSER_SERVER_AUTH_TOKEN}`;
  console.log(`Connection URL: ${connectionUrl}`);
  
  // Choose the appropriate browser type
  const browser = BROWSER_TYPE === 'firefox' 
    ? await firefox.connect(connectionUrl)
    : BROWSER_TYPE === 'webkit'
      ? await webkit.connect(connectionUrl)
      : await chromium.connect(connectionUrl);
  
  console.log('Connected to browser server');
  
  try {
    // Create a new page
    const page = await browser.newPage();
    console.log('Created new page');
    
    // Navigate to a website
    await page.goto('https://example.com');
    console.log('Navigated to example.com');
    
    // Take a screenshot
    await page.screenshot({ path: 'screenshot.png' });
    console.log('Screenshot saved to screenshot.png');
    
    // Close the page
    await page.close();
  } finally {
    // Make sure to close the browser connection
    await browser.close();
    console.log('Browser connection closed');
  }
}

// Run the example
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
