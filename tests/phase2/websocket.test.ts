/// <reference types="vitest/globals" />
// Test globals (describe/it/expect/beforeEach/afterEach/vi) are injected
// by Vitest via `globals: true` in vitest.config.ts — no import needed.
import { wsClient } from '../../src/lib/websocket';

describe('phase2 websocket client', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    wsClient.disconnect();
  });

  afterEach(() => {
    if (typeof originalWebSocket === 'undefined') {
      vi.stubGlobal('WebSocket', undefined);
    } else {
      vi.stubGlobal('WebSocket', originalWebSocket);
    }
    vi.restoreAllMocks();
    wsClient.disconnect();
  });

  it('notifies current status immediately on subscription', () => {
    const statuses: string[] = [];
    const unsubscribe = wsClient.onStatusChange((status) => {
      statuses.push(status);
    });

    expect(statuses[0]).toBe('disconnected');
    unsubscribe();
  });

  it('does not connect without token', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    wsClient.connect('');

    expect(warnSpy).toHaveBeenCalledWith('[WebSocket] No token provided, cannot connect');
    expect(wsClient.getStatus()).toBe('disconnected');
  });

  it('falls back to disconnected when WebSocket is unavailable', () => {
    vi.stubGlobal('WebSocket', undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    wsClient.connect('token-value');

    expect(warnSpy).toHaveBeenCalledWith('[WebSocket] WebSocket not supported in this environment');
    expect(wsClient.getStatus()).toBe('disconnected');
  });
});