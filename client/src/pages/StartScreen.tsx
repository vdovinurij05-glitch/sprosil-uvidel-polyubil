import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getSocket } from '../utils/socket';

interface StartScreenProps {
  initData: string;
}

export const StartScreen: React.FC<StartScreenProps> = ({ initData }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const { setSession, updateSession, setError } = useGameStore();

  const handleSubmit = () => {
    if (!question.trim() || question.trim().length < 3) {
      setError('Вопрос должен быть не менее 3 символов');
      return;
    }

    setLoading(true);
    const socket = getSocket(initData);

    socket.emit('lobby:join', { question: question.trim() }, (res: any) => {
      setLoading(false);
      if (res.ok) {
        setSession(res.sessionId, res.state);
        updateSession(res.state);
      } else {
        setError(res.error || 'Не удалось присоединиться');
      }
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Спросил, увидел, полюбил</h1>
        <p style={styles.subtitle}>Задай любой вопрос. Его увидит человек противоположного пола.</p>
      </div>

      <div style={styles.inputArea}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Например: Какое твоё самое безумное приключение?"
          maxLength={500}
          style={styles.textarea}
          rows={3}
        />
        <span style={styles.charCount}>{question.length}/500</span>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || question.trim().length < 3}
        style={{
          ...styles.button,
          opacity: loading || question.trim().length < 3 ? 0.5 : 1,
        }}
      >
        {loading ? 'Отправляем...' : 'Отправить вопрос'}
      </button>

      {useGameStore.getState().error && (
        <p style={styles.error}>{useGameStore.getState().error}</p>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
    gap: 32,
  },
  header: {
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    lineHeight: 1.4,
  },
  inputArea: {
    width: '100%',
    maxWidth: 360,
    position: 'relative',
  },
  textarea: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    border: '2px solid #e0e0e0',
    fontSize: 16,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 12,
    color: '#999',
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
    transition: 'all 0.2s',
    width: '100%',
    maxWidth: 360,
  },
  error: {
    color: '#FF4444',
    fontSize: 14,
    textAlign: 'center',
  },
};
