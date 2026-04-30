import { memo } from "react";

const PmbotConsensus = memo(({ state, onMarketClick }) => {
  const consensusLog = state.consensus_log || [];
  const totalVotes = state.total_consensus_votes || 0;
  const enterRate = consensusLog.length > 0 
    ? (consensusLog.filter(c => c.consensus === "ENTER").length / consensusLog.length * 100).toFixed(0)
    : 0;

  return (
    <div style={{ padding: 20, height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, background: "var(--bg-main)" }}>
      
      {/* Consensus Stats */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)" }}>
        GROQ {" // "} 2-of-3 CONSENSUS {" // "} {totalVotes} votes {" // "} <span style={{ color: "var(--success)" }}>{enterRate}% enter rate</span>
      </div>

      {/* Consensus Cards */}
      {consensusLog.map((card, i) => (
        <div key={i} style={{ border: "1px solid var(--border-color)", background: "var(--bg-card)", overflow: "hidden", borderRadius: 8 }}>
          <div style={{ padding: "10px 16px", background: card.consensus === "ENTER" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: card.consensus === "ENTER" ? "var(--success)" : "var(--danger)" }}>
              CONSENSUS: {card.market} [{card.score}] → {card.consensus}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(card.created_at).toLocaleTimeString()}</div>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {card.agents.map((agent, j) => (
              <div key={j} style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, width: 60, flexShrink: 0 }}>AGENT {agent.agent_id}</span>
                <span style={{ fontSize: 9, color: agent.vote.includes("ENTER") ? "var(--success)" : "var(--text-dim)", fontWeight: 700, width: 80, flexShrink: 0 }}>[{agent.vote}]</span>
                <span style={{ fontSize: 10, color: "var(--text-main)", lineHeight: 1.4 }}>"{agent.reason}"</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {consensusLog.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)", fontSize: 11, border: "1px dashed var(--border-color)", borderRadius: 8 }}>
          NO CONSENSUS DATA RECORDED
        </div>
      )}

      {/* Vote History Bar */}
      <div style={{ marginTop: "auto", padding: 20, borderTop: "1px solid var(--border-color)" }}>
         <div style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, marginBottom: 12 }}>VOTE HISTORY [●●● = 3/3] [●●○ = 2/3] [●○○ = 1/3] [○○○ = 0/3]</div>
         <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {consensusLog.slice(0, 50).reverse().map((c, i) => {
               const v = parseInt(c.score.split('/')[0]);
               return (
                  <div key={i} title={c.market} style={{ fontSize: 14, color: v >= 2 ? "var(--success)" : v === 1 ? "#ffab00" : "var(--text-dark)", cursor: "help" }}>
                     {v === 3 ? "●●●" : v === 2 ? "●●○" : v === 1 ? "●○○" : "○○○"}
                  </div>
               );
            })}
         </div>
      </div>

    </div>
  );
});

export default PmbotConsensus;
