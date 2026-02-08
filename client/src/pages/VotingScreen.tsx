import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getSocket } from '../utils/socket';
import { Timer } from '../components/Timer';
import { Avatar } from '../components/Avatar';

interface VotingScreenProps {
  initData: string;
}

export const VotingScreen: React.FC<VotingScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);
  const user = useGameStore((s) => s.user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);

  if (!sessionState || !sessionState.currentQuestion || !user) return null;

  const question = sessionState.currentQuestion;
  const answers = sessionState.answers || [];

  // Find author
  const allPlayers = [...sessionState.males, ...sessionState.females];
  const author = allPlayers.find((p) => p.userId === question.authorId);

  // Voter must be same gender as question author (they judge opposite gender answers)
  const canVote = user.gender === author?.gender;

  // Reset local selection state when the question changes (new voting round).
  useEffect(() => {
    setSelectedId(null);
    setVoted(false);
  }, [question.id]);

  const handleVote = () => {
    if (!selectedId) return;

    const socket = getSocket(initData);
    socket.emit(
      'vote:submit',
      {
        sessionId: sessionState.id,
        questionId: question.id,
        votedForId: selectedId,
      },
      (res: any) => {
        if (res.ok) {
          setVoted(true);
        } else {
          alert(res.error);
        }
      },
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.roundBadge}>
        Голосование: раунд {sessionState.currentRound}/{sessionState.totalRounds}
      </div>

      <Timer />

      <div style={styles.questionCard}>
        <p style={styles.questionLabel}>Вопрос:</p>
        <p style={styles.questionText}>{question.text}</p>
      </div>

      {canVote && !voted && (
        <>
          <p style={styles.instruction}>Выбери лучший ответ:</p>
          <div style={styles.answersList}>
            {answers.map((a) => {
              const player = allPlayers.find((p) => p.userId === a.authorId);
              if (!player) return null;

              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedId(a.authorId)}
                  style={{
                    ...styles.answerCard,
                    borderColor: selectedId === a.authorId ? '#FF6B6B' : '#e0e0e0',
                    backgroundColor: selectedId === a.authorId ? 'rgba(255,107,107,0.05)' : '#fff',
                  }}
                >
                  <div style={styles.answerHeader}>
                    <Avatar photoUrl={player.photoUrl} firstName={player.firstName} size={32} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{player.firstName}</span>
                    {selectedId === a.authorId && <span style={styles.selectedBadge}>♥</span>}
                  </div>
                  <p style={styles.answerText}>{a.text}</p>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleVote}
            disabled={!selectedId}
            style={{
              ...styles.button,
              opacity: !selectedId ? 0.5 : 1,
            }}
          >
            Выбрать
          </button>
        </>
      )}

      {canVote && voted && (
        <div style={styles.waitingMessage}>
          Голос принят! Ждём остальных...
        </div>
      )}

      {!canVote && (
        <div style={styles.waitingMessage}>
          Твои ответы оценивают... Ждём результат!
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 24,
    gap: 16,
    minHeight: '100vh',
  },
  roundBadge: {
    padding: '6px 16px',
    borderRadius: 20,
    backgroundColor: '#fff0f0',
    fontSize: 14,
    fontWeight: 600,
    color: '#FF6B6B',
    marginTop: 16,
  },
  questionCard: {
    width: '100%',
    maxWidth: 360,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#f8f8f8',
  },
  questionLabel: {
    margin: 0,
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  questionText: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
  },
  instruction: {
    fontSize: 15,
    fontWeight: 600,
    color: '#444',
  },
  answersList: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  answerCard: {
    padding: 14,
    borderRadius: 14,
    border: '2px solid #e0e0e0',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  answerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  selectedBadge: {
    marginLeft: 'auto',
    color: '#FF6B6B',
    fontSize: 18,
  },
  answerText: {
    margin: 0,
    fontSize: 15,
    color: '#333',
    lineHeight: 1.4,
  },
  button: {
    padding: '14px 40px',
    borderRadius: 14,
    border: 'none',
    backgroundColor: '#FF6B6B',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    maxWidth: 360,
  },
  waitingMessage: {
    padding: '16px 24px',
    borderRadius: 14,
    backgroundColor: '#f0f8ff',
    color: '#4A90D9',
    fontSize: 15,
    fontWeight: 500,
    marginTop: 20,
  },
};
