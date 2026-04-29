export default function TradeHistoryView({ history, loading }) {
  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: "#4b5563" }}>
      <div style={{ marginBottom: 12 }}>⟳ Loading trade history…</div>
    </div>
  );

  return (
    <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Permanent Header */}
      <div style={{ display: "grid", gridTemplateColumns: "70px 50px 1fr 40px 50px 50px 30px", gap: 8, padding: "8px 12px", borderBottom: "1px solid #1f2937", background: "#0d1117", color: "#4b5563", fontSize: 10, fontWeight: 600, letterSpacing: ".05em" }}>
        <span>TIME</span>
        <span>SIDE</span>
        <span>MARKET</span>
        <span style={{ textAlign: "center" }}>OUT</span>
        <span style={{ textAlign: "right" }}>SIZE</span>
        <span style={{ textAlign: "right" }}>PRICE</span>
        <span style={{ textAlign: "center" }}>TX</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {!history || history.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#374151", fontSize: 12, letterSpacing: "0.05em" }}>
            NO TRADE DATA AVAILABLE
          </div>
        ) : (
          history.map((t, i) => {
            const isPaper = t.transactionHash?.startsWith("PAPER_");
            
            // Robust date parsing
            let date;
            if (typeof t.timestamp === 'number') {
              // If it's a small number, assume seconds, otherwise milliseconds
              date = new Date(t.timestamp < 10000000000 ? t.timestamp * 1000 : t.timestamp);
            } else {
              date = new Date(t.timestamp);
            }
            
            const timeStr = isNaN(date.getTime()) ? "??:??" : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={t.transactionHash || i} style={{ display: "grid", gridTemplateColumns: "70px 50px 1fr 40px 50px 50px 30px", gap: 8, padding: "10px 12px", borderBottom: "1px solid #0d1117", fontSize: 11, alignItems: "center" }} className="mkt-row">
                <div style={{ color: "#64748b" }}>{timeStr}</div>
                <div style={{ color: t.side === "BUY" ? "#10b981" : "#ef4444", fontWeight: 600 }}>{t.side}</div>
                <div style={{ color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.title}>
                  {t.title}
                </div>
                <div style={{ textAlign: "center" }}>
                  <span className="badge" style={{ background: t.outcomeIndex === 0 ? "#064e3b" : "#450a0a", color: t.outcomeIndex === 0 ? "#6ee7b7" : "#fca5a5" }}>{t.outcomeIndex === 0 ? "Y" : "N"}</span>
                </div>
                <div style={{ textAlign: "right", color: "#94a3b8" }}>{parseFloat(t.size).toFixed(0)}</div>
                <div style={{ textAlign: "right", color: "#f8fafc", fontWeight: 600 }}>{(t.price * 100).toFixed(1)}¢</div>
                <div style={{ textAlign: "center" }}>
                  {!isPaper ? (
                    <a href={`https://polygonscan.com/tx/${t.transactionHash}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none" }} title="View on Polygonscan">↗</a>
                  ) : (
                    <span style={{ color: "#4b5563" }}>-</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
