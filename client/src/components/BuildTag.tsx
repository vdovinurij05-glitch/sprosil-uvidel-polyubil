import React, { useEffect, useState } from "react";

export const BuildTag: React.FC = () => {
  const [sha, setSha] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/version")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setSha(j?.sha ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setSha(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return <div style={styles.tag}>{sha ? `v ${sha}` : "v ..."}</div>;
};

const styles: Record<string, React.CSSProperties> = {
  tag: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: 800,
    color: "#aaa",
    userSelect: "none",
  },
};

