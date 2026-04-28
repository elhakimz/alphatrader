import { useState } from "react";

export default function MarketDetailView({ market }) {
  const [detailTab, setDetailTab] = useState("rules");
  const isExpired = market?.end_date && new Date(market.end_date) < new Date(window.SYSTEM_DATE || "2026-04-26");

  console.log("[Detail Trace] Selected Market:", market?.id, "Rules length:", market?.rules?.length, "Context length:", market?.description?.length);

  if (!market) return (
    <div className="empty-state">Select a market to view details.</div>
  );

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
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", fontSize: 13, lineHeight: 1.6, color: "#94a3b8" }}>
        {detailTab === "rules" ? (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {market.rules || "No specific rules provided for this market."}
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {market.description || "No additional context available for this market."}
          </div>
        )}
      </div>
    </div>
  );
}
