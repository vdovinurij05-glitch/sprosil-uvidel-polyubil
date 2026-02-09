import React from "react";
import { useGameStore } from "../store/useGameStore";

export const Timer: React.FC = () => {
  const timer = useGameStore((s) => s.timer);

  if (timer <= 0) return null;

  const isUrgent = timer <= 10;

  return (
    <div
      style={{
        fontSize: 24,
        fontWeight: 900,
        color: isUrgent ? "#FF4444" : "#666",
        textAlign: "center",
        padding: "8px 16px",
        borderRadius: 12,
        backgroundColor: isUrgent ? "rgba(255,68,68,0.1)" : "rgba(0,0,0,0.05)",
      }}
    >
      {timer}с
    </div>
  );
};

