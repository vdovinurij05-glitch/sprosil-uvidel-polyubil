import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getSocket } from '../utils/socket';
import { Timer } from '../components/Timer';
import { Avatar } from '../components/Avatar';

interface QaRoundScreenProps {
  initData: string;
}

export const QaRoundScreen: React.FC<QaRoundScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);
  const user = useGameStore((s) => s.user);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!sessionState || !sessionState.currentQuestion || !user) return null;

  const question = sessionState.currentQuestion;
  const isMyQuestion = question.authorId === user.id;

  // Reset local input state when the question changes (new round).
  useEffect(() => {
    setAnswer('');
    setSubmitted(false);
  }, [question.id]);

  // Find author
  const allPlayers = [...sessionState.males, ...sessionState.females];
  const author = allPlayers.find((p) => p.userId === question.authorId);

  // User answers if they are opposite gender from author
  const authorGender = author?.gender;
  const canAnswer = !isMyQuestion && user.gender !== authorGender;

  const handleSubmit = () => {
    if (!answer.trim()) return;

    const socket = getSocket(initData);
    socket.emit(
      'answer:submit',
      {
        sessionId: sessionState.id,
        questionId: question.id,
        answer: answer.trim(),
      },
      (res: any) => {
        if (res.ok) {
          setSubmitted(true);
        } else {
          alert(res.error);
        }
      },
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.roundBadge}>
        Раунд {sessionState.currentRound}/{sessionState.totalRounds}
      </div>

      <Timer />

      <div style={styles.questionCard}>
        {author && (
          <div style={styles.questionAuthor}>
            <Avatar photoUrl={author.photoUrl} firstName={author.firstName} size={28} />
            <span style={{ fontSize: 13, color: '#888' }}>спрашивает {author.firstName}:</span>
          </div>
        )}
        <p style={styles.questionText}>{question.text}</p>
      </div>

      {canAnswer && !submitted && (
        <div style={styles.answerArea}>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Твой ответ..."
            maxLength={500}
            style={styles.textarea}
            rows={3}
          />
          <button
            onClick={handleSubmit}
            disabled={!answer.trim()}
            style={{
              ...styles.button,
              opacity: !answer.trim() ? 0.5 : 1,
            }}
          >
            Отправить ответ
          </button>
        </div>
      )}

      {canAnswer && submitted && (
        <div style={styles.waitingMessage}>
          Ответ отправлен! Ждём остальных...
        </div>
      )}

      {isMyQuestion && (
        <div style={styles.waitingMessage}>
          Это твой вопрос! Ждём ответы...
        </div>
      )}

      {!canAnswer && !isMyQuestion && (
        <div style={styles.waitingMessage}>
          Ждём ответы...
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
    gap: 20,
    minHeight: '100vh',
    justifyContent: 'center',
  },
  roundBadge: {
    padding: '6px 16px',
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    fontSize: 14,
    fontWeight: 600,
    color: '#444',
  },
  questionCard: {
    width: '100%',
    maxWidth: 360,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#fff',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  questionAuthor: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  questionText: {
    fontSize: 18,
    fontWeight: 600,
    color: '#1a1a1a',
    lineHeight: 1.4,
    margin: 0,
  },
  answerArea: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  textarea: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    border: '2px solid #e0e0e0',
    fontSize: 16,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
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
  },
  waitingMessage: {
    padding: '16px 24px',
    borderRadius: 14,
    backgroundColor: '#f0f8ff',
    color: '#4A90D9',
    fontSize: 15,
    fontWeight: 500,
  },
};
