import React, { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { getSocket } from "../utils/socket";
import { Avatar } from "../components/Avatar";

interface RosterScreenProps {
  initData: string;
}

export const RosterScreen: React.FC<RosterScreenProps> = ({ initData }) => {
  const sessionState = useGameStore((s) => s.sessionState);

  useEffect(() => {
    if (!sessionState) return;

    // Keep roster as a very short transition; QA screen is the real "start" now.
    const timer = setTimeout(() => {
      const socket = getSocket(initData);
      socket.emit("roster:ready", { sessionId: sessionState.id }, () => {});
    }, 1200);

    return () => clearTimeout(timer);
  }, [sessionState, initData]);

  if (!sessionState) return null;

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
      <div style={styles.rowWrap}>
        <div style={styles.rowTitle}>{label}</div>
        <div style={styles.row}>
          {cells.slice(0, 3).map((p) => {
            const isEmpty = (p as any).telegramId === 0 && p.firstName === "—";
            return (
              <div key={p.userId} style={{ ...styles.cell, opacity: isEmpty ? 0.35 : 1 }}>
                <Avatar photoUrl={p.photoUrl} firstName={p.firstName} size={46} />
                <div style={styles.name}>{p.firstName}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {renderRow(sessionState.males, "Парни")}

      <div style={styles.center}>
        <div style={styles.title}>Состав собран</div>
        <div style={styles.subtitle}>Сейчас начнётся игра...</div>
      </div>

      {renderRow(sessionState.females, "Девушки")}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 18,
    background: "linear-gradient(180deg, rgba(74,144,217,0.05) 0%, rgba(255,107,107,0.05) 100%)",
  },
  rowWrap: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: 900,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
  },
  cell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.06)",
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  },
  name: {
    fontSize: 12,
    fontWeight: 800,
    color: "#333",
    maxWidth: 110,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  center: {
    padding: "14px 18px",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.06)",
    background: "rgba(255,255,255,0.95)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    color: "#222",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#666",
  },
};

