import { memo } from "react";

const PmbotOverview = memo(({ state, onMarketClick, markets }) => {
  return (
    <div style={{ padding: 20, height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, background: "var(--bg-main)" }}>
      
      {/* Stat Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border-color)", border: "1px solid var(--border-color)" }}>
        {[
          { label: "BANKROLL", value: `$${state.bankroll.toLocaleString()}` },
          { label: "TRADES", value: state.trade_count },
          { label: "WIN RATE", value: `${state.win_rate}%`, color: state.win_rate >= 65 ? "var(--success)" : "#ffab00" },
          { label: "OPEN POS", value: state.open_positions.length },
          { label: "AVG HOLD", value: "18.4h" }
        ].map(s => (
          <div key={s.label} style={{ background: "var(--bg-card)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: s.color || "var(--success)" }}>{s.value}</span>
            <span style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 700 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Main Grid: Equity + Positions */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
        {/* Equity Curve Placeholder */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", padding: 20, height: 300, position: "relative" }}>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 15 }}>EQUITY CURVE {" // "} LIVE SESSION</div>
          <div style={{ height: "80%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
             <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
               {(() => {
                 const data = state.equity_curve || [10000];
                 if (data.length < 2) {
                   return <line x1="0" y1="180" x2="400" y2="180" stroke="var(--success)" strokeWidth="1" strokeDasharray="4" opacity="0.3" />;
                 }
                 
                 const min = Math.min(...data) * 0.995;
                 const max = Math.max(...data) * 1.005;
                 const range = max - min || 1;
                 
                 const points = data.map((val, i) => {
                   const x = (i / (data.length - 1)) * 400;
                   const y = 200 - ((val - min) / range) * 160 - 20; // Margin top/bottom
                   return `${x},${y}`;
                 });
                 
                 const pathData = `M${points.join(" L")}`;
                 const areaData = `${pathData} L400,200 L0,200 Z`;
                 
                 return (
                   <>
                     <path d={pathData} fill="none" stroke="var(--success)" strokeWidth="2" />
                     <path d={areaData} fill="rgba(16, 185, 129, 0.05)" />
                   </>
                 );
               })()}
             </svg>
          </div>
          <div style={{ position: "absolute", bottom: 20, right: 20, fontSize: 18, fontWeight: 700, color: "var(--text-main)" }}>
            ${state.bankroll.toLocaleString()}
          </div>
        </div>

        {/* Active Positions */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>ACTIVE POSITIONS ({state.open_positions.length})</div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {state.open_positions.length === 0 ? (
              <div style={{ padding: 20, fontSize: 11, color: "var(--text-dim)" }}>No open positions. Scanner running...</div>
            ) : (
              state.open_positions.map(p => {
                const market = markets?.find(m => m.id === p.market_id);
                const isHex = p.title && (p.title.startsWith("0x") || p.title === p.market_id);
                const displayTitle = (isHex || !p.title) ? (market?.question || p.market_id.slice(0, 24) + "...") : p.title;

                return (
                  <div key={p.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => onMarketClick(p.market_id)}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {displayTitle}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>{p.side} {" // "} ${p.size_usd} {" // "} @{p.entry_price}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--success)" }}>+12.4%</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Daily P&L Bars Placeholder */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", padding: 20 }}>
        <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 15 }}>DAILY P&L BARS</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 60 }}>
          {(() => {
            const history = state.daily_pnl_history || [];
            if (history.length === 0) {
              return <div style={{ fontSize: 10, color: "var(--text-dim)", width: "100%", textAlign: "center", paddingBottom: 20 }}>No trade history yet.</div>;
            }
            
            const maxVal = Math.max(...history.map(d => Math.abs(d.pnl)), 10);
            
            return history.map((d, i) => {
              const pct = (Math.abs(d.pnl) / maxVal) * 100;
              const isWin = d.pnl >= 0;
              return (
                <div 
                  key={i} 
                  title={`${d.date}: ${isWin ? "+" : ""}$${d.pnl.toFixed(2)}`}
                  style={{ 
                    flex: 1, 
                    background: isWin ? "var(--success)" : "var(--danger)", 
                    height: `${Math.max(5, pct)}%`, 
                    opacity: 0.5 + (pct/200),
                    borderRadius: "2px 2px 0 0",
                    transition: "height 0.3s ease"
                  }} 
                />
              );
            });
          })()}
        </div>
      </div>

      {/* Bottom Row: Risk + Triggers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
         <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", padding: 20 }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 15 }}>RISK MONITOR</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
               <RiskMeter label="DRAWDOWN" value={state.drawdown || 0} max={state.limits?.max_drawdown || 0.20} />
               <RiskMeter label="KELLY CAP" value={state.limits?.kelly_cap || 0} max={state.limits?.kelly_cap || 1.0} />
               <RiskMeter label="EXPOSURE" value={state.exposure_pct || 0} max={state.limits?.max_portfolio_pct || 0.60} />
               <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>DAILY LIMIT: ${Math.abs(state.daily_pnl || 0).toFixed(0)} / ${state.limits?.max_daily_loss || 200}</span>
                  <span style={{ fontSize: 10, color: (state.daily_pnl || 0) <= -(state.limits?.max_daily_loss || 200) ? "var(--danger)" : "var(--success)" }}>
                    ● CIRCUIT BREAKER: {(state.daily_pnl || 0) <= -(state.limits?.max_daily_loss || 200) ? "TRIPPED" : "ARMED"}
                  </span>
               </div>
            </div>
         </div>
         
         <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", padding: 20 }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 15 }}>EXIT TRIGGER QUEUE ({state.exit_triggers?.length || 0} ACTIVE)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
               {(!state.exit_triggers || state.exit_triggers.length === 0) ? (
                 <div style={{ fontSize: 10, color: "var(--text-dim)", padding: "10px 0" }}>No active exit triggers.</div>
               ) : (
                 state.exit_triggers.map((t, i) => (
                   <div key={i} style={{ fontSize: 10, color: t.type === "TARGET" ? "var(--success)" : "var(--text-dim)" }}>
                     {t.type} [{t.title?.slice(0, 30)}...] - {t.message}
                   </div>
                 ))
               )}
            </div>
         </div>
      </div>

    </div>
  );
});

const RiskMeter = ({ label, value, max }) => {
  const pct = (value / max) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 9, color: "var(--text-dim)", width: 60 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "var(--bg-main)", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: "var(--success)" }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--success)", width: 40, textAlign: "right" }}>{value.toFixed(3)}</span>
    </div>
  );
};

export default PmbotOverview;
