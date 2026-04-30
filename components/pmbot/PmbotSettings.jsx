import { useState, useEffect, memo } from "react";

const PmbotSettings = memo(() => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("http://localhost:8888/pmbot/config")
      .then(r => r.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("http://localhost:8888/pmbot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      alert("Settings saved successfully.");
    } catch {
      alert("Error saving settings.");
    }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 20, color: "var(--text-dim)" }}>Loading configuration...</div>;

  const categories = [
    {
      title: "RISK & SIZING",
      fields: [
        { key: "max_open_positions", label: "Max Open Positions", type: "number" },
        { key: "max_bet_usd", label: "Max Bet (USD)", type: "number" },
        { key: "max_daily_loss", label: "Daily Loss Limit (USD)", type: "number" },
        { key: "kelly_cap", label: "Kelly Multiplier (0-1)", type: "number", step: "0.01" },
        { key: "max_portfolio_pct", label: "Max Portfolio Exposure (%)", type: "number", step: "0.01" }
      ]
    },
    {
      title: "SCANNER FILTERS",
      fields: [
        { key: "scan_interval_seconds", label: "Scan Interval (sec)", type: "number" },
        { key: "gap_min", label: "Min Edge Required (%)", type: "number", step: "0.001" },
        { key: "ttr_min_hours", label: "Min Hours to Resolution", type: "number" },
        { key: "ttr_max_hours", label: "Max Hours to Resolution", type: "number" },
        { key: "enter_threshold", label: "AI Enter Threshold", type: "number", step: "0.01" }
      ]
    },
    {
      title: "AI & EXECUTION",
      fields: [
        { key: "groq_model", label: "LLM Model", type: "text" },
        { key: "consensus_required", label: "Consensus Required (votes)", type: "number" },
        { key: "max_slippage_bps", label: "Max Slippage (BPS)", type: "number" },
        { key: "feedback_alpha", label: "Learning Rate (EMA)", type: "number", step: "0.01" }
      ]
    }
  ];

  return (
    <div style={{ padding: 30, height: "100%", overflowY: "auto", background: "var(--bg-main)", display: "flex", flexDirection: "column", gap: 30 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>BOT CONFIGURATION {" // "} PARAMETERS</div>
        <button 
          onClick={handleSave}
          disabled={saving}
          style={{ 
            background: "var(--accent)", 
            color: "black", 
            border: "none", 
            padding: "8px 24px", 
            fontWeight: 800, 
            fontSize: 11, 
            cursor: "pointer",
            opacity: saving ? 0.5 : 1
          }}
        >
          {saving ? "SAVING..." : "SAVE CHANGES"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 30 }}>
        {categories.map(cat => (
          <div key={cat.title} style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", padding: 20 }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, marginBottom: 20, borderBottom: "1px solid var(--border-color)", paddingBottom: 8 }}>{cat.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {cat.fields.map(f => (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>{f.label.toUpperCase()}</label>
                  <input 
                    type={f.type} 
                    step={f.step}
                    value={config[f.key]} 
                    onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ 
                      background: "var(--bg-main)", 
                      border: "1px solid var(--border-color)", 
                      color: "var(--text-main)", 
                      padding: "8px 12px", 
                      fontSize: 12, 
                      fontFamily: "var(--font-mono)",
                      outline: "none"
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 20, padding: 15, border: "1px dashed var(--border-color)", background: "rgba(255,255,255,0.02)" }}>
        * Sensitive parameters (API Keys, RPC URLs) are managed via .env for security.
        <br />
        * Changes to execution parameters may affect bot profitability.
      </div>
    </div>
  );
});

export default PmbotSettings;
