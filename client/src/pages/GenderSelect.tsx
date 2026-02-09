import React from "react";
import { useGameStore } from "../store/useGameStore";
import { apiFetch } from "../utils/api";
import { BuildTag } from "../components/BuildTag";

export const GenderSelect: React.FC = () => {
  const { setUser, setScreen } = useGameStore();

  const selectGender = async (gender: "male" | "female") => {
    try {
      await apiFetch("/api/user/gender", {
        method: "POST",
        body: JSON.stringify({ gender }),
      });

      const user = await apiFetch<any>("/api/user/me");
      setUser(user);
      setScreen("start");
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Кто ты?</h1>
        <p style={styles.subtitle}>Выбери свой пол для подбора пары</p>
      </div>

      <div style={styles.buttons}>
        <button onClick={() => selectGender("male")} style={{ ...styles.button, ...styles.maleButton }}>
          <span style={styles.emoji}>👨</span>
          <span>Мужчина</span>
        </button>

        <button onClick={() => selectGender("female")} style={{ ...styles.button, ...styles.femaleButton }}>
          <span style={styles.emoji}>👩</span>
          <span>Женщина</span>
        </button>
      </div>

      <BuildTag />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
    gap: 36,
  },
  header: {
    textAlign: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: 900,
    margin: 0,
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 8,
    fontWeight: 700,
  },
  buttons: {
    display: "flex",
    gap: 16,
    width: "100%",
    maxWidth: 320,
  },
  button: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "24px 16px",
    borderRadius: 16,
    border: "none",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    color: "#fff",
    transition: "transform 0.2s",
  },
  maleButton: {
    backgroundColor: "#4A90D9",
  },
  femaleButton: {
    backgroundColor: "#E91E63",
  },
  emoji: {
    fontSize: 40,
  },
};

