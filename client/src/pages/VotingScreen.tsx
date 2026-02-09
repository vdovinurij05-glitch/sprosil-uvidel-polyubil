import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getSocket } from "../utils/socket";
import { Timer } from "../components/Timer";
import { Avatar } from "../components/Avatar";
import type { FinalVoteItem, FlatAnswerItem, QuestionItem } from "../types";

interface VotingScreenProps {
  initData: string;
}

type ChoiceId = string | "__none__";

type Point = { x: number; y: number };

type VoteArrow = {
  key: string;
  from: Point;
  to: Point;
  animated: boolean;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const VotingScreen: React.FC<VotingScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);
  const user = useGameStore((s) => s.user);
  const [selectedId, setSelectedId] = useState<ChoiceId | null>(null);
  const [voted, setVoted] = useState(false);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const nodeRefByUserId = useRef<Record<string, HTMLDivElement | null>>({});
  const seenVotesRef = useRef<Map<string, string | null>>(new Map());
  const [layoutTick, setLayoutTick] = useState(0);
  const [arrows, setArrows] = useState<VoteArrow[]>([]);

  if (!sessionState || !user) return null;

  const allPlayers = useMemo(() => [...sessionState.males, ...sessionState.females], [sessionState.males, sessionState.females]);
  const questions: QuestionItem[] = sessionState.questions || [];
  const allAnswers: FlatAnswerItem[] = sessionState.allAnswers || [];
  const finalVotes: FinalVoteItem[] = sessionState.finalVotes || [];

  const votedBy = useMemo(() => new Map(finalVotes.map((v) => [v.voterId, v.votedForId])), [finalVotes]);

  const candidates = user.gender === "male" ? sessionState.females : sessionState.males;

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

  useEffect(() => {
    const onResize = () => setLayoutTick((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      "vote:submit",
      {
        sessionId: sessionState.id,
        votedForId: selectedId === "__none__" ? null : selectedId,
      },
      (res: any) => {
        if (res.ok) setVoted(true);
        else alert(res.error);
      },
    );
  };

  if (questions.length === 0) {
    return (
      <div style={styles.container}>
        <style>{css}</style>
        <div style={styles.roundBadge}>Выбор</div>
        <Timer />
        <div style={styles.waitingMessage}>Готовим данные для выбора...</div>
      </div>
    );
  }

  useLayoutEffect(() => {
    const boardEl = boardRef.current;
    if (!boardEl) return;

    const boardRect = boardEl.getBoundingClientRect();

    const nextArrows: VoteArrow[] = [];

    for (const v of finalVotes) {
      if (!v.votedForId) continue;

      const fromEl = nodeRefByUserId.current[v.voterId];
      const toEl = nodeRefByUserId.current[v.votedForId];
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const from: Point = {
        x: fromRect.left - boardRect.left + fromRect.width / 2,
        y: fromRect.top - boardRect.top + fromRect.height / 2,
      };
      const to: Point = {
        x: toRect.left - boardRect.left + toRect.width / 2,
        y: toRect.top - boardRect.top + toRect.height / 2,
      };

      const prev = seenVotesRef.current.get(v.voterId);
      const animated = prev === undefined && v.votedForId !== null;

      nextArrows.push({
        key: `${v.voterId}->${v.votedForId}`,
        from,
        to,
        animated,
      });
    }

    for (const v of finalVotes) {
      seenVotesRef.current.set(v.voterId, v.votedForId);
    }

    setArrows(nextArrows);
  }, [finalVotes, layoutTick]);

  const totalVoters = sessionState.males.length + sessionState.females.length;
  const totalVoted = finalVotes.length;

  const maleVoted = sessionState.males.filter((p) => votedBy.has(p.userId)).length;
  const femaleVoted = sessionState.females.filter((p) => votedBy.has(p.userId)).length;

  const ArrowSvg = () => {
    return (
      <svg style={styles.arrowSvg} width="100%" height="100%" aria-hidden="true">
        <defs>
          <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#FF6B6B" />
          </marker>
        </defs>

        {arrows.map((a) => {
          const dx = a.to.x - a.from.x;
          const dy = a.to.y - a.from.y;
          const bend = clamp(Math.hypot(dx, dy) * 0.25, 24, 90);
          const cx1 = a.from.x;
          const cy1 = a.from.y + (dy >= 0 ? bend : -bend);
          const cx2 = a.to.x;
          const cy2 = a.to.y - (dy >= 0 ? bend : -bend);

          const d = `M ${a.from.x} ${a.from.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${a.to.x} ${a.to.y}`;

          return <path key={a.key} d={d} className={a.animated ? "votePath votePath--animated" : "votePath"} markerEnd="url(#arrowHead)" />;
        })}
      </svg>
    );
  };

  const PlayerNode: React.FC<{
    userId: string;
    firstName: string;
    photoUrl: string | null;
    gender: "male" | "female";
  }> = ({ userId, firstName, photoUrl, gender }) => {
    const hasVoted = votedBy.has(userId);
    const votedFor = votedBy.get(userId);
    const skipped = hasVoted && votedFor === null;
    const isMe = userId === user.id;

    return (
      <div
        ref={(el) => {
          nodeRefByUserId.current[userId] = el;
        }}
        style={{
          ...styles.playerNode,
          opacity: hasVoted ? 1 : 0.55,
          borderColor: isMe ? "#4A90D9" : hasVoted ? "#2ECC71" : "#e6e6e6",
          background: isMe ? "rgba(74,144,217,0.08)" : "#fff",
        }}
      >
        <Avatar photoUrl={photoUrl} firstName={firstName} size={32} />
        <div style={styles.playerName}>{firstName}</div>
        {isMe && <div style={styles.meBadge}>ты</div>}
        {hasVoted && (
          <div style={{ ...styles.voteBadge, color: skipped ? "#999" : "#2ECC71" }}>{skipped ? "пропуск" : isMe ? "твой выбор" : "выбрал"}</div>
        )}
        <div
          style={{
            ...styles.rolePill,
            background: gender === "male" ? "rgba(74,144,217,0.10)" : "rgba(255,107,107,0.10)",
            color: gender === "male" ? "#4A90D9" : "#FF6B6B",
          }}
        >
          {gender === "male" ? "парень" : "девушка"}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <style>{css}</style>

      <div style={styles.roundBadge}>Выбор: один человек или "никого"</div>
      <Timer />

      <div ref={boardRef} style={styles.voteBoard}>
        <ArrowSvg />

        <div style={styles.voteBoardInner}>
          <div style={styles.boardRowTitleWrap}>
            <div style={styles.boardRowTitle}>Парни</div>
            <div style={styles.boardRowProgress}>
              {maleVoted}/{sessionState.males.length}
            </div>
          </div>

          <div style={styles.boardRow}>
            {sessionState.males.map((p) => (
              <PlayerNode key={p.userId} userId={p.userId} firstName={p.firstName} photoUrl={p.photoUrl} gender="male" />
            ))}
          </div>

          <div style={styles.boardDivider} />

          <div style={styles.boardRowTitleWrap}>
            <div style={styles.boardRowTitle}>Девушки</div>
            <div style={styles.boardRowProgress}>
              {femaleVoted}/{sessionState.females.length}
            </div>
          </div>

          <div style={styles.boardRow}>
            {sessionState.females.map((p) => (
              <PlayerNode key={p.userId} userId={p.userId} firstName={p.firstName} photoUrl={p.photoUrl} gender="female" />
            ))}
          </div>

          <div style={styles.totalProgress}>
            Прогресс: {totalVoted}/{totalVoters}
          </div>
        </div>
      </div>

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
                    borderColor: selectedId === player.userId ? "#FF6B6B" : "#e0e0e0",
                    backgroundColor: selectedId === player.userId ? "rgba(255,107,107,0.05)" : "#fff",
                  }}
                >
                  <div style={styles.answerHeader}>
                    <Avatar photoUrl={player.photoUrl} firstName={player.firstName} size={32} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{player.firstName}</span>
                    {selectedId === player.userId && <span style={styles.selectedBadge}>♥</span>}
                  </div>

                  {qa.map(({ q, a }) => (
                    <div key={q.id} style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>{q.text}</div>
                      <div style={{ fontSize: 14, color: "#333", lineHeight: 1.35 }}>{a ?? "—"}</div>
                    </div>
                  ))}
                </div>
              );
            })}

            <div
              onClick={() => setSelectedId("__none__")}
              style={{
                ...styles.answerCard,
                borderColor: selectedId === "__none__" ? "#FF6B6B" : "#e0e0e0",
                backgroundColor: selectedId === "__none__" ? "rgba(255,107,107,0.05)" : "#fff",
              }}
            >
              <div style={styles.answerHeader}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Никого</span>
                {selectedId === "__none__" && <span style={styles.selectedBadge}>♥</span>}
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

const css = `
.votePath {
  fill: none;
  stroke: #FF6B6B;
  stroke-width: 3;
  stroke-linecap: round;
  opacity: 0.92;
}
.votePath--animated {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: vote-draw 720ms cubic-bezier(0.2, 0.9, 0.2, 1) forwards;
}
@keyframes vote-draw {
  to { stroke-dashoffset: 0; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 24,
    gap: 16,
    minHeight: "100vh",
  },
  roundBadge: {
    padding: "6px 16px",
    borderRadius: 20,
    backgroundColor: "#fff0f0",
    fontSize: 14,
    fontWeight: 600,
    color: "#FF6B6B",
    marginTop: 16,
    textAlign: "center",
  },
  voteBoard: {
    width: "100%",
    maxWidth: 420,
    position: "relative",
    borderRadius: 18,
    border: "1px solid #f0f0f0",
    background: "linear-gradient(180deg, rgba(74,144,217,0.04) 0%, rgba(255,107,107,0.04) 100%)",
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  voteBoardInner: {
    position: "relative",
    padding: 14,
    zIndex: 1,
  },
  arrowSvg: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  },
  boardRowTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  boardRowTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  boardRowProgress: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 800,
    color: "#777",
    background: "rgba(0,0,0,0.04)",
    padding: "3px 10px",
    borderRadius: 999,
  },
  boardRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  boardDivider: {
    height: 1,
    background: "rgba(0,0,0,0.06)",
    margin: "14px 0",
  },
  totalProgress: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: 700,
    color: "#666",
    textAlign: "center",
  },
  playerNode: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    border: "2px solid #e6e6e6",
    background: "#fff",
    minWidth: 120,
    flex: "1 1 120px",
  },
  playerName: {
    fontSize: 13,
    fontWeight: 800,
    color: "#222",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 120,
  },
  meBadge: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: 900,
    color: "#4A90D9",
    background: "rgba(74,144,217,0.12)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  voteBadge: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: 900,
  },
  rolePill: {
    position: "absolute",
    right: 10,
    bottom: 8,
    fontSize: 10,
    fontWeight: 900,
    padding: "2px 8px",
    borderRadius: 999,
  },
  instruction: {
    fontSize: 15,
    fontWeight: 600,
    color: "#444",
    textAlign: "center",
  },
  answersList: {
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  answerCard: {
    padding: 14,
    borderRadius: 14,
    border: "2px solid #e0e0e0",
    cursor: "pointer",
    transition: "all 0.2s",
    backgroundColor: "#fff",
  },
  answerHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  selectedBadge: {
    marginLeft: "auto",
    color: "#FF6B6B",
    fontSize: 18,
  },
  answerText: {
    margin: 0,
    fontSize: 15,
    color: "#333",
    lineHeight: 1.4,
  },
  button: {
    padding: "14px 40px",
    borderRadius: 14,
    border: "none",
    backgroundColor: "#FF6B6B",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
    maxWidth: 360,
  },
  waitingMessage: {
    padding: "16px 24px",
    borderRadius: 14,
    background: "#f5f5f5",
    fontSize: 14,
    fontWeight: 600,
    color: "#555",
    textAlign: "center",
    maxWidth: 360,
  },
};
