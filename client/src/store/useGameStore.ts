import { create } from 'zustand';
import { SessionState, MatchResult, User } from '../types';

type Screen = 'loading' | 'gender' | 'start' | 'lobby' | 'roster' | 'qa_rounds' | 'voting' | 'results';

interface GameStore {
  screen: Screen;
  user: User | null;
  sessionId: string | null;
  sessionState: SessionState | null;
  matches: MatchResult[];
  timer: number;
  error: string | null;

  setScreen: (screen: Screen) => void;
  setUser: (user: User) => void;
  setSession: (sessionId: string, state: SessionState) => void;
  updateSession: (state: SessionState) => void;
  setMatches: (matches: MatchResult[]) => void;
  setTimer: (seconds: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  screen: 'loading',
  user: null,
  sessionId: null,
  sessionState: null,
  matches: [],
  timer: 0,
  error: null,

  setScreen: (screen) => set({ screen }),
  setUser: (user) => set({ user }),
  setSession: (sessionId, state) => set({ sessionId, sessionState: state }),
  updateSession: (state) => {
    set((prev) => {
      let screen: Screen = prev.screen;
      if (state.status === 'lobby') screen = 'lobby';
      else if (state.status === 'roster') screen = 'roster';
      else if (state.status === 'qa_rounds') screen = 'qa_rounds';
      else if (state.status === 'voting') screen = 'voting';
      else if (state.status === 'results') screen = 'results';
      return { sessionState: state, screen };
    });
  },
  setMatches: (matches) => set({ matches }),
  setTimer: (seconds) => set({ timer: seconds }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      screen: 'start',
      sessionId: null,
      sessionState: null,
      matches: [],
      timer: 0,
      error: null,
    }),
}));
