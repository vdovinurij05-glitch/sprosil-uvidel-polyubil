import React, { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { getSocket } from "../utils/socket";
import { Avatar } from "../components/Avatar";
import type { MatchResult } from "../types";

interface ResultsScreenProps {
  initData: string;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ initData }) => {
  const user = useGameStore((s) => s.user);
  const sessionState = useGameStore((s) => s.sessionState);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const { reset } = useGameStore();

  useEffect(() => {
    if (!sessionState) return;

    const socket = getSocket(initData);
    socket.emit("matches:get", { sessionId: sessionState.id }, (res: any) => {
      setLoading(false);
      if (res.ok) setMatches(res.matches);
    });
  }, [sessionState, initData]);

  if (!sessionState || !user) return null;

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ margin: 0, fontWeight: 900 }}>Подсчитываем совпадения...</p>
      </div>
    );
  }

  const myMatches = matches.filter((m) => m.userA.id === user.id || m.userB.id === user.id);
  const otherMatches = matches.filter((m) => m.userA.id !== user.id && m.userB.id !== user.id);

  const getContactLink = (telegramId: number, username: string | null) => {
    if (username) return `https://t.me/${username}`;
    return `tg://user?id=${telegramId}`;
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Результаты</h2>

      {myMatches.length > 0 ? (
        <>
          <div style={styles.matchBanner}>
            <div style={styles.matchEmoji}>💞</div>
            <div style={styles.matchTitle}>У тебя совпадение!</div>
          </div>

          {myMatches.map((match) => {
            const partner = match.userA.id === user.id ? match.userB : match.userA;
            return (
              <div key={match.id} style={styles.matchCard}>
                <div style={styles.matchPair}>
                  <Avatar photoUrl={user.photoUrl} firstName={user.firstName} size={56} />
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 24,
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
  matchBanner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  matchEmoji: {
    fontSize: 48,
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

