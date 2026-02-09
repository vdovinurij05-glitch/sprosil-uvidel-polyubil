import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getSocket } from '../utils/socket';
import { Timer } from '../components/Timer';
import { Avatar } from '../components/Avatar';
import type { FlatAnswerItem, QuestionItem } from '../types';

interface QaRoundScreenProps {
  initData: string;
}

export const QaRoundScreen: React.FC<QaRoundScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);
  const user = useGameStore((s) => s.user);

  const [draftByQ, setDraftByQ] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  if (!sessionState || !user) return null;

  const questions: QuestionItem[] = sessionState.questions || [];
  const allAnswers: FlatAnswerItem[] = sessionState.allAnswers || [];
  const allPlayers = useMemo(() => [...sessionState.males, ...sessionState.females], [sessionState.males, sessionState.females]);

  const maleQuestions = questions.filter((q) => {
    const a = allPlayers.find((p) => p.userId === q.authorId);
    return a?.gender === 'male';
  });
  const femaleQuestions = questions.filter((q) => {
    const a = allPlayers.find((p) => p.userId === q.authorId);
    return a?.gender === 'female';
  });

  // You answer opposite gender questions.
  const canAnswerQuestion = (q: QuestionItem) => {
    const author = allPlayers.find((p) => p.userId === q.authorId);
    return author?.gender && author.gender !== user.gender;
  };

  const respondentsForQuestion = (q: QuestionItem) => {
    const author = allPlayers.find((p) => p.userId === q.authorId);
    if (!author) return [];
    return author.gender === 'male' ? sessionState.females : sessionState.males;
  };

  const answerCountForQuestion = (questionId: string) => allAnswers.filter((a) => a.questionId === questionId).length;

  const hasUserAnswered = (questionId: string, userId: string) =>
    allAnswers.some((a) => a.questionId === questionId && a.authorId === userId);

  // When session changes, reset local state.
  useEffect(() => {
    setDraftByQ({});
    setSubmitted({});
  }, [sessionState.id, sessionState.status]);

  const submitAnswer = (questionId: string) => {
    const text = (draftByQ[questionId] || '').trim();
    if (!text) return;

    const socket = getSocket(initData);
    socket.emit(
      'answer:submit',
      { sessionId: sessionState.id, questionId, answer: text },
      (res: any) => {
        if (res.ok) {
          setSubmitted((prev) => ({ ...prev, [questionId]: true }));
        } else {
          alert(res.error);
        }
      },
    );
  };

  const QuestionCard: React.FC<{ q: QuestionItem }> = ({ q }) => {
    const author = allPlayers.find((p) => p.userId === q.authorId);
    const respondents = respondentsForQuestion(q);
    const total = respondents.length;
    const done = answerCountForQuestion(q.id);
    const iCanAnswer = canAnswerQuestion(q);
    const already = hasUserAnswered(q.id, user.id) || submitted[q.id];

    return (
      <div style={styles.qCard}>
        <div style={styles.qHeader}>
          {author && (
            <>
              <Avatar photoUrl={author.photoUrl} firstName={author.firstName} size={26} />
              <div style={{ fontSize: 12, color: '#777' }}>{author.firstName}</div>
            </>
          )}
          <div style={styles.qProgress}>
            {done}/{total}
          </div>
        </div>

        <div style={styles.qText}>{q.text}</div>

        <div style={styles.respondentsRow}>
          {respondents.map((p) => {
            const ok = hasUserAnswered(q.id, p.userId);
            return (
              <div
                key={p.userId}
                style={{
                  ...styles.dot,
                  borderColor: ok ? '#2ECC71' : '#ddd',
                  backgroundColor: ok ? 'rgba(46,204,113,0.12)' : '#fff',
                }}
                title={p.firstName}
              >
                <Avatar photoUrl={p.photoUrl} firstName={p.firstName} size={22} />
              </div>
            );
          })}
        </div>

        {iCanAnswer && (
          <div style={styles.answerArea}>
            <textarea
              value={draftByQ[q.id] || ''}
              onChange={(e) => setDraftByQ((prev) => ({ ...prev, [q.id]: e.target.value }))}
              placeholder={already ? 'Ответ отправлен' : 'Твой ответ...'}
              disabled={already}
              maxLength={500}
              rows={2}
              style={{ ...styles.textarea, opacity: already ? 0.7 : 1 }}
            />
            <button
              onClick={() => submitAnswer(q.id)}
              disabled={already || !(draftByQ[q.id] || '').trim()}
              style={{
                ...styles.button,
                opacity: already || !(draftByQ[q.id] || '').trim() ? 0.5 : 1,
              }}
            >
              {already ? 'Отправлено' : 'Отправить'}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (questions.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.roundBadge}>Ответы</div>
        <Timer />
        <div style={styles.waitingMessage}>Ждём вопросы...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.roundBadge}>Раунд ответов: все вопросы сразу</div>

      <Timer />

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Вопросы парней</div>
        <div style={styles.grid}>
          {maleQuestions.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Вопросы девушек</div>
        <div style={styles.grid}>
          {femaleQuestions.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 16,
    gap: 16,
    minHeight: '100vh',
  },
  roundBadge: {
    padding: '6px 16px',
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    fontSize: 14,
    fontWeight: 600,
    color: '#444',
    marginTop: 8,
  },
  section: {
    width: '100%',
    maxWidth: 420,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#666',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  qCard: {
    borderRadius: 16,
    backgroundColor: '#fff',
    border: '1px solid #eee',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
    padding: 14,
  },
  qHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  qProgress: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: 700,
    color: '#4A90D9',
    background: 'rgba(74,144,217,0.10)',
    padding: '3px 10px',
    borderRadius: 999,
  },
  qText: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: 650,
    color: '#1a1a1a',
    lineHeight: 1.35,
  },
  respondentsRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  dot: {
    borderRadius: 999,
    border: '2px solid #ddd',
    padding: 2,
    background: '#fff',
  },
  answerArea: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  textarea: {
    width: '100%',
    padding: 12,
    borderRadius: 14,
    border: '2px solid #e0e0e0',
    fontSize: 14,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
  },
  button: {
    padding: '12px 14px',
    borderRadius: 14,
    border: 'none',
    backgroundColor: '#FF6B6B',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
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

