import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { Avatar } from "../components/Avatar";
import { Timer } from "../components/Timer";
import type { FinalVoteItem } from "../types";

type Point = { x: number; y: number };
type VoteArrow = { key: string; from: Point; to: Point; d: string };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const RevealScreen: React.FC = () => {
  const sessionState = useGameStore((s) => s.sessionState);
  const user = useGameStore((s) => s.user);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const nodeRefByUserId = useRef<Record<string, HTMLDivElement | null>>({});
  const [layoutTick, setLayoutTick] = useState(0);
  const [arrows, setArrows] = useState<VoteArrow[]>([]);
  const initialAnimateRef = useRef(true);

  if (!sessionState || !user) return null;

  const finalVotes: FinalVoteItem[] = sessionState.finalVotes || [];
  const voteSig = useMemo(() => [...finalVotes].map((v) => `${v.voterId}:${v.votedForId ?? ""}`).sort().join("|"), [finalVotes]);

  const votedBy = useMemo(() => new Map(finalVotes.map((v) => [v.voterId, v.votedForId])), [finalVotes]);

  React.useEffect(() => {
    const onResize = () => setLayoutTick((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const boardEl = boardRef.current;
    if (!boardEl) return;

    const boardRect = boardEl.getBoundingClientRect();
    const next: VoteArrow[] = [];

    for (const v of finalVotes) {
      if (!v.votedForId) continue;
      const fromEl = nodeRefByUserId.current[v.voterId];
      const toEl = nodeRefByUserId.current[v.votedForId];
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const from: Point = { x: fromRect.left - boardRect.left + fromRect.width / 2, y: fromRect.top - boardRect.top + fromRect.height / 2 };
      const to: Point = { x: toRect.left - boardRect.left + toRect.width / 2, y: toRect.top - boardRect.top + toRect.height / 2 };

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const bend = clamp(Math.hypot(dx, dy) * 0.25, 24, 90);
      const cx1 = from.x;
      const cy1 = from.y + (dy >= 0 ? bend : -bend);
      const cx2 = to.x;
      const cy2 = to.y - (dy >= 0 ? bend : -bend);
      const d = `M ${from.x} ${from.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${to.x} ${to.y}`;

      next.push({ key: `${v.voterId}->${v.votedForId}`, from, to, d });
    }

    setArrows(next);
    initialAnimateRef.current = false;
  }, [voteSig, layoutTick]);

  const PlayerNode: React.FC<{ p: any }> = ({ p }) => {
    const has = votedBy.has(p.userId);
    const choice = votedBy.get(p.userId);
    const skipped = has && choice === null;
    const isMe = p.userId === user.id;

    return (
      <div
        ref={(el) => {
          nodeRefByUserId.current[p.userId] = el;
        }}
        style={{
          ...styles.playerNode,
          opacity: has ? 1 : 0.55,
          borderColor: isMe ? "#4A90D9" : has ? "#2ECC71" : "#e6e6e6",
          background: isMe ? "rgba(74,144,217,0.08)" : "#fff",
        }}
      >
        <Avatar photoUrl={p.photoUrl} firstName={p.firstName} size={34} />
        <div style={styles.playerName}>{p.firstName}</div>
        {isMe && <div style={styles.meBadge}>ты</div>}
        {has && <div style={{ ...styles.voteBadge, color: skipped ? "#999" : "#2ECC71" }}>{skipped ? "никого" : "выбрал"}</div>}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <style>{css}</style>

      <div style={styles.title}>Выборы</div>
      <div style={styles.subtitle}>Смотрим, кто кого выбрал</div>
      <Timer />

      <div ref={boardRef} style={styles.voteBoard}>
        <svg style={styles.arrowSvg} width="100%" height="100%" aria-hidden="true">
          {arrows.map((a) => (
            <g key={a.key}>
              <path d={a.d} className="snakePath" />
              {/* Snake head: travels along the path (SMIL). If unsupported, the line animation still works. */}
              <circle r="5" fill="#FF6B6B" opacity="0.95">
                <animateMotion dur="900ms" repeatCount="1" fill="freeze" path={a.d} />
              </circle>
            </g>
          ))}
        </svg>

        <div style={styles.voteBoardInner}>
          <div style={styles.boardRowTitle}>Парни</div>
          <div style={styles.boardRow}>
            {sessionState.males.map((p) => (
              <PlayerNode key={p.userId} p={p} />
            ))}
          </div>

          <div style={styles.boardDivider} />

          <div style={styles.boardRowTitle}>Девушки</div>
          <div style={styles.boardRow}>
            {sessionState.females.map((p) => (
              <PlayerNode key={p.userId} p={p} />
            ))}
          </div>
        </div>
      </div>

      <div style={styles.hint}>После этого покажем результат и совпадения.</div>
    </div>
  );
};

const css = `
.snakePath {
  fill: none;
  stroke: #FF6B6B;
  stroke-width: 3;
  stroke-linecap: round;
  opacity: 0.92;
  stroke-dasharray: 1200;
  stroke-dashoffset: 1200;
  animation: snake-draw 900ms cubic-bezier(0.2, 0.9, 0.2, 1) forwards;
}
@keyframes snake-draw {
  to { stroke-dashoffset: 0; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
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
  boardRowTitle: {
    fontSize: 12,
    fontWeight: 900,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 10,
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
  hint: {
    fontSize: 12,
    fontWeight: 800,
    color: "#999",
    textAlign: "center",
    maxWidth: 360,
  },
};

