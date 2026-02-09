import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getSocket } from "../utils/socket";
import { Avatar } from "../components/Avatar";
import type { FinalVoteItem, MatchResult } from "../types";

interface ResultsScreenProps {
  initData: string;
}

type Point = { x: number; y: number };

type VoteArrow = {
  key: string;
  from: Point;
  to: Point;
  animated: boolean;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ initData }) => {
  const user = useGameStore((s) => s.user);
  const sessionState = useGameStore((s) => s.sessionState);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const { reset } = useGameStore();

  const boardRef = useRef<HTMLDivElement | null>(null);
  const nodeRefByUserId = useRef<Record<string, HTMLDivElement | null>>({});
  const [layoutTick, setLayoutTick] = useState(0);
  const [arrows, setArrows] = useState<VoteArrow[]>([]);
  const initialAnimateRef = useRef(true);

  const finalVotes: FinalVoteItem[] = sessionState?.finalVotes || [];
  const votedBy = useMemo(() => new Map(finalVotes.map((v) => [v.voterId, v.votedForId])), [finalVotes]);

  useEffect(() => {
    if (!sessionState) return;

    const socket = getSocket(initData);
    socket.emit("matches:get", { sessionId: sessionState.id }, (res: any) => {
      setLoading(false);
      if (res.ok) setMatches(res.matches);
    });
  }, [sessionState, initData]);

  useEffect(() => {
    const onResize = () => setLayoutTick((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    if (!sessionState) return;
    const boardEl = boardRef.current;
    if (!boardEl) return;

    const isInitial = initialAnimateRef.current;
    const boardRect = boardEl.getBoundingClientRect();

    const next: VoteArrow[] = [];

    for (const v of finalVotes) {
      if (!v.votedForId) continue;
      const fromEl = nodeRefByUserId.current[v.voterId];
      const toEl = nodeRefByUserId.current[v.votedForId];
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      next.push({
        key: `${v.voterId}->${v.votedForId}`,
        from: { x: fromRect.left - boardRect.left + fromRect.width / 2, y: fromRect.top - boardRect.top + fromRect.height / 2 },
        to: { x: toRect.left - boardRect.left + toRect.width / 2, y: toRect.top - boardRect.top + toRect.height / 2 },
        animated: isInitial,
      });
    }

    setArrows(next);
    initialAnimateRef.current = false;
  }, [finalVotes, sessionState, layoutTick]);

  if (!sessionState) return null;

  if (loading) {
    return (
      <div style={styles.container}>
        <style>{css}</style>
        <p style={{ margin: 0, fontWeight: 800 }}>Подсчитываем совпадения...</p>
      </div>
    );
  }

  const myMatches = matches.filter((m) => m.userA.id === user?.id || m.userB.id === user?.id);
  const otherMatches = matches.filter((m) => m.userA.id !== user?.id && m.userB.id !== user?.id);

  const getContactLink = (telegramId: number, username: string | null) => {
    if (username) return `https://t.me/${username}`;
    return `tg://user?id=${telegramId}`;
  };

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

  const PlayerNode: React.FC<{ p: any }> = ({ p }) => {
    const has = votedBy.has(p.userId);
    const choice = votedBy.get(p.userId);
    const skipped = has && choice === null;
    const isMe = p.userId === user?.id;

    return (
      <div
        ref={(el) => {
          nodeRefByUserId.current[p.userId] = el;
        }}
        style={{
          ...styles.playerNode,
          opacity: has ? 1 : 0.6,
          borderColor: isMe ? "#4A90D9" : has ? "#2ECC71" : "#e6e6e6",
          background: isMe ? "rgba(74,144,217,0.08)" : "#fff",
        }}
      >
        <Avatar photoUrl={p.photoUrl} firstName={p.firstName} size={32} />
        <div style={styles.playerName}>{p.firstName}</div>
        {isMe && <div style={styles.meBadge}>ты</div>}
        {has && <div style={{ ...styles.voteBadge, color: skipped ? "#999" : "#2ECC71" }}>{skipped ? "не выбрал" : "выбрал"}</div>}
        {!has && <div style={{ ...styles.voteBadge, color: "#999" }}>нет выбора</div>}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <style>{css}</style>

      <div style={styles.title}>Результаты</div>

      <div style={styles.subtitle}>Кто кого выбрал</div>
      <div ref={boardRef} style={styles.voteBoard}>
        <ArrowSvg />

        <div style={styles.voteBoardInner}>
          <div style={styles.boardRowTitleWrap}>
            <div style={styles.boardRowTitle}>Парни</div>
            <div style={styles.boardRowProgress}>
              {sessionState.males.filter((p) => votedBy.has(p.userId)).length}/{sessionState.males.length}
            </div>
          </div>
          <div style={styles.boardRow}>
            {sessionState.males.map((p) => (
              <PlayerNode key={p.userId} p={p} />
            ))}
          </div>

          <div style={styles.boardDivider} />

          <div style={styles.boardRowTitleWrap}>
            <div style={styles.boardRowTitle}>Девушки</div>
            <div style={styles.boardRowProgress}>
              {sessionState.females.filter((p) => votedBy.has(p.userId)).length}/{sessionState.females.length}
            </div>
          </div>
          <div style={styles.boardRow}>
            {sessionState.females.map((p) => (
              <PlayerNode key={p.userId} p={p} />
            ))}
          </div>
        </div>
      </div>

      {myMatches.length > 0 ? (
        <>
          <div style={styles.matchBanner}>
            <div style={styles.matchEmoji}>💞</div>
            <div style={styles.matchTitle}>У тебя совпадение!</div>
          </div>

          {myMatches.map((match) => {
            const partner = match.userA.id === user?.id ? match.userB : match.userA;
            return (
              <div key={match.id} style={styles.matchCard}>
                <div style={styles.matchPair}>
                  <Avatar photoUrl={user?.photoUrl || null} firstName={user?.firstName || ""} size={56} />
                  <div style={styles.matchArrow}>♥</div>
                  <Avatar photoUrl={partner.photoUrl} firstName={partner.firstName} size={56} />
                </div>
                <p style={styles.partnerName}>{partner.firstName}</p>
                <a href={getContactLink(partner.telegramId, partner.username)} target="_blank" rel="noopener noreferrer" style={styles.contactButton}>
                  Написать в Telegram
                </a>
              </div>
            );
          })}
        </>
      ) : (
        <div style={styles.noMatch}>
          <div style={{ fontSize: 44 }}>😕</div>
          <p style={styles.noMatchText}>В этот раз совпадений не случилось. Попробуй ещё раз.</p>
        </div>
      )}

      {otherMatches.length > 0 && (
        <div style={styles.otherMatches}>
          <p style={styles.otherTitle}>Другие пары:</p>
          {otherMatches.map((m) => (
            <div key={m.id} style={styles.otherMatchRow}>
              <Avatar photoUrl={m.userA.photoUrl} firstName={m.userA.firstName} size={28} />
              <span style={{ fontSize: 12, fontWeight: 800 }}>{m.userA.firstName}</span>
              <span style={{ color: "#FF6B6B", fontWeight: 900 }}>♥</span>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{m.userB.firstName}</span>
              <Avatar photoUrl={m.userB.photoUrl} firstName={m.userB.firstName} size={28} />
            </div>
          ))}
        </div>
      )}

      <button onClick={reset} style={styles.playAgain}>
        Играть снова
      </button>
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
  animation: vote-draw 720ms cubic-bezier(0.2, 0.9, 0.2, 1) forwards, vote-glow 720ms ease-out forwards;
}
@keyframes vote-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes vote-glow {
  0% { opacity: 0.0; }
  30% { opacity: 1.0; }
  100% { opacity: 0.92; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 20,
    gap: 18,
    minHeight: "100vh",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: 900,
    margin: 0,
    color: "#222",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
    zIndex: 4,
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
    fontWeight: 900,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  boardRowProgress: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 900,
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
    fontWeight: 900,
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
  matchBanner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  matchEmoji: {
    fontSize: 48,
    animation: "pulse 1.5s infinite",
  },
  matchTitle: {
    fontSize: 22,
    fontWeight: 900,
    color: "#FF6B6B",
    margin: 0,
  },
  matchCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    padding: 24,
    borderRadius: 20,
    backgroundColor: "#fff",
    boxShadow: "0 4px 20px rgba(255,107,107,0.2)",
    width: "100%",
    maxWidth: 320,
  },
  matchPair: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  matchArrow: {
    color: "#FF6B6B",
    fontSize: 28,
    fontWeight: 900,
    animation: "pulse 1s infinite",
  },
  partnerName: {
    fontSize: 18,
    fontWeight: 900,
    margin: 0,
  },
  contactButton: {
    padding: "12px 32px",
    borderRadius: 14,
    backgroundColor: "#4A90D9",
    color: "#fff",
    fontSize: 15,
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-block",
  },
  noMatch: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  noMatchText: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 1.5,
    fontWeight: 800,
    margin: 0,
  },
  otherMatches: {
    width: "100%",
    maxWidth: 320,
    marginTop: 10,
  },
  otherTitle: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
    fontWeight: 900,
  },
  otherMatchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 10,
    backgroundColor: "#f8f8f8",
    marginBottom: 6,
    justifyContent: "center",
  },
  playAgain: {
    padding: "14px 40px",
    borderRadius: 14,
    border: "none",
    backgroundColor: "#FF6B6B",
    color: "#fff",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 6,
  },
};

