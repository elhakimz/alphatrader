import { memo } from "react";

const MarketList = memo(({ 
  filteredMarkets, 
  getPrice, 
  portfolio, 
  tradeMode, 
  selectedMarketId, 
  setSelectedMarketId, 
  openTrade,
  CONN_STATES,
  connState,
  sortConfig,
  setSortConfig,
  viewMode
}) => {
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc"
    }));
  };

  const SortIcon = ({ k }) => {
    if (sortConfig.key !== k) return <span style={{ opacity: 0.2, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4, color: "#60a5fa" }}>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const formatDateRange = (start, end) => {
    if (!start && !end) return "—";
    const fmt = (d) => d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }) : "?";
    return `${fmt(start)} - ${fmt(end)}`;
  };

  if (filteredMarkets.length === 0) {
    return (
      <div style={{ color: "#4b5563", textAlign: "center", marginTop: 60, fontSize: 13 }}>
        {connState === CONN_STATES.CONNECTING ? "⟳ Fetching markets…" : "No matching markets"}
      </div>
    );
  }

  if (viewMode === "cards") {
    return (
      <div className="market-grid" style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
        {filteredMarkets.map((m, i) => {
          const yesPrice = getPrice(m, 0);
          const noPrice  = getPrice(m, 1);
          const isSelected = selectedMarketId === m.id;
          const systemDateStr = window.SYSTEM_DATE || "2026-04-26";
          const isExpired = m.end_date && new Date(m.end_date) < new Date(systemDateStr);
          const isNew = m.start_date && new Date(m.start_date).toISOString().split('T')[0] === new Date(systemDateStr).toISOString().split('T')[0];
          const chance = Math.round(yesPrice * 100);

          return (
            <div 
              key={m.id || i}
              className={"market-card" + (isSelected ? " selected" : "")}
              onClick={() => setSelectedMarketId(m.id)}
            >
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                {m.image ? (
                  <img src={m.image} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", background: "#0d1117" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: "#1f2937" }} />
                )}
                <div style={{ flex: 1 }}>
                   <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                      {isNew && <span className="badge" style={{ background: "#1e3a5f", color: "#93c5fd" }}>NEW</span>}
                      {isExpired && <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>EXPIRED</span>}
                      {m.category && <span className="badge" style={{ background: "#1c1c2e", color: "#8b8bbd" }}>{m.category.toUpperCase().slice(0, 10)}</span>}
                   </div>
                   <div style={{ color: isExpired ? "#64748b" : "#e2e8f0", fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                     {m.question}
                   </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                 <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: yesPrice > 0.5 ? "#10b981" : "#ef4444" }}>{chance}%</span>
                    <span style={{ fontSize: 10, color: "#4b5563", fontWeight: 600 }}>CHANCE</span>
                 </div>
                 <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ textAlign: "center" }}>
                       <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 2 }}>YES</div>
                       <div style={{ color: "#10b981", fontWeight: 700 }}>{(yesPrice * 100).toFixed(0)}¢</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                       <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 2 }}>NO</div>
                       <div style={{ color: "#ef4444", fontWeight: 700 }}>{(noPrice * 100).toFixed(0)}¢</div>
                    </div>
                 </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button className="btn-primary" style={{ flex: 1, background: "#064e3b", color: "#6ee7b7" }} onClick={(e) => { e.stopPropagation(); openTrade(m, "buy", 0); }}>YES</button>
                <button className="btn-primary" style={{ flex: 1, background: "#450a0a", color: "#fca5a5" }} onClick={(e) => { e.stopPropagation(); openTrade(m, "buy", 1); }}>NO</button>
              </div>

              <div style={{ fontSize: 10, color: "#4b5563", borderTop: "1px solid #1f2937", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span>VOL: {m.volume > 0 ? "$" + (m.volume >= 1e6 ? (m.volume / 1e6).toFixed(1) + "M" : m.volume >= 1e3 ? (m.volume / 1e3).toFixed(0) + "K" : m.volume.toFixed(0)) : "—"}</span>
                {m.end_date && <span>ENDS: {new Date(m.end_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 10, background: "#060809" }}>
          <tr style={{ background: "#0d1117", color: "#4b5563", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>
            <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 500 }}>Market</th>
            <th 
              style={{ padding: "6px 8px", textAlign: "center", width: 60, cursor: "pointer" }}
              onClick={() => handleSort("yes")}
            >
              Chance <SortIcon k="yes" />
            </th>
            <th 
              style={{ padding: "6px 8px", textAlign: "center", width: 80, cursor: "pointer" }}
              onClick={() => handleSort("yes")}
            >
              YES <SortIcon k="yes" />
            </th>
            <th 
              style={{ padding: "6px 8px", textAlign: "center", width: 80, cursor: "pointer" }}
              onClick={() => handleSort("no")}
            >
              NO <SortIcon k="no" />
            </th>
            <th 
              style={{ padding: "6px 8px", textAlign: "right", width: 100, cursor: "pointer" }}
              onClick={() => handleSort("volume")}
            >
              Vol 24h <SortIcon k="volume" />
            </th>
            <th style={{ padding: "6px 8px", textAlign: "right", width: 140, fontWeight: 500 }}>Start - End Date</th>
            <th style={{ padding: "6px 12px", width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {filteredMarkets.map((m, i) => {
            const yesPrice = getPrice(m, 0);
            const noPrice  = getPrice(m, 1);
            const havePos  = Object.keys(portfolio.positions || {}).some(tid =>
              (m.tokens || []).some(t => (typeof t === "string" ? t : t.token_id || t.id) === tid)
            );
            const isSelected = selectedMarketId === m.id;
            const systemDateStr = window.SYSTEM_DATE || "2026-04-26";
            const isExpired = m.end_date && new Date(m.end_date) < new Date(systemDateStr);
            const isNew = m.start_date && new Date(m.start_date).toISOString().split('T')[0] === new Date(systemDateStr).toISOString().split('T')[0];

            return (
              <tr key={m.id || i} 
                className={"mkt-row" + (isSelected ? " selected" : "")} 
                onClick={() => setSelectedMarketId(isSelected ? null : m.id)}
                style={{ borderBottom: "1px solid #111827", background: i % 2 === 0 ? "transparent" : "#070a0e" }}>
                <td style={{ padding: "9px 12px", maxWidth: 280 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                    {isNew && <span className="badge" style={{ background: "#1e3a5f", color: "#93c5fd" }}>NEW</span>}
                    {isExpired && <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>EXPIRED</span>}
                    {havePos && <span className="badge" style={{ background: "#1e3a5f", color: "#93c5fd" }}>POS</span>}
                    {m.category && <span className="badge" style={{ background: "#1c1c2e", color: "#8b8bbd" }}>{m.category.toUpperCase().slice(0, 8)}</span>}
                  </div>
                  <span style={{ color: isExpired ? "#64748b" : "#cbd5e1", fontSize: 12, lineHeight: 1.4 }}>{(m.question || "").slice(0, 80)}{(m.question || "").length > 80 ? "…" : ""}</span>
                </td>
                <td style={{ padding: "9px 8px", textAlign: "center" }}>
                   <span style={{ fontSize: 13, fontWeight: 700, color: yesPrice > 0.5 ? "#10b981" : "#ef4444" }}>{Math.round(yesPrice * 100)}%</span>
                </td>
                <td style={{ padding: "9px 8px", textAlign: "center" }}>
                  <span className="pill-yes">{(yesPrice * 100).toFixed(0)}¢</span>
                </td>
                <td style={{ padding: "9px 8px", textAlign: "center" }}>
                  <span className="pill-no">{(noPrice * 100).toFixed(0)}¢</span>
                </td>
                <td style={{ padding: "9px 8px", textAlign: "right", color: "#4b5563", fontSize: 11 }}>
                  {m.volume > 0 ? "$" + (m.volume >= 1e6 ? (m.volume / 1e6).toFixed(1) + "M" : m.volume >= 1e3 ? (m.volume / 1e3).toFixed(0) + "K" : m.volume.toFixed(0)) : "—"}
                </td>
                <td style={{ padding: "9px 8px", textAlign: "right", color: "#4b5563", fontSize: 10 }}>
                  {formatDateRange(m.start_date, m.end_date)}
                </td>
                <td style={{ padding: "9px 12px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn-primary" style={{ fontSize: 10, padding: "4px 8px", background: tradeMode === "LIVE" ? "#b91c1c" : "#064e3b", color: tradeMode === "LIVE" ? "#fef2f2" : "#fff" }} onClick={(e) => { e.stopPropagation(); openTrade(m, "buy", 0); }}>BUY YES</button>
                    <button className="btn-primary" style={{ fontSize: 10, padding: "4px 8px", background: tradeMode === "LIVE" ? "#7f1d1d" : "#450a0a", color: tradeMode === "LIVE" ? "#fef2f2" : "#fff" }} onClick={(e) => { e.stopPropagation(); openTrade(m, "buy", 1); }}>BUY NO</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default MarketList;
