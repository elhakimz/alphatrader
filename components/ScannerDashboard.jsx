import { memo, useState, useEffect, useMemo } from "react";

const SeverityBadge = ({ severity }) => {
  const colors = {
    HIGH: { bg: "#450a0a", text: "#fca5a5" },
    MEDIUM: { bg: "#422006", text: "#fcd34d" },
    LOW: { bg: "#164e63", text: "#a5f3fc" }
  };
  const { bg, text } = colors[severity] || colors.LOW;
  return (
    <span className="badge" style={{ background: bg, color: text }}>{severity}</span>
  );
};

const AlertCard = ({ alert, compact = false, markets = [], onMarketClick, openTrade, isHistorical = false }) => {
  const [expanded, setExpanded] = useState(false);
  const isAi = alert.alert_type === "AI_EDGE";
  const market = markets.find(m => m.id === alert.market_id);

  if (compact) {
    return (
      <div 
        style={{ padding: "8px 0", borderBottom: "1px solid #111827", cursor: "pointer" }}
        onClick={() => onMarketClick && onMarketClick(alert.market_id)}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700 }}>{alert.edge_pct}% EDGE</span>
          <span style={{ fontSize: 9, color: "#4b5563" }}>{alert.alert_type}</span>
        </div>
        <div style={{ fontSize: 11, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {alert.market_question}
        </div>
      </div>
    );
  }

  const handleBuy = (e) => {
    e.stopPropagation();
    if (!market || !openTrade || isHistorical) return;
    
    // Determine outcome based on edge
    // If details are string (from DB), we parse them
    const details = typeof alert.details_json === 'string' ? JSON.parse(alert.details_json) : (alert.details || {});
    
    if (alert.alert_type === "AI_EDGE") {
      const outcomeIdx = details.fair_prob > details.market_price ? 0 : 1;
      openTrade(market, "buy", outcomeIdx);
    } else if (alert.alert_type === "ARBITRAGE") {
      // For simple arb, open YES by default but user can toggle
      openTrade(market, "buy", 0);
    }
  };

  return (
    <div 
      className="market-card" 
      style={{ padding: 12, marginBottom: 12, border: "1px solid #1f2937", cursor: "pointer", opacity: isHistorical ? 0.7 : 1 }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span className="badge" style={{ background: isAi ? "#1e1b4b" : "#064e3b", color: isAi ? "#c7d2fe" : "#6ee7b7" }}>{alert.alert_type}</span>
          <SeverityBadge severity={alert.severity} />
          {isHistorical && <span style={{ fontSize: 8, color: "#4b5563", background: "#111827", padding: "1px 4px", borderRadius: 2 }}>HISTORICAL</span>}
        </div>
        <span style={{ fontSize: 10, color: "#4b5563" }}>{new Date(alert.created_at).toLocaleString()}</span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 10 }}>
        {alert.market_question}
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        {alert.message}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>{alert.action}</span>
          {!isHistorical && (
            <>
              <div style={{ width: 1, height: 12, background: "#1f2937" }} />
              <button 
                className="btn-ghost" 
                style={{ fontSize: 10, color: "#3b82f6", padding: 0 }}
                onClick={(e) => { e.stopPropagation(); onMarketClick && onMarketClick(alert.market_id); }}
              >VIEW MARKET ›</button>
              {market && (
                <button 
                  className="btn-ghost" 
                  style={{ fontSize: 10, color: "#10b981", padding: 0, fontWeight: 700 }}
                  onClick={handleBuy}
                >QUICK BUY ⚡</button>
              )}
            </>
          )}
        </div>
        {isAi && <span style={{ fontSize: 10, color: "#4b5563" }}>{expanded ? "↑ LESS" : "↓ REASONING"}</span>}
      </div>

      {isAi && expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1f2937", fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: "#94a3b8", fontSize: 10 }}>GROQ REASONING:</div>
          {(() => {
            const details = typeof alert.details_json === 'string' ? JSON.parse(alert.details_json) : (alert.details || {});
            return details.reasoning || "No reasoning available.";
          })()}
        </div>
      )}
    </div>
  );
};


const DbBrowser = ({ tableName }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`http://${window.location.hostname}:8888/db/query?table=${tableName}&limit=100`);
        const result = await resp.json();
        setData(result);
      } catch (err) {
        console.error("DB Browser error", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tableName]);

  if (loading) return <div className="empty-state">Querying {tableName}...</div>;
  if (data.length === 0) return <div className="empty-state">No data in {tableName} table.</div>;

  const headers = Object.keys(data[0]);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
        <thead>
          <tr style={{ background: "#0d1117", borderBottom: "1px solid #1f2937" }}>
            {headers.map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#4b5563", fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #0d1117" }}>
              {headers.map(h => (
                <td key={h} style={{ padding: "8px 12px", color: "#cbd5e1", verticalAlign: "top", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row[h]}>
                  {String(row[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ScannerDashboard = memo(({ alerts: liveAlerts, onRescan, stats, markets, onMarketClick, openTrade }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [viewMode, setViewMode] = useState("LIVE"); // LIVE, HISTORY, DATABASE
  const [historicalAlerts, setHistoricalAlerts] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [dbTable, setDbTable] = useState("alerts");
  const [secondsSinceScan, setSecondsSinceScan] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const activeAlerts = viewMode === "HISTORY" ? historicalAlerts : liveAlerts;

  // Timers: Scan age and Current time for staleness
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (stats?.last_scan) {
        const diff = Math.floor((currentTime - new Date(stats.last_scan).getTime()) / 1000);
        setSecondsSinceScan(Math.max(0, diff));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [stats?.last_scan]);

  const topOps = useMemo(() => {
    return [...(activeAlerts || [])]
      .sort((a, b) => (b.edge_pct || 0) - (a.edge_pct || 0))
      .slice(0, 4); // Show 4 as per wireframe
  }, [activeAlerts]);

  const fetchHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const resp = await fetch(`http://${window.location.hostname}:8888/alerts?limit=50`);
      const data = await resp.json();
      setHistoricalAlerts(data);
    } catch (err) {
      console.error("History fetch error", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "HISTORY") {
      setTimeout(() => fetchHistory(), 0);
    }
  }, [viewMode]);

  const handleRescan = async () => {
    setIsScanning(true);
    await onRescan();
    setTimeout(() => setIsScanning(false), 2000);
  };

  const exportToCsv = () => {
    if (!activeAlerts || activeAlerts.length === 0) return;
    const headers = ["Type", "Severity", "Market", "Message", "Action", "Edge %", "Time"];
    const rows = activeAlerts.map(a => [
      a.alert_type,
      a.severity,
      `"${a.market_question}"`,
      `"${a.message}"`,
      `"${a.action}"`,
      a.edge_pct,
      a.created_at
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `alpha_alerts_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header Controls */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1f2937", background: "#0d1117", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "0.05em", color: "#f8fafc" }}>ALPHA SCANNER</h2>
          
          <div style={{ display: "flex", background: "#060809", borderRadius: 4, padding: 2, border: "1px solid #1f2937" }}>
            {["LIVE", "HISTORY", "DATABASE"].map(m => (
              <button 
                key={m}
                className="btn-ghost" 
                style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: viewMode === m ? "#1e293b" : "transparent", color: viewMode === m ? "#f8fafc" : "#4b5563", border: "none" }}
                onClick={() => setViewMode(m)}
              >{m}</button>
            ))}
          </div>

          {viewMode === "DATABASE" && (
            <select 
              value={dbTable} 
              onChange={e => setDbTable(e.target.value)}
              style={{ background: "#060809", border: "1px solid #1f2937", color: "#60a5fa", fontSize: 10, borderRadius: 4, padding: "2px 6px" }}
            >
              <option value="alerts">ALERTS</option>
              <option value="inefficiencies">INEFFICIENCIES</option>
              <option value="ai_estimates">AI ESTIMATES</option>
            </select>
          )}

          {viewMode === "LIVE" && (
            <button 
              className="btn-ghost" 
              disabled={isScanning}
              onClick={handleRescan}
              style={{ fontSize: 10, padding: "4px 10px", background: "rgba(59, 130, 246, 0.1)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 4 }}
            >
              {isScanning ? "SCANNING..." : "RESCAN"}
            </button>
          )}

          <button 
            className="btn-ghost" 
            onClick={exportToCsv}
            style={{ fontSize: 10, padding: "4px 10px", color: "#94a3b8" }}
          >EXPORT CSV</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {viewMode === "LIVE" && stats?.last_scan && (
            <span style={{ fontSize: 10, color: "#4b5563", background: "#060809", padding: "3px 8px", borderRadius: 4, border: "1px solid #1f2937" }}>
              LAST SCAN: {secondsSinceScan}s AGO
            </span>
          )}
          <span style={{ fontSize: 10, color: "#4b5563" }}>
            {viewMode === "DATABASE" ? "DB EXPLORER" : `${activeAlerts.length} ${viewMode === "HISTORY" ? "RECORDS" : "LIVE ALERTS"} FOUND`}
          </span>
        </div>
      </div>

      {/* Main Dashboard Layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        
        {/* Left Column: Feed / Browser */}
        <div style={{ flex: 1, overflowY: "auto", borderRight: viewMode !== "DATABASE" ? "1px solid #111827" : "none" }}>
          {viewMode === "DATABASE" ? (
             <DbBrowser tableName={dbTable} />
          ) : isHistoryLoading ? (
             <div className="empty-state">Loading history...</div>
          ) : (() => {
              // Strictly filter LIVE view to only show non-stale items
              const filtered = viewMode === "LIVE" 
                ? activeAlerts.filter(a => (now - new Date(a.created_at).getTime()) <= 600000)
                : activeAlerts;

              if (filtered.length === 0) {
                return (
                  <div className="empty-state" style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 24, marginBottom: 16 }}>🔍</div>
                    {viewMode === "LIVE" ? "No active opportunities. Waiting for signals..." : "No alerts found in history."}
                  </div>
                );
              }

              return (
                <div style={{ padding: "16px 20px" }}>
                  {filtered.map(alert => {
                    const isStale = (now - new Date(alert.created_at).getTime()) > 600000;
                    return (
                      <AlertCard 
                        key={alert.id} 
                        alert={alert} 
                        markets={markets} 
                        onMarketClick={onMarketClick} 
                        openTrade={openTrade} 
                        isHistorical={viewMode !== "LIVE" || isStale}
                      />
                    );
                  })}
                </div>
              );
          })()}
        </div>

        {/* Right Column: Summary Panel (§3) - Hidden in DB mode */}
        {viewMode !== "DATABASE" && (
          <div style={{ width: 260, background: "#060809", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 24, borderLeft: "1px solid #1f2937" }}>
            
            {/* System Status Panel (TOP per design) */}
            <div>
              <h3 style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", letterSpacing: "0.05em", marginBottom: 12, borderBottom: "1px solid #1f2937", paddingBottom: 6 }}>SYSTEM STATUS</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#4b5563" }}>Markets tracked:</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{stats?.markets_count || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#4b5563" }}>Scans performed:</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{stats?.scans_today || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#4b5563" }}>Active Signals:</span>
                  <span style={{ color: "#3b82f6", fontWeight: 700 }}>
                    {activeAlerts.filter(a => (now - new Date(a.created_at).getTime()) <= 600000).length}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#4b5563" }}>Total Today (24h):</span>
                  <span style={{ color: "#10b981", fontWeight: 600 }}>{stats?.alerts_today || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#4b5563" }}>DB Engine:</span>
                  <span style={{ color: "#94a3b8" }}>SQLite WAL</span>
                </div>
              </div>
            </div>

            {/* Top Opportunities Panel (BOTTOM per design) */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontSize: 10, fontWeight: 700, color: "#4b5563", letterSpacing: "0.05em", marginBottom: 12, borderBottom: "1px solid #1f2937", paddingBottom: 6 }}>TOP OPPORTUNITIES</h3>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {topOps.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#374151" }}>Waiting for signals...</div>
                ) : (
                  topOps.map(op => {
                    const isStale = (now - new Date(op.created_at).getTime()) > 600000;
                    return (
                      <AlertCard 
                        key={op.id} 
                        alert={op} 
                        compact={true} 
                        markets={markets} 
                        onMarketClick={onMarketClick} 
                        openTrade={openTrade} 
                        isHistorical={viewMode !== "LIVE" || isStale}
                      />
                    );
                  })
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
});

export default ScannerDashboard;
