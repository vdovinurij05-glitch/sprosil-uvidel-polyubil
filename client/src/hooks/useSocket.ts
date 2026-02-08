import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from '../utils/socket';
import { useGameStore } from '../store/useGameStore';
import { SessionState } from '../types';

export function useSocket(initData: string) {
  const socketRef = useRef<Socket | null>(null);
  const { updateSession, setTimer, setError } = useGameStore();

  useEffect(() => {
    if (!initData) return;

    const socket = getSocket(initData);
    socketRef.current = socket;

    socket.on('session:update', (state: SessionState) => {
      updateSession(state);
    });

    socket.on('session:closed', (data: { reason: string }) => {
      setError(data.reason);
      useGameStore.getState().setScreen('start');
    });

    socket.on('timer:tick', (data: { phase: string; remaining: number }) => {
      setTimer(data.remaining);
    });

    socket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err.message);
    });

    return () => {
      socket.off('session:update');
      socket.off('session:closed');
      socket.off('timer:tick');
      socket.off('connect_error');
    };
  }, [initData, updateSession, setTimer, setError]);

  return socketRef;
}
