import { memo } from "react";

const PmbotWhales = memo(({ state, onMarketClick }) => {
  const whales = state.whale_table || [];
  const activeCount = whales.filter(w => w.status === "ACTIVE").length;

  const statusColors = {
    ACTIVE: "var(--success)",
    COPYING: "var(--accent)",
    MATCH: "#ffab00",
    WATCH: "var(--text-dim)"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-main)" }}>
      
      {/* Whales Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-main)" }}>
          WHALE TRACKER {" // "} {whales.length} WALLETS {" // "} <span style={{ color: "var(--success)" }}>{activeCount} ACTIVE</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
           {["ALL", "ACTIVE", "COPYING", "WATCH"].map(t => (
              <span key={t} style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, cursor: "pointer" }}>{t}</span>
           ))}
        </div>
      </div>

      {/* Whales Table */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: 9, color: "var(--text-dim)", borderBottom: "1px solid var(--border-color)" }}>
              <th style={{ padding: "12px 20px" }}>ADDRESS</th>
              <th>STATUS</th>
              <th>W/R</th>
              <th>TRADES</th>
              <th>CURRENT MARKETS</th>
            </tr>
          </thead>
          <tbody>
            {whales.map((w, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--bg-card)", fontSize: 11 }}>
                <td style={{ padding: "12px 20px", color: "var(--text-main)" }} title={w.address}>
                  {w.alias || `${w.address.slice(0, 10)}...`}
                </td>
                <td>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, border: `1px solid ${statusColors[w.status] || "var(--text-dim)"}`, color: statusColors[w.status] || "var(--text-dim)", fontWeight: 700 }}>
                    {w.status}
                  </span>
                </td>
                <td style={{ fontWeight: 700, color: "var(--text-main)" }}>{(w.win_rate * 100).toFixed(0)}%</td>
                <td style={{ color: "var(--text-dim)" }}>{w.trades}</td>
                <td style={{ color: "var(--success)" }}>{w.markets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Whale-triggered Consensus Feed Footer */}
      <div style={{ padding: "15px 20px", borderTop: "1px solid var(--border-color)", background: "var(--bg-main)" }}>
        <div style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700, marginBottom: 10 }}>RECENT WHALE ACTIVITY (POLLING POLYGON)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
           {(state.wallet_activity || []).slice(0, 3).map((a, i) => {
             const whale = whales.find(w => w.address.toLowerCase() === a.address.toLowerCase());
             const name = whale?.alias || a.address.slice(0, 8);
             return (
               <div key={i} style={{ fontSize: 10, color: "var(--success)" }}>
                 {name} → {a.side} on {a.market_id.slice(0, 10)} (${a.amount_usd})
               </div>
             );
           })}
           {(!state.wallet_activity || state.wallet_activity.length === 0) && (
             <div style={{ fontSize: 10, color: "var(--text-dim)" }}>NO RECENT ON-CHAIN ACTIVITY DETECTED</div>
           )}
        </div>
      </div>

    </div>
  );
});

export default PmbotWhales;
