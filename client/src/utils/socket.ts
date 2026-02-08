import { io, Socket } from 'socket.io-client';

// Default to same-origin in production (nginx proxies /socket.io -> server).
const fallbackHost = typeof window !== 'undefined' ? window.location.host : 'localhost:3001';
const fallbackProto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_URL = import.meta.env.VITE_WS_URL || `${fallbackProto}://${fallbackHost}`;

let socket: Socket | null = null;

export function getSocket(initData: string): Socket {
  if (socket) return socket;

  socket = io(WS_URL, {
    auth: { initData },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
