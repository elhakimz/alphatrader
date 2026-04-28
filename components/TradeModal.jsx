import { fmt$ } from "../utils";

export default function TradeModal({ 
  tradeModal, 
  setTradeModal, 
  tradeSide, 
  selectedOutcome, 
  setSelectedOutcome, 
  tradeShares, 
  setTradeShares, 
  tradePrice, 
  setTradePrice, 
  getPrice, 
  submitTrade, 
  portfolio 
}) {
  if (!tradeModal) return null;

  return (
    <div className="modal-bg" onClick={e => e.target.className === "modal-bg" && setTradeModal(null)}>
      <div className="modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>
            {tradeSide === "buy" ? "BUY" : "SELL"} · {(tradeModal.outcomes || ["YES", "NO"])[selectedOutcome] || "?"}
          </span>
          <button className="btn-ghost" style={{ padding: "2px 8px" }} onClick={() => setTradeModal(null)}>✕</button>
        </div>

        <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
          {tradeModal.question}
        </div>

        {/* Outcome selector (only for buy) */}
        {tradeSide === "buy" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(tradeModal.outcomes || ["YES", "NO"]).map((out, idx) => (
              <button key={idx} onClick={() => setSelectedOutcome(idx)} style={{ flex: 1, padding: "8px 0", background: selectedOutcome === idx ? (idx === 0 ? "#064e3b" : "#450a0a") : "#0d1117", border: `1px solid ${selectedOutcome === idx ? (idx === 0 ? "#10b981" : "#ef4444") : "#374151"}`, borderRadius: 8, color: selectedOutcome === idx ? (idx === 0 ? "#6ee7b7" : "#fca5a5") : "#6b7280", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13 }}>
                {out} · {(getPrice(tradeModal, idx) * 100).toFixed(1)}¢
              </button>
            ))}
          </div>
        )}

        {/* Shares + price */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6 }}>SHARES</label>
            <input className="inp" type="number" value={tradeShares} onChange={e => setTradeShares(e.target.value)} min="1" step="1" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 6 }}>PRICE ($)</label>
            <input className="inp" type="number" value={tradePrice} onChange={e => setTradePrice(parseFloat(e.target.value))} min="0.01" max="0.99" step="0.01" />
          </div>
        </div>
        <input type="range" min="1" max="500" step="1" value={parseFloat(tradeShares) || 1} onChange={e => setTradeShares(e.target.value)} style={{ marginBottom: 16 }} />

        {/* Summary */}
        {(() => {
          const shares = parseFloat(tradeShares) || 0;
          const price  = tradePrice || getPrice(tradeModal, selectedOutcome);
          const cost   = shares * price;
          const winVal = shares * 1; // each share pays $1 if correct
          return (
            <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 8, padding: 12, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
              <div><span style={{ color: "#4b5563" }}>Execution Price</span><div style={{ color: "#f1f5f9", fontWeight: 600 }}>{(price * 100).toFixed(1)}¢</div></div>
              <div><span style={{ color: "#4b5563" }}>{tradeSide === "buy" ? "Total cost" : "Proceeds"}</span><div style={{ color: "#f1f5f9", fontWeight: 600 }}>{fmt$(cost)}</div></div>
              {tradeSide === "buy" && <div><span style={{ color: "#4b5563" }}>Max payout</span><div style={{ color: "#10b981", fontWeight: 600 }}>{fmt$(winVal)}</div></div>}
              {tradeSide === "buy" && <div><span style={{ color: "#4b5563" }}>Implied prob</span><div style={{ color: "#f1f5f9", fontWeight: 600 }}>{(price * 100).toFixed(1)}%</div></div>}
              <div style={{ gridColumn: "1/-1" }}><span style={{ color: "#4b5563" }}>Cash after trade</span><div style={{ color: tradeSide === "buy" ? (portfolio.cash - cost < 0 ? "#ef4444" : "#f1f5f9") : "#10b981", fontWeight: 600 }}>{fmt$(tradeSide === "buy" ? portfolio.cash - cost : portfolio.cash + cost)}</div></div>
            </div>
          );
        })()}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setTradeModal(null)}>Cancel</button>
          <button className="btn-primary" style={{ flex: 2, padding: 10, fontSize: 13, background: tradeSide === "buy" ? "#1a56db" : "#7f1d1d" }} onClick={submitTrade}>
            {tradeSide === "buy" ? "BUY" : "SELL"} {parseFloat(tradeShares) || 0} shares · {fmt$((parseFloat(tradeShares) || 0) * (tradePrice || getPrice(tradeModal, selectedOutcome)))}
          </button>
        </div>
      </div>
    </div>
  );
}
