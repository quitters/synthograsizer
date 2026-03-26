import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Custom hook for Server-Sent Events (SSE)
 */
export function useEventSource(url, options = {}) {
  const eventSourceRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const handlersRef = useRef({});

  // Register event handlers
  const on = useCallback((event, handler) => {
    handlersRef.current[event] = handler;
  }, []);

  // Remove event handler
  const off = useCallback((event) => {
    delete handlersRef.current[event];
  }, []);

  // Connect to SSE
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onerror = (err) => {
      setError(err);
      setIsConnected(false);

      // Auto-reconnect after 3 seconds
      if (options.autoReconnect !== false) {
        setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    // Handle all events
    const eventTypes = [
      'connected',
      'state',
      'session_start',
      'session_end',
      'session_paused',
      'session_resumed',
      'agent_start',
      'chunk',
      'agent_complete',
      'message',
      'error',
      // Synth tool events
      'synth_executing',
      'synth_media',
      'synth_result',
      'synth_error',
      // Workflow engine events
      'workflow_submitted',
      'workflow_start',
      'workflow_step_start',
      'workflow_step_complete',
      'workflow_step_error',
      'workflow_complete',
      'workflow_cancelled',
      'workflow_error',
      'workflow_status',
      'workflow_cancel_result',
      'workflow_loop_iteration',
    ];

    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, (event) => {
        const handler = handlersRef.current[eventType];
        if (handler) {
          try {
            const data = JSON.parse(event.data);
            handler(data);
          } catch (e) {
            console.error(`Error parsing ${eventType} event:`, e);
          }
        }
      });
    });

    return eventSource;
  }, [url, options.autoReconnect]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    error,
    on,
    off,
    connect,
    disconnect
  };
}
