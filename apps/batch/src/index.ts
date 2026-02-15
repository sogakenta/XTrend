// XTrend Batch Entry Point
// Supports both CLI and HTTP (Cloud Run) modes

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config.js';
import { initDb } from './db.js';
import { runIngest } from './ingest.js';

async function main() {
  const isHttpMode = process.env.K_SERVICE !== undefined; // Cloud Run sets this

  if (isHttpMode) {
    await runHttpServer();
  } else {
    await runCli();
  }
}

/**
 * CLI mode: Run ingest once and exit
 */
async function runCli(): Promise<void> {
  console.log('[Batch] Running in CLI mode');

  try {
    const config = loadConfig();
    initDb(config.supabaseUrl, config.supabaseSecretKey);

    const result = await runIngest(config.xBearerToken);

    console.log('[Batch] Result:', JSON.stringify(result, null, 2));

    if (result.status === 'failed') {
      process.exit(1);
    }
  } catch (err) {
    console.error('[Batch] Fatal error:', err);
    process.exit(1);
  }
}

/**
 * HTTP mode: Run as Cloud Run service
 */
async function runHttpServer(): Promise<void> {
  const config = loadConfig();
  initDb(config.supabaseUrl, config.supabaseSecretKey);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Trigger ingest
    if (req.method === 'POST' && req.url === '/ingest') {
      console.log('[HTTP] Received ingest request');

      try {
        const result = await runIngest(config.xBearerToken);

        const statusCode = result.status === 'failed' ? 500 : 200;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('[HTTP] Ingest error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
      return;
    }

    // Not found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(config.port, () => {
    console.log(`[HTTP] Server listening on port ${config.port}`);
  });
}

main().catch(err => {
  console.error('[Batch] Unhandled error:', err);
  process.exit(1);
});
