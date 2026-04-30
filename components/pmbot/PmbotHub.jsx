import { useState, useEffect, memo, useCallback } from "react";
import PmbotOverview from "./PmbotOverview";
import PmbotScanner from "./PmbotScanner";
import PmbotConsensus from "./PmbotConsensus";
import PmbotWhales from "./PmbotWhales";
import PmbotAudit from "./PmbotAudit";
import PmbotSettings from "./PmbotSettings";

const PmbotHub = memo(({ onMarketClick, markets }) => {
  const [subTab, setSubTab] = useState("overview");
  const [state, setState] = useState({
    bankroll: 10000.0,
    trade_count: 0,
    win_rate: 0,
    open_positions: [],
    daily_pnl: 0,
    equity_curve: [10000.0],
    daily_pnl_history: [],
    exit_triggers: [],
    scanner_log: [],
    consensus_log: [],
    whale_table: [],
    events: []
  });

  const refreshData = useCallback(async () => {
    try {
      // 1. Fetch All Positions
      const posResp = await fetch(`http://localhost:8888/pmbot/db/query?table=pmbot_positions&limit=100`);
      const allPositions = await posResp.json();
      
      // 2. Fetch Signals (Scanner Log)
      const sigResp = await fetch(`http://localhost:8888/pmbot/db/query?table=pmbot_signals&limit=100`);
      let signals = await sigResp.json();
      
      // 3. Fetch Consensus Votes
      const voteResp = await fetch(`http://localhost:8888/pmbot/db/query?table=consensus_votes&limit=300`);
      const rawVotes = await voteResp.json();

      // 4. Fetch Whales
      const whaleResp = await fetch(`http://localhost:8888/pmbot/whales`);
      const whaleRegistry = await whaleResp.json();

      const activityResp = await fetch(`http://localhost:8888/pmbot/db/query?table=wallet_activity&limit=100`);
      const activity = await activityResp.json();
      
      // Map titles and format features for display
      const titleMap = {};
      if (markets) {
        markets.forEach(m => titleMap[m.id] = m.question);
      }

      signals = signals.map(s => {
        let details = "";
        try {
          const f = JSON.parse(s.features);
          details = `gap:${f.gap?.toFixed(3)} edge:${(f.edge*100)?.toFixed(1)}% side:${f.side} whales:${f.whale_count}`;
        } catch(e) { details = s.features; }

        return {
          ...s,
          title: titleMap[s.market_id] || s.market_id.slice(0, 10) + "...",
          details: details
        };
      });

      // Group votes by market and proximity in time (30s window)
      const groups = [];
      const sortedVotes = [...rawVotes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      sortedVotes.forEach(v => {
        const vTime = new Date(v.created_at).getTime();
        let group = groups.find(g => 
          g.market_id === v.market_id && 
          Math.abs(new Date(g.created_at).getTime() - vTime) < 30000
        );

        if (!group) {
          group = {
            market_id: v.market_id,
            market: titleMap[v.market_id] || v.market_id.slice(0, 10),
            created_at: v.created_at,
            agents: []
          };
          groups.push(group);
        }
        group.agents.push(v);
      });

      const consensusLog = groups.map(g => {
        const enterVotes = g.agents.filter(a => a.vote.includes("ENTER")).length;
        return {
          ...g,
          consensus: enterVotes >= 2 ? "ENTER" : "SKIP",
          score: `${enterVotes}/3`
        };
      });

      // Map whale table
      const whaleTable = whaleRegistry.map(w => {
        const currentActivity = activity.filter(a => a.address.toLowerCase() === w.address.toLowerCase());
        const activeMarkets = currentActivity.map(a => titleMap[a.market_id] || a.market_id.slice(0, 8)).join(", ");
        return {
          ...w,
          status: currentActivity.length > 0 ? "ACTIVE" : "WATCH",
          markets: activeMarkets || "—"
        };
      });

      setState(prev => ({ 
        ...prev, 
        open_positions: allPositions.filter(p => p.status === 'open'),
        closed_positions: allPositions.filter(p => p.status === 'closed'),
        scanner_log: signals,
        consensus_log: consensusLog,
        whale_table: whaleTable,
        wallet_activity: activity,
        total_consensus_votes: rawVotes.length
      }));
    } catch (e) {
      console.error("PMBot Sync Error:", e);
    }
  }, [markets]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000);
    
    const handleUpdate = (e) => {
      const msg = e.detail;
      if (msg.type === "pmbot_state_update" && msg.data) {
        setState(prev => ({
          ...prev,
          ...msg.data,
          // Ensure open_positions are mapped if needed
        }));
      } else {
        refreshData();
      }
    };
    window.addEventListener("pmbot_update", handleUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("pmbot_update", handleUpdate);
    };
  }, [refreshData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg-main)", color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
      {/* PMBot Topbar / Sub-nav */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-main)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} className="pulse" />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em" }}>PMBOT v2.0 {" // "} AI AUTONOMOUS</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {["OVERVIEW", "SCANNER", "CONSENSUS", "WHALES", "AUDIT", "SETTINGS"].map(t => (
            <button 
              key={t}
              onClick={() => setSubTab(t.toLowerCase())}
              style={{ 
                fontSize: 10, 
                padding: "4px 12px", 
                border: "none",
                background: "transparent",
                color: subTab === t.toLowerCase() ? "var(--accent)" : "var(--text-dim)",
                borderBottom: subTab === t.toLowerCase() ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {subTab === "overview" && <PmbotOverview state={state} onMarketClick={onMarketClick} markets={markets} />}
        {subTab === "scanner" && <PmbotScanner state={state} onMarketClick={onMarketClick} markets={markets} />}
        {subTab === "consensus" && <PmbotConsensus state={state} onMarketClick={onMarketClick} markets={markets} />}
        {subTab === "whales" && <PmbotWhales state={state} onMarketClick={onMarketClick} />}
        {subTab === "audit" && <PmbotAudit state={state} onMarketClick={onMarketClick} />}
        {subTab === "settings" && <PmbotSettings />}
      </div>
      
      <style>{`
        .pulse {
          animation: pmbot-pulse 2s infinite;
        }
        @keyframes pmbot-pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
});

export default PmbotHub;
