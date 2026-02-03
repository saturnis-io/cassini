import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { FileWatcher } from './watcher.js';
import { DashboardWebSocketServer } from './websocket.js';
import type { ServerConfig, WSMessage } from './types.js';

// Parse command line arguments
function parseArgs(): Partial<ServerConfig> {
  const args = process.argv.slice(2);
  const config: Partial<ServerConfig> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' || args[i] === '-p') {
      config.projectPath = args[++i];
    } else if (args[i] === '--port') {
      config.port = parseInt(args[++i], 10);
    } else if (args[i] === '--ws-port') {
      config.wsPort = parseInt(args[++i], 10);
    }
  }

  return config;
}

// Load config file if exists
function loadConfigFile(): Partial<ServerConfig> {
  const configPath = path.join(process.cwd(), 'dashboard.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (error) {
      console.warn('Failed to parse dashboard.config.json:', error);
    }
  }
  return {};
}

// Main function
async function main() {
  const fileConfig = loadConfigFile();
  const cliConfig = parseArgs();

  const config: ServerConfig = {
    projectPath: cliConfig.projectPath || fileConfig.projectPath || process.env.CVC_PROJECT_PATH || process.cwd(),
    port: cliConfig.port || fileConfig.port || parseInt(process.env.PORT || '3001', 10),
    wsPort: cliConfig.wsPort || fileConfig.wsPort || parseInt(process.env.WS_PORT || '3002', 10),
  };

  console.log('Starting CVC Dashboard Server...');
  console.log(`Project path: ${config.projectPath}`);
  console.log(`HTTP port: ${config.port}`);
  console.log(`WebSocket port: ${config.wsPort}`);

  // Verify project path exists
  if (!fs.existsSync(config.projectPath)) {
    console.error(`Project path does not exist: ${config.projectPath}`);
    process.exit(1);
  }

  // Create .company directory if it doesn't exist
  const companyPath = path.join(config.projectPath, '.company');
  if (!fs.existsSync(companyPath)) {
    fs.mkdirSync(companyPath, { recursive: true });
    console.log(`Created .company directory at ${companyPath}`);
  }

  // Initialize WebSocket server
  const wsServer = new DashboardWebSocketServer(config.wsPort);

  // Initialize file watcher
  const watcher = new FileWatcher(config.projectPath);

  // Forward watcher events to WebSocket clients
  watcher.on('event', (event: { type: string; payload: unknown }) => {
    const message: WSMessage = {
      type: event.type as WSMessage['type'],
      payload: event.payload,
      timestamp: new Date().toISOString(),
    };
    wsServer.broadcast(message);
  });

  // Send initial state to new connections
  wsServer.onConnection((ws) => {
    const initialState = watcher.loadInitialState();
    wsServer.sendInitialState(ws, initialState);
  });

  // Start file watcher
  watcher.start();

  // Create Express app
  const app = express();

  // Serve static files from client build (in production)
  const clientDistPath = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      projectPath: config.projectPath,
      wsPort: config.wsPort,
      clients: wsServer.getClientCount(),
    });
  });

  // Get current state
  app.get('/api/state', (req, res) => {
    const state = watcher.loadInitialState();
    res.json(state);
  });

  // Config endpoint
  app.get('/api/config', (req, res) => {
    res.json({
      projectPath: config.projectPath,
      wsPort: config.wsPort,
    });
  });

  // SPA fallback (for client-side routing)
  app.get('*', (req, res) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Client not built. Run npm run build in client directory.' });
    }
  });

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`HTTP server listening on http://localhost:${config.port}`);
    console.log(`WebSocket server listening on ws://localhost:${config.wsPort}`);
    console.log('\nDashboard is ready!');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    watcher.stop();
    wsServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    watcher.stop();
    wsServer.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
