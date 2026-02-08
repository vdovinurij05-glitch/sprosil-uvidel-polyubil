import React, { useEffect, useState } from 'react';
import { useGameStore } from './store/useGameStore';
import { setInitData, apiFetch } from './utils/api';
import { useSocket } from './hooks/useSocket';
import { User } from './types';

import { GenderSelect } from './pages/GenderSelect';
import { StartScreen } from './pages/StartScreen';
import { LobbyScreen } from './pages/LobbyScreen';
import { RosterScreen } from './pages/RosterScreen';
import { QaRoundScreen } from './pages/QaRoundScreen';
import { VotingScreen } from './pages/VotingScreen';
import { ResultsScreen } from './pages/ResultsScreen';

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        initData: string;
        initDataUnsafe: any;
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: any;
        themeParams: any;
      };
    };
  }
}

const App: React.FC = () => {
  const { screen, setScreen, setUser, error, setError } = useGameStore();
  const [initData, setInitDataLocal] = useState('');

  // Initialize Telegram WebApp
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();

      const data = tg.initData;
      if (data) {
        setInitDataLocal(data);
        setInitData(data);
      } else if (import.meta.env.DEV) {
        // Dev mode: use mock data
        const mockData = 'mock_dev_mode';
        setInitDataLocal(mockData);
        setInitData(mockData);
      }
    } else if (import.meta.env.DEV) {
      const mockData = 'mock_dev_mode';
      setInitDataLocal(mockData);
      setInitData(mockData);
    }
  }, []);

  // Load user profile
  useEffect(() => {
    if (!initData) return;

    apiFetch<User>('/api/user/me')
      .then((user) => {
        setUser(user);
        if (!user.gender) {
          setScreen('gender');
        } else {
          setScreen('start');
        }
      })
      .catch((err) => {
        console.error('Failed to load user:', err);
        setScreen('gender');
      });
  }, [initData, setUser, setScreen]);

  // Connect socket
  useSocket(initData);

  // Render current screen
  const renderScreen = () => {
    switch (screen) {
      case 'loading':
        return <LoadingScreen />;
      case 'gender':
        return <GenderSelect />;
      case 'start':
        return <StartScreen initData={initData} />;
      case 'lobby':
        return <LobbyScreen />;
      case 'roster':
        return <RosterScreen initData={initData} />;
      case 'qa_rounds':
        return <QaRoundScreen initData={initData} />;
      case 'voting':
        return <VotingScreen initData={initData} />;
      case 'results':
        return <ResultsScreen initData={initData} />;
      default:
        return <LoadingScreen />;
    }
  };

  return (
    <div style={styles.app}>
      {error && (
        <div style={styles.errorBanner} onClick={() => setError(null)}>
          {error}
          <span style={{ marginLeft: 8, cursor: 'pointer' }}>x</span>
        </div>
      )}
      {renderScreen()}
    </div>
  );
};

const LoadingScreen: React.FC = () => (
  <div style={styles.loading}>
    <div style={styles.spinner} />
    <p style={{ color: '#888', marginTop: 16 }}>Загрузка...</p>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  app: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    minHeight: '100vh',
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
    position: 'relative',
  },
  errorBanner: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    padding: '12px 16px',
    backgroundColor: '#FF4444',
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    zIndex: 1000,
    cursor: 'pointer',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #e0e0e0',
    borderTopColor: '#FF6B6B',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

export default App;
