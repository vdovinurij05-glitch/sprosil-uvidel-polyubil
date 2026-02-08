import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getSocket } from '../utils/socket';
import { Timer } from '../components/Timer';
import { Avatar } from '../components/Avatar';
import type { FlatAnswerItem, QuestionItem } from '../types';

interface VotingScreenProps {
  initData: string;
}

type ChoiceId = string | '__none__';

export const VotingScreen: React.FC<VotingScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);
  const user = useGameStore((s) => s.user);
  const [selectedId, setSelectedId] = useState<ChoiceId | null>(null);
  const [voted, setVoted] = useState(false);

  if (!sessionState || !user) return null;

  const allPlayers = useMemo(() => [...sessionState.males, ...sessionState.females], [sessionState.males, sessionState.females]);
  const questions: QuestionItem[] = sessionState.questions || [];
  const allAnswers: FlatAnswerItem[] = sessionState.allAnswers || [];

  const candidates = user.gender === 'male' ? sessionState.females : sessionState.males;

  const myQuestions = useMemo(() => {
    return questions.filter((q) => {
      const author = allPlayers.find((p) => p.userId === q.authorId);
      return author?.gender === user.gender;
    });
  }, [questions, allPlayers, user.gender]);

  useEffect(() => {
    setSelectedId(null);
    setVoted(false);
  }, [sessionState.id, sessionState.status]);

  const getCandidateQA = (candidateId: string) => {
    return myQuestions.map((q) => {
      const a = allAnswers.find((x) => x.questionId === q.id && x.authorId === candidateId);
      return { q, a: a?.text || null };
    });
  };

  const handleVote = () => {
    if (selectedId === null) return;

    const socket = getSocket(initData);
    socket.emit(
      'vote:submit',
      {
        sessionId: sessionState.id,
        votedForId: selectedId === '__none__' ? null : selectedId,
      },
      (res: any) => {
        if (res.ok) setVoted(true);
        else alert(res.error);
      },
    );
  };

  // Voting screen expects server to provide questions+allAnswers. If not present, show a safe fallback message.
  if (questions.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.roundBadge}>Выбор</div>
        <Timer />
        <div style={styles.waitingMessage}>Готовим данные для выбора...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.roundBadge}>Выбор: один человек или "никого"</div>

      <Timer />

      {!voted && (
        <>
          <p style={styles.instruction}>Посмотри ответы и выбери одного:</p>

          <div style={styles.answersList}>
            {candidates.map((player) => {
              const qa = getCandidateQA(player.userId);

              return (
                <div
                  key={player.userId}
                  onClick={() => setSelectedId(player.userId)}
                  style={{
                    ...styles.answerCard,
                    borderColor: selectedId === player.userId ? '#FF6B6B' : '#e0e0e0',
                    backgroundColor: selectedId === player.userId ? 'rgba(255,107,107,0.05)' : '#fff',
                  }}
                >
                  <div style={styles.answerHeader}>
                    <Avatar photoUrl={player.photoUrl} firstName={player.firstName} size={32} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{player.firstName}</span>
                    {selectedId === player.userId && <span style={styles.selectedBadge}>♥</span>}
                  </div>

                  {qa.map(({ q, a }) => (
                    <div key={q.id} style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{q.text}</div>
                      <div style={{ fontSize: 14, color: '#333', lineHeight: 1.35 }}>{a ?? '—'}</div>
                    </div>
                  ))}
                </div>
              );
            })}

            <div
              onClick={() => setSelectedId('__none__')}
              style={{
                ...styles.answerCard,
                borderColor: selectedId === '__none__' ? '#FF6B6B' : '#e0e0e0',
                backgroundColor: selectedId === '__none__' ? 'rgba(255,107,107,0.05)' : '#fff',
              }}
            >
              <div style={styles.answerHeader}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Никого</span>
                {selectedId === '__none__' && <span style={styles.selectedBadge}>♥</span>}
              </div>
              <p style={styles.answerText}>Пропустить выбор</p>
            </div>
          </div>

          <button
            onClick={handleVote}
            disabled={selectedId === null}
            style={{
              ...styles.button,
              opacity: selectedId === null ? 0.5 : 1,
            }}
          >
            Выбрать
          </button>
        </>
      )}

      {voted && <div style={styles.waitingMessage}>Выбор принят! Ждём остальных...</div>}
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
  instruction: {
    fontSize: 15,
    fontWeight: 600,
    color: '#444',
    textAlign: 'center',
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
    backgroundColor: '#fff',
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
    textAlign: 'center',
  },
};

