import { memo, useState } from "react";

const PmbotScanner = memo(({ state, onMarketClick }) => {
  const [showFilters, setShowFilters] = useState(false);

  const scanLog = state.scanner_log || [];
  const stats = state.scanner_stats || { markets_count: 0, scans_today: 0, alerts_today: 0, last_scan: null };

  const labelColors = {
    ENTER: "var(--success)",
    KILL: "var(--danger)",
    QUEUE: "#ffab00",
    SKIP: "var(--text-dark)",
    KEEP: "var(--text-dim)"
  };

  const distribution = state.cycle_distribution || scanLog.reduce((acc, log) => {
    acc[log.label] = (acc[log.label] || 0) + 1;
    return acc;
  }, {});

  const totalLogs = state.cycle_distribution 
    ? Object.values(state.cycle_distribution).reduce((a, b) => a + b, 0)
    : (scanLog.length || 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-main)" }}>
      
      {/* Scanner Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-main)" }}>
          MARKET SCANNER {" // "} {stats.markets_count} scanned → {stats.alerts_today} alerts <span style={{ color: "var(--text-dim)", marginLeft: 10 }}>Last run: {stats.last_scan ? new Date(stats.last_scan).toLocaleTimeString() : "N/A"}</span>
        </div>
        <button onClick={() => setShowFilters(!showFilters)} style={{ background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-dim)", fontSize: 9, padding: "2px 8px", cursor: "pointer" }}>
          {showFilters ? "HIDE FILTERS ▲" : "SHOW FILTERS ▼"}
        </button>
      </div>

      {/* Filter Controls (Collapsible) */}
      {showFilters && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", gap: 20, background: "var(--bg-card)" }}>
           {["GAP_MIN [0.025]", "GAP_MAX [0.50]", "DEPTH [$500]", "TTR_MIN [4h]", "TTR_MAX [48h]"].map(f => (
              <span key={f} style={{ fontSize: 9, color: "var(--success)", fontWeight: 700 }}>{f}</span>
           ))}
        </div>
      )}

      {/* Scan Log Table */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: 9, color: "var(--text-dim)", borderBottom: "1px solid var(--border-color)" }}>
              <th style={{ padding: "8px 20px", width: 80 }}>LABEL</th>
              <th>MARKET / DETAILS</th>
              <th style={{ width: 60 }}>SCORE</th>
              <th style={{ width: 80, textAlign: "right", paddingRight: 20 }}>BET</th>
            </tr>
          </thead>
          <tbody>
            {scanLog.map((log, i) => (
              <tr key={i} onClick={() => onMarketClick(log.market_id)} style={{ borderBottom: "1px solid var(--bg-card)", verticalAlign: "middle", cursor: "pointer" }} className="hover-row">
                <td style={{ padding: "12px 20px", fontSize: 10, fontWeight: 700, color: labelColors[log.label] }}>{log.label}</td>
                <td style={{ padding: "12px 0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: log.label === "SKIP" ? "var(--text-dark)" : "var(--text-main)" }}>{log.title}</div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>{log.details}</div>
                </td>
                <td style={{ fontSize: 10, color: "var(--text-dim)" }}>{(log.score || 0).toFixed(2)}</td>
                <td style={{ fontSize: 10, fontWeight: 700, textAlign: "right", paddingRight: 20, color: "var(--text-main)" }}>{log.bet_usd ? `$${log.bet_usd.toFixed(0)}` : "—"}</td>
              </tr>
            ))}
            {scanLog.length === 0 && (
              <tr>
                <td colSpan="4" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)", fontSize: 11 }}>NO SCAN DATA AVAILABLE</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Label Distribution Footer */}
      <div style={{ padding: "15px 20px", borderTop: "1px solid var(--border-color)", background: "var(--bg-main)" }}>
        <div style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, marginBottom: 10 }}>LABEL DISTRIBUTION (THIS CYCLE)</div>
        <div style={{ display: "flex", gap: 15 }}>
          <DistributionBar label="ENTER" count={distribution["ENTER"] || 0} color="var(--success)" total={totalLogs} />
          <DistributionBar label="QUEUE" count={distribution["QUEUE"] || 0} color="#ffab00" total={totalLogs} />
          <DistributionBar label="KEEP" count={distribution["KEEP"] || 0} color="var(--text-dim)" total={totalLogs} />
          <DistributionBar label="KILL" count={distribution["KILL"] || 0} color="var(--danger)" total={totalLogs} />
        </div>
      </div>

    </div>
  );
});

const DistributionBar = ({ label, count, color, total }) => {
  const width = (count / total) * 100;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 4, color: "var(--text-dim)" }}>
        <span>{label}</span>
        <span>{count}</span>
      </div>
      <div style={{ height: 4, background: "var(--border-color)" }}>
        <div style={{ height: "100%", width: `${width}%`, background: color }} />
      </div>
    </div>
  );
};

export default PmbotScanner;
