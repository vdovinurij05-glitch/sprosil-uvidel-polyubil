import React, { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getSocket } from '../utils/socket';
import { PlayerCard } from '../components/PlayerCard';

interface RosterScreenProps {
  initData: string;
}

export const RosterScreen: React.FC<RosterScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);

  useEffect(() => {
    // Auto-advance after 5 seconds showing roster
    const timer = setTimeout(() => {
      if (sessionState) {
        const socket = getSocket(initData);
        socket.emit('roster:ready', { sessionId: sessionState.id }, () => {});
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [sessionState, initData]);

  if (!sessionState) return null;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Игроки собраны!</h2>
      <p style={styles.subtitle}>Сейчас начнётся игра...</p>

      <div style={styles.columns}>
        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <span>👨</span>
            <span style={styles.columnLabel}>Мужчины</span>
          </div>
          {sessionState.males.map((p) => (
            <PlayerCard key={p.userId} player={p} />
          ))}
        </div>

        <div style={styles.versus}>VS</div>

        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <span>👩</span>
            <span style={styles.columnLabel}>Женщины</span>
          </div>
          {sessionState.females.map((p) => (
            <PlayerCard key={p.userId} player={p} />
          ))}
        </div>
      </div>

      <div style={styles.info}>
        <p>{sessionState.totalRounds} раундов вопросов</p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 24,
    gap: 24,
    minHeight: '100vh',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    margin: 0,
  },
  columns: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    minWidth: 100,
  },
  columnHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  columnLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#444',
  },
  versus: {
    fontSize: 20,
    fontWeight: 800,
    color: '#FF6B6B',
    padding: '40px 8px',
  },
  info: {
    fontSize: 14,
    color: '#888',
  },
};
