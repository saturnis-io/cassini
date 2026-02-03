import { useEffect, useRef, useCallback } from 'react';
import { useDashboardStore } from '../store/dashboardStore';

const WS_RECONNECT_DELAY = 3000;
const WS_PORT = 3002;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const {
    setConnected,
    setWorkflow,
    setConfig,
    setRoster,
    addProposal,
    updateProposal,
    addArtifact,
    addActivity,
    setPhases,
    setInitialState,
  } = useDashboardStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `ws://${window.location.hostname}:${WS_PORT}`;
    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      wsRef.current = null;

      // Attempt to reconnect
      reconnectTimeoutRef.current = window.setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, WS_RECONNECT_DELAY);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }, [setConnected]);

  const handleMessage = useCallback(
    (message: { type: string; payload: unknown }) => {
      console.log('Received message:', message.type, message.payload);

      switch (message.type) {
        case 'initial:state':
          setInitialState(message.payload as Parameters<typeof setInitialState>[0]);
          break;

        case 'state:update':
          setWorkflow(message.payload as Parameters<typeof setWorkflow>[0]);
          break;

        case 'config:update':
          setConfig(message.payload as Parameters<typeof setConfig>[0]);
          break;

        case 'roster:update':
          setRoster(message.payload as Parameters<typeof setRoster>[0]);
          break;

        case 'proposal:new':
          addProposal(message.payload as Parameters<typeof addProposal>[0]);
          break;

        case 'proposal:resolved':
          updateProposal(message.payload as Parameters<typeof updateProposal>[0]);
          break;

        case 'artifact:created':
          addArtifact(message.payload as Parameters<typeof addArtifact>[0]);
          break;

        case 'activity:log':
          addActivity(message.payload as Parameters<typeof addActivity>[0]);
          break;

        case 'roadmap:update':
          setPhases(message.payload as Parameters<typeof setPhases>[0]);
          break;

        case 'phase:progress':
          // Could update specific phase, for now just log
          addActivity({
            id: `phase-${Date.now()}`,
            timestamp: new Date().toISOString(),
            action: `Phase ${(message.payload as { phase: number }).phase} updated`,
            type: 'info',
          });
          break;

        case 'connection:status':
          // Already handled by onopen
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    },
    [
      setInitialState,
      setWorkflow,
      setConfig,
      setRoster,
      addProposal,
      updateProposal,
      addArtifact,
      addActivity,
      setPhases,
    ]
  );

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    reconnect: connect,
  };
}
