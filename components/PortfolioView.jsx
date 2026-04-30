import { memo, useState, useEffect, useRef, useMemo } from "react";
import { fmt$, fmtPct, fmtTs } from "../utils";

const PortfolioView = memo(({ portfolio, prices, markets, setTradeModal, setTradeSide, setSelectedOutcome, setTradeShares, positionPnl, playNotificationSound }) => {
  const [isHistoryMinimized, setIsHistoryMinimized] = useState(false);
  const lastEligibleCountRef = useRef(0);

  // 1. Calculate eligibility across all positions
  const eligiblePositions = useMemo(() => {
    return Object.entries(portfolio.positions || {}).filter(([tid, pos]) => {
      const currPrice = prices[tid]?.price ?? pos.avg_cost;
      const pnlPct = ((currPrice - pos.avg_cost) / pos.avg_cost * 100);
      
      const market = markets.find(m => (m.tokens || []).some(t => (typeof t === "string" ? t : t.token_id || t.id) === tid));
      const isExpired = market?.end_date && new Date(market.end_date) < new Date(window.SYSTEM_DATE || "2026-04-26");
      
      return !isExpired && pos.shares > 0 && pnlPct > 10;
    });
  }, [portfolio.positions, prices, markets]);

  const hasEligible = eligiblePositions.length > 0;

  // 2. Auditory alert on NEW eligibility
  useEffect(() => {
    if (eligiblePositions.length > lastEligibleCountRef.current) {
      if (playNotificationSound) playNotificationSound();
    }
    lastEligibleCountRef.current = eligiblePositions.length;
  }, [eligiblePositions.length, playNotificationSound]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid #1f2937" }}>
        {[
          { label: "POSITIONS", value: Object.keys(portfolio.positions || {}).length },
          { label: "TRADES", value: (portfolio.history || []).length },
          { label: "UNREALIZED", value: positionPnl >= 0 ? "+" + fmt$(positionPnl) : fmt$(positionPnl), color: positionPnl >= 0 ? "#10b981" : "#ef4444" },
        ].map(s => (
          <div key={s.label} style={{ padding: "10px 14px", borderRight: "1px solid #1f2937" }}>
            <div style={{ color: "#374151", fontSize: 9, letterSpacing: ".06em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ color: s.color || "#f1f5f9", fontWeight: 600, fontSize: 15 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Positions */}
      <div style={{ 
        padding: "10px 14px 4px", 
        borderBottom: "1px solid #0d1117",
        animation: hasEligible ? "bg-pulse-green 2s infinite" : "none",
        transition: "background-color 0.5s ease"
      }}>
        <span style={{ 
          color: hasEligible ? "#10b981" : "#374151", 
          fontSize: 10, 
          letterSpacing: ".06em",
          fontWeight: hasEligible ? 700 : 400
        }}>
          POSITIONS {hasEligible && `[${eligiblePositions.length} READY]`}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {Object.entries(portfolio.positions || {}).length === 0 ? (
          <div style={{ color: "#374151", fontSize: 12, padding: "16px 14px" }}>No open positions</div>
        ) : (
          Object.entries(portfolio.positions || {}).map(([tid, pos]) => {
            const currPrice = prices[tid]?.price ?? pos.avg_cost;
            const pnl = pos.shares * (currPrice - pos.avg_cost);
            const pnlPct = ((currPrice - pos.avg_cost) / pos.avg_cost * 100);
            const question = (pos.question || "Unknown").slice(0, 55);
            
            // Find associated market for expiration check
            const market = markets.find(m => (m.tokens || []).some(t => (typeof t === "string" ? t : t.token_id || t.id) === tid));
            const isExpired = market?.end_date && new Date(market.end_date) < new Date(window.SYSTEM_DATE || "2026-04-26");
            const canSell = !isExpired && pos.shares > 0;

            // Sell button dynamic color coding
            let sellColor = "#4b5563"; // Default Gray
            let sellBorder = "#1f2937";
            
            if (canSell) {
              if (pnlPct > 10) {
                sellColor = "#10b981"; // Green
                sellBorder = "rgba(16, 185, 129, 0.4)";
              } else if (pnlPct >= 0) {
                sellColor = "#64748b"; // Light Gray
                sellBorder = "#334155";
              } else {
                sellColor = "#ef4444"; // Red
                sellBorder = "rgba(239, 68, 68, 0.4)";
              }
            }

            return (
              <div key={tid} style={{ padding: "10px 14px", borderBottom: "1px solid #0d1117", opacity: isExpired ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <span className="badge" style={{ background: pos.outcome === "YES" ? "#064e3b" : "#450a0a", color: pos.outcome === "YES" ? "#6ee7b7" : "#fca5a5", marginRight: 6 }}>{pos.outcome}</span>
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>{question}{(pos.question || "").length > 55 ? "…" : ""}</span>
                  </div>
                  <button 
                    className="btn-ghost" 
                    disabled={!canSell}
                    style={{ 
                      fontSize: 10, 
                      padding: "2px 8px",
                      opacity: canSell ? 1 : 0.3,
                      cursor: canSell ? "pointer" : "not-allowed",
                      border: "1px solid " + sellBorder,
                      color: sellColor,
                      background: canSell ? "transparent" : "rgba(31, 41, 55, 0.2)"
                    }}
                    onClick={() => { 
                      if (!canSell) return;
                      setTradeModal(market || { question: pos.question, tokens: [tid], outcomes: [pos.outcome], outcome_prices: [String(currPrice)] }); 
                      setTradeSide("sell"); 
                      setSelectedOutcome(0); 
                      setTradeShares(String(pos.shares)); 
                    }}>
                    SELL
                  </button>
                </div>
                <div style={{ display: "flex", gap: 20, fontSize: 11 }}>
                  <span style={{ color: "#4b5563" }}>{pos.shares.toFixed(2)} sh</span>
                  <span style={{ color: "#4b5563" }}>avg <span style={{ color: "#94a3b8" }}>{fmtPct(pos.avg_cost)}</span></span>
                  <span style={{ color: "#4b5563" }}>now <span style={{ color: "#94a3b8" }}>{fmtPct(currPrice)}</span></span>
                  <span style={{ color: pnl >= 0 ? "#10b981" : "#ef4444", marginLeft: "auto" }}>{pnl >= 0 ? "+" : ""}{fmt$(pnl)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Trade history */}
      <div style={{ padding: "10px 14px 4px", borderBottom: "1px solid #0d1117", borderTop: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#374151", fontSize: 10, letterSpacing: ".06em" }}>TRADE HISTORY</span>
        <button 
          onClick={() => setIsHistoryMinimized(!isHistoryMinimized)}
          style={{
            background: "transparent",
            border: "none",
            color: "#4b5563",
            fontSize: "12px",
            cursor: "pointer",
            padding: "2px 4px"
          }}
          title={isHistoryMinimized ? "Expand History" : "Minimize History"}
        >
          {isHistoryMinimized ? "[+]" : "[—]"}
        </button>
      </div>
      {!isHistoryMinimized && (
        <div style={{ overflowY: "auto", flex: 1 }}>
          {(portfolio.history || []).length === 0 ? (
            <div style={{ color: "#374151", fontSize: 12, padding: "16px 14px" }}>No trades yet</div>
          ) : (
            [...(portfolio.history || [])].reverse().map((t, i) => (
              <div key={t.id || i} style={{ padding: "10px 14px", borderBottom: "1px solid #0d1117" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className="badge" style={{ background: t.side === "buy" ? "#1e3a5f" : "#451a03", color: t.side === "buy" ? "#93c5fd" : "#fdba74", fontWeight: 800 }}>{t.side.toUpperCase()}</span>
                    <span className="badge" style={{ background: t.outcome === "YES" ? "#064e3b" : "#450a0a", color: t.outcome === "YES" ? "#6ee7b7" : "#fca5a5" }}>{t.outcome}</span>
                  </div>
                  <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 11 }}>{fmt$(t.cost)}</span>
                </div>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, lineHeight: 1.3 }}>
                  {(t.market_question || t.question || "Unknown Market")}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <div style={{ color: "#4b5563" }}>{t.shares.toFixed(2)} shares @ <span style={{ color: "#60a5fa" }}>{(t.price * 100).toFixed(1)}¢</span></div>
                  <div style={{ color: "#374151" }}>{fmtTs(t.ts)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
});

export default PortfolioView;
