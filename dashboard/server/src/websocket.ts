import { WebSocketServer, WebSocket } from 'ws';
import type { WSMessage, WSEventType } from './types.js';

export class DashboardWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      console.log('Client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send connection confirmation
      this.sendTo(ws, {
        type: 'connection:status',
        payload: { connected: true },
        timestamp: new Date().toISOString(),
      });
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    console.log(`WebSocket server started on port ${port}`);
  }

  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  sendTo(client: WebSocket, message: WSMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  sendInitialState(client: WebSocket, state: unknown): void {
    this.sendTo(client, {
      type: 'initial:state',
      payload: state,
      timestamp: new Date().toISOString(),
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.wss.close();
  }

  onConnection(callback: (ws: WebSocket) => void): void {
    this.wss.on('connection', callback);
  }
}
