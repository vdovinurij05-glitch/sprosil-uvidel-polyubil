import React, { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getSocket } from "../utils/socket";
import { Timer } from "../components/Timer";
import { Avatar } from "../components/Avatar";
import type { FlatAnswerItem, QuestionItem } from "../types";

interface QaRoundScreenProps {
  initData: string;
}

type QuestionId = string;

type MiniPlayer = {
  userId: string;
  firstName: string;
  photoUrl: string | null;
  gender: "male" | "female";
};

const getOppositeGender = (g: "male" | "female") => (g === "male" ? "female" : "male");

export const QaRoundScreen: React.FC<QaRoundScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);
  const user = useGameStore((s) => s.user);

  const [activeQ, setActiveQ] = useState<QuestionId | null>(null);
  const [draftByQ, setDraftByQ] = useState<Record<string, string>>({});
  const [submittedByQ, setSubmittedByQ] = useState<Record<string, boolean>>({});

  if (!sessionState || !user || !user.gender) return null;

  const questions: QuestionItem[] = sessionState.questions || [];
  const allAnswers: FlatAnswerItem[] = sessionState.allAnswers || [];

  const allPlayers: MiniPlayer[] = useMemo(
    () => [...sessionState.males, ...sessionState.females].map((p) => ({ ...p, gender: p.gender as "male" | "female" })),
    [sessionState.males, sessionState.females],
  );

  const opposite = getOppositeGender(user.gender);
  const oppositePlayers = opposite === "male" ? sessionState.males : sessionState.females;

  // You can answer ONLY questions authored by opposite gender.
  const visibleQuestions = useMemo(() => {
    return questions.filter((q) => {
      const author = allPlayers.find((p) => p.userId === q.authorId);
      return author?.gender === opposite;
    });
  }, [questions, allPlayers, opposite]);

  const respondentsForQuestion = (q: QuestionItem) => {
    // Opposite gender question -> respondents are the user's gender.
    // E.g. if question author is female, respondents are males.
    return user.gender === "male" ? sessionState.males : sessionState.females;
  };

  const countAnswersForQuestion = (questionId: string) => allAnswers.filter((a) => a.questionId === questionId).length;
  const hasUserAnswered = (questionId: string) => allAnswers.some((a) => a.questionId === questionId && a.authorId === user.id);

  const isQuestionComplete = (q: QuestionItem) => {
    const total = respondentsForQuestion(q).length;
    const done = countAnswersForQuestion(q.id);
    return total > 0 && done >= total;
  };

  const myUnanswered = useMemo(() => visibleQuestions.filter((q) => !hasUserAnswered(q.id) && !submittedByQ[q.id]), [visibleQuestions, allAnswers, submittedByQ]);

  useEffect(() => {
    // When session changes, reset local state.
    setDraftByQ({});
    setSubmittedByQ({});
    setActiveQ(null);
  }, [sessionState.id, sessionState.status]);

  useEffect(() => {
    // Pick a sensible default question:
    // 1) first unanswered
    // 2) otherwise first visible
    if (visibleQuestions.length === 0) {
      setActiveQ(null);
      return;
    }
    const next = myUnanswered[0]?.id || visibleQuestions[0]?.id;
    setActiveQ((prev) => prev ?? next);
  }, [visibleQuestions, myUnanswered]);

  const activeQuestion = useMemo(() => visibleQuestions.find((q) => q.id === activeQ) || null, [visibleQuestions, activeQ]);

  const submitAnswer = (questionId: string) => {
    const text = (draftByQ[questionId] || "").trim();
    if (!text) return;

    const socket = getSocket(initData);
    socket.emit("answer:submit", { sessionId: sessionState.id, questionId, answer: text }, (res: any) => {
      if (res.ok) {
        setSubmittedByQ((prev) => ({ ...prev, [questionId]: true }));
        // Auto move to next unanswered question (if any).
        const next = myUnanswered.find((q) => q.id !== questionId);
        if (next) setActiveQ(next.id);
      } else {
        alert(res.error);
      }
    });
  };

  const TopBottomRoster: React.FC = () => {
    const renderRow = (players: typeof sessionState.males, label: string) => {
      const cells = [...players];
      while (cells.length < 3) {
        cells.push({
          userId: `__empty__${cells.length}`,
          telegramId: 0,
          firstName: "—",
          username: null,
          photoUrl: null,
          gender: label === "Парни" ? "male" : "female",
        } as any);
      }
      return (
        <div style={styles.rosterRowWrap}>
          <div style={styles.rosterRowTitle}>{label}</div>
          <div style={styles.rosterRow}>
            {cells.slice(0, 3).map((p) => {
              const isEmpty = (p as any).telegramId === 0 && p.firstName === "—";
              return (
                <div key={p.userId} style={{ ...styles.rosterCell, opacity: isEmpty ? 0.35 : 1 }}>
                  <Avatar photoUrl={p.photoUrl} firstName={p.firstName} size={42} />
                  <div style={styles.rosterName}>{p.firstName}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div style={styles.rosterWrap}>
        {renderRow(sessionState.males, "Парни")}
        <div style={styles.rosterSpacer} />
        {renderRow(sessionState.females, "Девушки")}
      </div>
    );
  };

  if (visibleQuestions.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.roundBadge}>Ответы</div>
        <Timer />
        <TopBottomRoster />
        <div style={styles.waitingMessage}>
          Нет вопросов от противоположной стороны. Ждём игроков...
        </div>
      </div>
    );
  }

  const QuestionPills: React.FC = () => {
    return (
      <div style={styles.pillsRow}>
        {visibleQuestions.map((q, idx) => {
          const done = isQuestionComplete(q);
          const mineDone = hasUserAnswered(q.id) || submittedByQ[q.id];
          const isActive = q.id === activeQ;
          return (
            <button
              key={q.id}
              onClick={() => setActiveQ(q.id)}
              style={{
                ...styles.pill,
                borderColor: isActive ? "#FF6B6B" : "#e7e7e7",
                background: isActive ? "rgba(255,107,107,0.10)" : "#fff",
                opacity: mineDone ? 0.85 : 1,
              }}
            >
              <span style={{ fontWeight: 900 }}>Вопрос {idx + 1}</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: done ? "#2ECC71" : "#999" }}>{done ? "готово" : "..."}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const CenterQuestionCard: React.FC<{ q: QuestionItem }> = ({ q }) => {
    const author = allPlayers.find((p) => p.userId === q.authorId) || null;
    const respondents = respondentsForQuestion(q);
    const total = respondents.length;
    const done = countAnswersForQuestion(q.id);
    const mineDone = hasUserAnswered(q.id) || submittedByQ[q.id];
    const complete = isQuestionComplete(q);

    return (
      <div style={styles.centerCard}>
        <div style={styles.centerCardTop}>
          <div style={styles.centerMeta}>
            {author && (
              <>
                <Avatar photoUrl={author.photoUrl} firstName={author.firstName} size={28} />
                <div style={{ fontSize: 12, color: "#777" }}>{author.firstName}</div>
              </>
            )}
          </div>
          <div style={styles.progressBadge}>
            {done}/{total}
          </div>
        </div>

        <div style={styles.questionText}>{q.text}</div>

        <div style={styles.respondentsRow}>
          {respondents.map((p) => {
            const ok = allAnswers.some((a) => a.questionId === q.id && a.authorId === p.userId);
            return (
              <div
                key={p.userId}
                style={{
                  ...styles.dot,
                  borderColor: ok ? "#2ECC71" : "#ddd",
                  backgroundColor: ok ? "rgba(46,204,113,0.12)" : "#fff",
                }}
                title={p.firstName}
              >
                <Avatar photoUrl={p.photoUrl} firstName={p.firstName} size={22} />
              </div>
            );
          })}
        </div>

        <div style={styles.answerArea}>
          {!mineDone ? (
            <>
              <textarea
                value={draftByQ[q.id] || ""}
                onChange={(e) => setDraftByQ((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder={"Твой ответ..."}
                maxLength={500}
                rows={3}
                style={styles.textarea}
              />
              <button
                onClick={() => submitAnswer(q.id)}
                disabled={!(draftByQ[q.id] || "").trim()}
                style={{
                  ...styles.button,
                  opacity: !(draftByQ[q.id] || "").trim() ? 0.5 : 1,
                }}
              >
                Отправить
              </button>
            </>
          ) : (
            <div style={styles.afterAnswerBox}>
              <div style={styles.afterAnswerTitle}>Ответ отправлен</div>
              {!complete ? (
                <div style={styles.waitHint}>Ждём остальных...</div>
              ) : (
                <div style={{ ...styles.waitHint, color: "#2ECC71" }}>Все ответы получены</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const waitingAllMineDone = myUnanswered.length === 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.roundBadge}>Ответы</div>
        <Timer />
      </div>

      <div style={styles.stage}>
        <div style={styles.stageTop}>
          <TopBottomRoster />
        </div>

        <div style={styles.stageCenter}>
          <QuestionPills />
          {activeQuestion && <CenterQuestionCard q={activeQuestion} />}
          {waitingAllMineDone && <div style={styles.waitingMessage}>Ты ответил на все вопросы. Ждём остальных...</div>}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 16,
    gap: 10,
    minHeight: "100vh",
    height: "100vh",
  },
  header: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  roundBadge: {
    padding: "6px 16px",
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    fontSize: 14,
    fontWeight: 700,
    color: "#444",
    marginTop: 8,
  },
  rosterWrap: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    border: "1px solid #eee",
    background: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
    padding: 12,
  },
  rosterRowWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  rosterRowTitle: {
    fontSize: 12,
    fontWeight: 900,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  rosterRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
  },
  rosterCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 14,
    border: "1px solid #f1f1f1",
    background: "#fafafa",
  },
  rosterName: {
    fontSize: 12,
    fontWeight: 800,
    color: "#333",
    maxWidth: 110,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rosterSpacer: {
    height: 10,
  },
  stage: {
    width: "100%",
    maxWidth: 420,
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 8,
  },
  stageTop: {
    display: "flex",
    justifyContent: "center",
  },
  stageCenter: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 12,
  },
  pillsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pill: {
    border: "2px solid #e7e7e7",
    background: "#fff",
    padding: "10px 12px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
  },
  centerCard: {
    borderRadius: 18,
    backgroundColor: "#fff",
    border: "1px solid #eee",
    boxShadow: "0 2px 14px rgba(0,0,0,0.07)",
    padding: 14,
  },
  centerCardTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  centerMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  progressBadge: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 900,
    color: "#4A90D9",
    background: "rgba(74,144,217,0.10)",
    padding: "3px 10px",
    borderRadius: 999,
  },
  questionText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: 800,
    color: "#1a1a1a",
    lineHeight: 1.35,
  },
  respondentsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12,
  },
  dot: {
    borderRadius: 999,
    border: "2px solid #ddd",
    padding: 2,
    background: "#fff",
  },
  answerArea: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  textarea: {
    width: "100%",
    borderRadius: 14,
    border: "1px solid #ddd",
    padding: 12,
    fontSize: 14,
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
  },
  afterAnswerBox: {
    width: "100%",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(0,0,0,0.03)",
    padding: 14,
    textAlign: "center",
  },
  afterAnswerTitle: {
    fontSize: 15,
    fontWeight: 900,
    color: "#333",
    marginBottom: 6,
  },
  button: {
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    backgroundColor: "#FF6B6B",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  waitingMessage: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "#f5f5f5",
    fontSize: 14,
    fontWeight: 700,
    color: "#555",
    textAlign: "center",
  },
  waitHint: {
    fontSize: 13,
    fontWeight: 800,
    color: "#777",
    textAlign: "center",
  },
};
