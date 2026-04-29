import { useState } from "react";

export default function CopyConfigModal({ wallet, currentConfig, onClose, onSave }) {
  const [config, setConfig] = useState(currentConfig || {
    allocation_mode: "fixed",
    fixed_amount_usdc: 10,
    proportional_bps: 100,
    max_trade_usdc: 50,
    daily_loss_limit_usdc: 100,
    paper_mode: 1,
    enabled: 1
  });

  const handleSave = () => {
    onSave({
      ...config,
      id: currentConfig?.id || Math.random().toString(36).slice(2, 10),
      source_wallet: wallet.wallet_address,
      updated_at: new Date().toISOString()
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
      <div style={{ width: 440, background: "#0d1117", border: "1px solid #a855f7", borderRadius: 8, padding: 24, boxShadow: "0 0 30px rgba(168, 85, 247, 0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", margin: 0, letterSpacing: "0.05em" }}>CONFIGURE COPY: {wallet.alias || wallet.wallet_address.slice(0, 10)}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 16 }}>×</button>
        </div>

        {/* Allocation Section */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 8 }}>ALLOCATION STRATEGY</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button 
              className={config.allocation_mode === "fixed" ? "btn-primary" : "btn-ghost"}
              style={{ fontSize: 10, padding: "8px" }}
              onClick={() => setConfig({ ...config, allocation_mode: "fixed" })}
            >FIXED USDC</button>
            <button 
              className={config.allocation_mode === "proportional" ? "btn-primary" : "btn-ghost"}
              style={{ fontSize: 10, padding: "8px" }}
              onClick={() => setConfig({ ...config, allocation_mode: "proportional" })}
            >PROPORTIONAL</button>
          </div>
          
          <div style={{ marginTop: 12 }}>
            {config.allocation_mode === "fixed" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input 
                  type="number" className="inp" style={{ flex: 1 }} 
                  value={config.fixed_amount_usdc} 
                  onChange={e => setConfig({ ...config, fixed_amount_usdc: parseFloat(e.target.value) })}
                />
                <span style={{ fontSize: 10, color: "#4b5563" }}>USDC PER TRADE</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input 
                  type="number" className="inp" style={{ flex: 1 }} 
                  value={config.proportional_bps} 
                  onChange={e => setConfig({ ...config, proportional_bps: parseInt(e.target.value) })}
                />
                <span style={{ fontSize: 10, color: "#4b5563" }}>BPS (100 = 1%)</span>
              </div>
            )}
          </div>
        </div>

        {/* Risk Limits */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: 8 }}>RISK GUARDRAILS</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 4 }}>MAX TRADE CAP</div>
              <input 
                type="number" className="inp" value={config.max_trade_usdc}
                onChange={e => setConfig({ ...config, max_trade_usdc: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 4 }}>DAILY LOSS LIMIT</div>
              <input 
                type="number" className="inp" value={config.daily_loss_limit_usdc}
                onChange={e => setConfig({ ...config, daily_loss_limit_usdc: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </div>

        {/* Execution Mode */}
        <div style={{ marginBottom: 24, padding: 12, background: "rgba(168, 85, 247, 0.05)", border: "1px solid rgba(168, 85, 247, 0.1)", borderRadius: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#d8b4fe" }}>PAPER TRADING ONLY</span>
            <div style={{ width: 32, height: 16, background: "#a855f7", borderRadius: 8, position: "relative" }}>
              <div style={{ position: "absolute", right: 2, top: 2, width: 12, height: 12, background: "white", borderRadius: "50%" }} />
            </div>
          </div>
          <p style={{ fontSize: 9, color: "#71717a", margin: "8px 0 0 0" }}>V1 is restricted to simulated execution for safety.</p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose}>CANCEL</button>
          <button className="btn-primary" style={{ flex: 1, background: "#a855f7" }} onClick={handleSave}>SAVE CONFIGURATION</button>
        </div>
      </div>
    </div>
  );
}
