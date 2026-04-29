import { useState } from "react";

const Gauge = ({ label, value, color = "#60a5fa" }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, marginBottom: 4, color: "#94a3b8" }}>
      <span>{label.toUpperCase()}</span>
      <span>{Math.round(value * 100)}%</span>
    </div>
    <div style={{ height: 4, background: "#111827", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
    </div>
  </div>
);

export default function MarketDetailView({ market, isMarketLoading, intelligenceReport, isIntelligenceLoading, openTrade, getPrice, onRefresh }) {
  const [detailTab, setDetailTab] = useState("rules");
  const isExpired = market?.end_date && new Date(market.end_date) < new Date(window.SYSTEM_DATE || "2026-04-26");

  if (isMarketLoading) return (
    <div className="empty-state pulse" style={{ color: "#60a5fa" }}>Fetching market data from Polymarket...</div>
  );

  if (!market) return (
    <div className="empty-state">Select a market to view details.</div>
  );

  const yesPrice = getPrice ? getPrice(market, 0) : 0.5;
  const noPrice = getPrice ? getPrice(market, 1) : 0.5;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px", borderBottom: "1px solid #1f2937", background: "#0d1117" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {market.image && (
            <img src={market.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              {market.start_date && new Date(market.start_date).toISOString().split('T')[0] === new Date(window.SYSTEM_DATE || "2026-04-26").toISOString().split('T')[0] && (
                <span className="badge" style={{ background: "#1e3a5f", color: "#93c5fd" }}>NEW</span>
              )}
              {isExpired && <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>EXPIRED</span>}
              {market.category && <span className="badge" style={{ background: "#1c1c2e", color: "#8b8bbd" }}>{market.category.toUpperCase()}</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", lineHeight: 1.4 }}>
              {market.question}
            </div>
          </div>

          {/* Quick Trade Actions */}
          {!isExpired && (
            <div style={{ display: "flex", gap: 8, marginLeft: 20 }}>
              <button 
                className="btn-ghost"
                style={{ background: "#064e3b", color: "#6ee7b7", padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, border: "1px solid #065f46" }}
                onClick={() => openTrade(market, "buy", 0)}
              >
                BUY YES {(yesPrice * 100).toFixed(1)}¢
              </button>
              <button 
                className="btn-ghost"
                style={{ background: "#450a0a", color: "#fca5a5", padding: "6px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, border: "1px solid #7f1d1d" }}
                onClick={() => openTrade(market, "buy", 1)}
              >
                BUY NO {(noPrice * 100).toFixed(1)}¢
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", background: "#060809", padding: "0 8px", borderBottom: "1px solid #1f2937" }}>
        <button 
          className={"tab" + (detailTab === "rules" ? " active" : "")} 
          style={{ fontSize: 10, padding: "10px 12px" }}
          onClick={() => setDetailTab("rules")}
        >
          RULES
        </button>
        <button 
          className={"tab" + (detailTab === "context" ? " active" : "")} 
          style={{ fontSize: 10, padding: "10px 12px" }}
          onClick={() => setDetailTab("context")}
        >
          MARKET CONTEXT
        </button>
        <button 
          className={"tab" + (detailTab === "brain" ? " active" : "")} 
          style={{ fontSize: 10, padding: "10px 12px", color: "#60a5fa" }}
          onClick={() => setDetailTab("brain")}
        >
          EDGE BRAIN ◈
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", fontSize: 13, lineHeight: 1.6, color: "#94a3b8" }}>
        {detailTab === "rules" && (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {market.rules || "No specific rules provided for this market."}
          </div>
        )}
        {detailTab === "context" && (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {market.description || "No additional context available for this market."}
          </div>
        )}
        {detailTab === "brain" && (
          <EdgeBrainPanel report={intelligenceReport} loading={isIntelligenceLoading} market={market} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  );
}

function EdgeBrainPanel({ report, loading, market, onRefresh }) {
  if (loading) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div className="pulse" style={{ fontSize: 11, color: "#60a5fa", letterSpacing: "0.1em" }}>
        RUNNING QUANTITATIVE ANALYSIS...
      </div>
      <div style={{ fontSize: 10, color: "#4b5563", marginTop: 8 }}>Groq Llama 3.1 ◈ 8B Instant</div>
    </div>
  );

  if (!report) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <div style={{ color: "#4b5563", fontSize: 11, marginBottom: 20, letterSpacing: "0.05em" }}>
        ON-DEMAND QUANTITATIVE MODEL ANALYSIS
      </div>
      <button 
        className="btn-primary"
        style={{ 
          background: "rgba(96, 165, 250, 0.1)", 
          color: "#60a5fa", 
          border: "1px solid #60a5fa",
          padding: "10px 20px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em"
        }}
        onClick={onRefresh}
      >
        START ANALYTIC BRAIN ◈
      </button>
      <div style={{ color: "#374151", fontSize: 9, marginTop: 16 }}>
        Uses Groq Llama 3.3 70B for deep news-aware fair value estimation.
      </div>
    </div>
  );

  const marketPrice = parseFloat(market.outcome_prices[0] || 0.5);
  const edge = report.fair_value - marketPrice;
  const edgeColor = edge > 0 ? "#10b981" : edge < 0 ? "#ef4444" : "#94a3b8";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 0.3s ease-out" }}>
      {/* Fair Value Header */}
      <div style={{ background: "#0d1117", border: "1px solid #1f2937", padding: "16px 20px", borderRadius: 4, position: "relative" }}>
        <button 
          onClick={onRefresh}
          className="btn-ghost"
          style={{ 
            position: "absolute", 
            top: 12, 
            right: 12, 
            fontSize: 10, 
            color: "#60a5fa", 
            border: "1px solid rgba(96, 165, 250, 0.3)", 
            padding: "6px 12px", 
            borderRadius: 4, 
            background: "rgba(96, 165, 250, 0.05)",
            fontWeight: 700
          }}
        >
          RE-ANALYZE ◈
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, textAlign: "center", marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 4 }}>MARKET PRICE</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc" }}>{Math.round(marketPrice * 100)}%</div>
          </div>
          <div style={{ borderLeft: "1px solid #1f2937", borderRight: "1px solid #1f2937" }}>
            <div style={{ fontSize: 9, color: "#60a5fa", marginBottom: 4 }}>FAIR VALUE (AI)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{Math.round(report.fair_value * 100)}%</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: edgeColor, marginBottom: 4 }}>MODEL EDGE</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: edgeColor }}>{edge > 0 ? "+" : ""}{Math.round(edge * 100)}%</div>
          </div>
        </div>
      </div>

      {/* Signals Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <div>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc", marginBottom: 16, letterSpacing: "0.05em" }}>SIGNAL WEIGHTS</h4>
          <Gauge label="Momentum" value={report.signals.momentum} />
          <Gauge label="News Sentiment" value={report.signals.news_sentiment} />
          <Gauge label="Logical Consistency" value={report.signals.logical_consistency} color="#10b981" />
        </div>
        <div>
          <h4 style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc", marginBottom: 16, letterSpacing: "0.05em" }}>CALIBRATION</h4>
          <Gauge label="Model Confidence" value={report.confidence} color="#f59e0b" />
          <div style={{ marginTop: 24, fontSize: 11, color: "#cbd5e1", fontStyle: "italic", lineHeight: 1.5 }}>
            "{report.rationale}"
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
