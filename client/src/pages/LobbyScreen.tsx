import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Avatar } from '../components/Avatar';

export const LobbyScreen: React.FC = () => {
  const sessionState = useGameStore((s) => s.sessionState);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!sessionState) return null;

  const maleCount = sessionState.males.length;
  const femaleCount = sessionState.females.length;
  const maxPerGender = 3;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Ищем игроков</h2>
        <div style={styles.timer}>{elapsed}с</div>
      </div>

      <div style={styles.statusBox}>
        <div style={styles.genderStatus}>
          <span style={styles.genderIcon}>👨</span>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${(maleCount / maxPerGender) * 100}%`,
                backgroundColor: '#4A90D9',
              }}
            />
          </div>
          <span style={styles.count}>{maleCount}/{maxPerGender}</span>
        </div>

        <div style={styles.genderStatus}>
          <span style={styles.genderIcon}>👩</span>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${(femaleCount / maxPerGender) * 100}%`,
                backgroundColor: '#E91E63',
              }}
            />
          </div>
          <span style={styles.count}>{femaleCount}/{maxPerGender}</span>
        </div>
      </div>

      <div style={styles.players}>
        {[...sessionState.males, ...sessionState.females].map((p) => (
          <div key={p.userId} style={styles.playerChip}>
            <Avatar photoUrl={p.photoUrl} firstName={p.firstName} size={32} />
            <span style={{ fontSize: 13 }}>{p.firstName}</span>
          </div>
        ))}
      </div>

      <p style={styles.hint}>
        Нужно минимум 2 мужчины и 2 женщины. Максимум 3+3. Ожидание до 90 секунд.
      </p>
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
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: 0,
  },
  timer: {
    padding: '4px 12px',
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    fontSize: 16,
    fontWeight: 600,
    color: '#666',
  },
  statusBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  genderStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  genderIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  count: {
    fontSize: 14,
    fontWeight: 600,
    width: 30,
    textAlign: 'right',
  },
  players: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  playerChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px 4px 4px',
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 1.4,
  },
};
