import { memo, useState } from "react";

const PmbotAudit = memo(({ state, onMarketClick }) => {
  const [subTab, setSubTab] = useState("trade log");

  const tradeLog = state.closed_positions || [];
  const eventStream = state.events || [];

  const eventColors = {
    ORDER_FILLED: "var(--success)",
    ORDER_FAILED: "var(--danger)",
    RISK_BREACH: "#ffab00",
    WHALE_ACTIVITY: "var(--accent)",
    SCAN_COMPLETE: "var(--text-dim)"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-main)" }}>
      
      {/* Audit Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-main)" }}>
          AUDIT LOG {" // "} SQLite WAL {" // "} {tradeLog.length} trades {" // "} <span style={{ color: "var(--text-dim)", cursor: "pointer" }}>[EXPORT CSV]</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
           {["TRADE LOG", "EVENT STREAM", "P&L BREAKDOWN", "FEEDBACK"].map(t => (
              <span key={t} onClick={() => setSubTab(t.toLowerCase())} style={{ fontSize: 9, color: subTab === t.toLowerCase() ? "var(--accent)" : "var(--text-dim)", fontWeight: 700, cursor: "pointer" }}>{t}</span>
           ))}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        {subTab === "trade log" && (
           <table style={{ width: "100%", borderCollapse: "collapse" }}>
             <thead>
               <tr style={{ textAlign: "left", fontSize: 9, color: "var(--text-dim)", borderBottom: "1px solid var(--border-color)" }}>
                 <th style={{ padding: "8px 20px" }}>ID</th>
                 <th>MARKET</th>
                 <th>SIDE</th>
                 <th>SIZE</th>
                 <th>PRICE</th>
                 <th>PNL</th>
               </tr>
             </thead>
             <tbody>
               {tradeLog.map(t => (
                 <tr key={t.id} onClick={() => onMarketClick(t.market_id)} style={{ borderBottom: "1px solid var(--bg-card)", fontSize: 11, cursor: "pointer" }}>
                   <td style={{ padding: "12px 20px", color: "var(--text-dim)" }}>#{t.id}</td>
                   <td style={{ fontWeight: 700, color: "var(--text-main)" }}>{t.title}</td>
                   <td style={{ color: t.side === "YES" ? "var(--success)" : "var(--danger)" }}>{t.side}</td>
                   <td style={{ color: "var(--text-main)" }}>${t.size_usd?.toFixed(0)}</td>
                   <td style={{ color: "var(--text-main)" }}>{t.entry_price?.toFixed(2)} → {t.exit_price?.toFixed(2)}</td>
                   <td style={{ color: (t.pnl_usd || 0) >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
                     {t.pnl_usd ? `${t.pnl_usd >= 0 ? '+' : ''}$${t.pnl_usd.toFixed(2)}` : "OPEN"}
                   </td>
                 </tr>
               ))}
               {tradeLog.length === 0 && (
                 <tr>
                   <td colSpan="6" style={{ textAlign: "center", padding: 40, color: "var(--text-dim)", fontSize: 11 }}>NO CLOSED TRADES IN HISTORY</td>
                 </tr>
               )}
             </tbody>
           </table>
        )}

        {subTab === "event stream" && (
           <div style={{ padding: "0 20px" }}>
             {eventStream.map((ev, i) => (
               <div key={i} style={{ display: "flex", gap: 15, padding: "8px 0", borderBottom: "1px dotted var(--border-color)", fontSize: 10 }}>
                 <span style={{ color: "var(--text-dim)", width: 60 }}>{ev.ts}</span>
                 <span style={{ color: eventColors[ev.type] || "var(--text-main)", fontWeight: 700, width: 120 }}>{ev.type}</span>
                 <span style={{ color: "var(--text-main)" }}>{ev.msg}</span>
               </div>
             ))}
             {eventStream.length === 0 && (
               <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)", fontSize: 11 }}>NO EVENTS CAPTURED</div>
             )}
           </div>
        )}
      </div>

    </div>
  );
});

export default PmbotAudit;
