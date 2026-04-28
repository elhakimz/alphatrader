import { fmt$ } from "../utils";

export default function Header({ 
  connDot, 
  connLabel, 
  wsStatus, 
  tradeMode, 
  setTradeMode, 
  portfolioValue, 
  totalPnl, 
  portfolioCash, 
  connState, 
  connect, 
  send,
  CONN_STATES,
  isLogsVisible,
  setIsLogsVisible,
  showChart,
  setShowChart
}) {
  return (
    <div style={{ background: "#060809", borderBottom: "1px solid #1f2937", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0d1117", border: "1px solid #1f2937", borderRadius: 6, padding: "3px 10px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: connDot, display: "inline-block", boxShadow: connState === "OPEN" ? `0 0 6px ${connDot}` : "none" }} />
          <span style={{ color: connDot, fontSize: 11, fontWeight: 600 }}>{connLabel}</span>
          {wsStatus.messages_received > 0 && <span style={{ color: "#4b5563", fontSize: 10 }}>·{wsStatus.messages_received} msgs</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", background: "#0d1117", border: "1px solid #1f2937", borderRadius: 6, overflow: "hidden", cursor: "pointer" }} onClick={() => setTradeMode(m => m === "PAPER" ? "LIVE" : "PAPER")}>
          <div style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: tradeMode === "PAPER" ? "#374151" : "transparent", color: tradeMode === "PAPER" ? "#f8fafc" : "#64748b" }}>PAPER</div>
          <div style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: tradeMode === "LIVE" ? "#ef4444" : "transparent", color: tradeMode === "LIVE" ? "#fee2e2" : "#64748b" }}>LIVE</div>
        </div>
        
        <div style={{ display: "flex", gap: 6 }}>
          <button 
            className="btn-ghost" 
            onClick={() => setShowChart(!showChart)}
            style={{ 
              fontSize: 10, 
              padding: "4px 10px", 
              background: showChart ? "rgba(96, 165, 250, 0.1)" : "transparent", 
              color: showChart ? "#60a5fa" : "#4b5563",
              border: "1px solid " + (showChart ? "rgba(96, 165, 250, 0.3)" : "#1f2937"),
              borderRadius: 6
            }}
          >
            CHART
          </button>

          <button 
            className="btn-ghost" 
            onClick={() => setIsLogsVisible(!isLogsVisible)}
            style={{ 
              fontSize: 10, 
              padding: "4px 10px", 
              background: isLogsVisible ? "rgba(96, 165, 250, 0.1)" : "transparent", 
              color: isLogsVisible ? "#60a5fa" : "#4b5563",
              border: "1px solid " + (isLogsVisible ? "rgba(96, 165, 250, 0.3)" : "#1f2937"),
              borderRadius: 6
            }}
          >
            LOGS
          </button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#4b5563", fontSize: 10, marginBottom: 2 }}>PORTFOLIO</div>
          <div style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 16 }}>{fmt$(portfolioValue)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#4b5563", fontSize: 10, marginBottom: 2 }}>P&L</div>
          <div style={{ color: totalPnl >= 0 ? "#10b981" : "#ef4444", fontWeight: 600, fontSize: 15 }}>
            {totalPnl >= 0 ? "+" : ""}{fmt$(totalPnl)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#4b5563", fontSize: 10, marginBottom: 2 }}>CASH</div>
          <div style={{ color: "#94a3b8", fontSize: 14 }}>{fmt$(portfolioCash)}</div>
        </div>
        {connState !== CONN_STATES.OPEN && (
          <button className="btn-primary" onClick={connect}>Reconnect</button>
        )}
        {tradeMode === "LIVE" && (
          <>
            <button className="btn-primary" style={{ background: "#7c3aed" }} onClick={() => send({ type: "approve_usdc" })}>Approve USDC</button>
            <button className="btn-primary" style={{ background: "#4f46e5" }} onClick={() => send({ type: "get_nonce" })}>Get Nonce</button>
          </>
        )}
        <button className="btn-ghost" onClick={() => send({ type: "reset_portfolio" })}>Reset</button>
      </div>
    </div>
  );
}
