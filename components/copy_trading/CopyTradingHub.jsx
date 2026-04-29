import { useState, useEffect, memo, useCallback, useMemo } from "react";
import CopyConfigModal from "./CopyConfigModal";

/**
 * CopyTradingHub Component
 * Main module for discovering wallets, managing follows, and monitoring copy feeds.
 */
const CopyTradingHub = memo(({ session_id, onMarketClick, markets = [] }) => {
  const [subTab, setSubTab] = useState("feed");
  const [followedWallets, setFollowedWallets] = useState([]);
  const [feedItems, setFeedFeedItems] = useState([]);
  const [copyConfigs, setCopyConfigs] = useState([]);
  const [copiedTrades, setCopiedTrades] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: "ts", direction: "desc" });
  const [activeConfigWallet, setActiveConfigWallet] = useState(null);

  // Sync data
  const refreshData = useCallback(async () => {
    try {
      const [walletsResp, feedResp, configsResp, copiesResp] = await Promise.all([
        fetch(`http://localhost:8888/copy/wallets?session_id=${session_id}`),
        fetch(`http://localhost:8888/copy/trades?session_id=${session_id}`),
        fetch(`http://localhost:8888/copy/configs?session_id=${session_id}`),
        fetch(`http://localhost:8888/copy/my_copies?session_id=${session_id}`)
      ]);
      setFollowedWallets(await walletsResp.json());
      setFeedFeedItems(await feedResp.json());
      setCopyConfigs(await configsResp.json());
      setCopiedTrades(await copiesResp.json());
    } catch (e) {
      console.error("Copy Trading Sync Error:", e);
    }
  }, [session_id]);

  useEffect(() => {
    setTimeout(() => refreshData(), 0);
    const interval = setInterval(refreshData, 30000); // 30s auto-refresh

    // Real-time refresh on settle event
    const handleRefresh = () => {
      console.log("[CopyUI] Refreshing data due to settle event...");
      refreshData();
    };
    window.addEventListener("copy_trading_refresh", handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("copy_trading_refresh", handleRefresh);
    };
  }, [refreshData]);

  const handleFollow = async (address, alias = "") => {
    try {
      await fetch(`http://localhost:8888/copy/follow?session_id=${session_id}&wallet=${address}&alias=${alias}`, { method: "POST" });
      refreshData();
    } catch (e) { console.error("Follow error", e); }
  };

  const handleUnfollow = async (address) => {
    try {
      await fetch(`http://localhost:8888/copy/unfollow?session_id=${session_id}&wallet=${address}`, { method: "POST" });
      refreshData();
    } catch (e) { console.error("Unfollow error", e); }
  };

  const handleSaveConfig = async (config) => {
    try {
      await fetch(`http://localhost:8888/copy/config/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, session_id })
      });
      setActiveConfigWallet(null);
      refreshData();
    } catch (e) { console.error("Config save error", e); }
  };

  // Helper to resolve title for sorting
  const getMarketTitle = useCallback((trade) => {
    const tradeMid = trade.market_id?.toLowerCase();
    const local = markets.find(m => m.id?.toLowerCase() === tradeMid);
    if (local?.question) return local.question;
    const raw = trade.raw_json || {};
    if (raw.title) return raw.title;
    if (raw.eventSlug) {
      return raw.eventSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return `Market ${trade.market_id.slice(0, 10)}...`;
  }, [markets]);

  const sortedFeed = useMemo(() => {
    let result = [...feedItems];
    const { key, direction } = sortConfig;

    result.sort((a, b) => {
      let valA, valB;
      if (key === "ts") {
        valA = new Date(a.ts).getTime();
        valB = new Date(b.ts).getTime();
      } else if (key === "title") {
        valA = getMarketTitle(a).toLowerCase();
        valB = getMarketTitle(b).toLowerCase();
      } else if (key === "wallet") {
        valA = (a.alias || a.source_wallet).toLowerCase();
        valB = (b.alias || b.source_wallet).toLowerCase();
      }

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [feedItems, sortConfig, getMarketTitle]);

  const toggleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc"
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Module Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1f2937", background: "#0d1117", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#a855f7", boxShadow: "0 0 10px #a855f7" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc", letterSpacing: "0.05em" }}>COPY TRADING ENGINE</span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {["FEED", "FOLLOWING", "DISCOVER", "MY COPIES"].map(t => (
            <button 
              key={t}
              onClick={() => setSubTab(t.toLowerCase())}
              className={"btn-ghost" + (subTab === t.toLowerCase() ? " active" : "")}
              style={{ 
                fontSize: 10, 
                padding: "4px 10px", 
                border: "none",
                background: subTab === t.toLowerCase() ? "rgba(168, 85, 247, 0.1)" : "transparent",
                color: subTab === t.toLowerCase() ? "#d8b4fe" : "#4b5563"
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar / Sort */}
      {subTab === "feed" && (
        <div style={{ padding: "8px 20px", background: "#060809", borderBottom: "1px solid #1f2937", display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#4b5563", fontWeight: 700 }}>SORT BY:</span>
          {[
            { id: "ts", label: "LATEST" },
            { id: "title", label: "MARKET" },
            { id: "wallet", label: "WALLETS" }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => toggleSort(s.id)}
              style={{ 
                fontSize: 9, 
                background: "transparent", 
                border: "none", 
                cursor: "pointer",
                color: sortConfig.key === s.id ? "#a855f7" : "#4b5563",
                fontWeight: sortConfig.key === s.id ? 700 : 400,
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              {s.label}
              {sortConfig.key === s.id && (
                <span>{sortConfig.direction === "desc" ? "↓" : "↑"}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: "auto", background: "#060809" }}>
        {subTab === "feed" && <TradeFeed items={sortedFeed} onMarketClick={onMarketClick} getMarketTitle={getMarketTitle} />}
        {subTab === "following" && (
          <FollowingList 
            wallets={followedWallets} 
            configs={copyConfigs}
            onUnfollow={handleUnfollow} 
            onConfigure={setActiveConfigWallet}
          />
        )}
        {subTab === "discover" && <DiscoverList onFollow={handleFollow} alreadyFollowing={followedWallets} />}
        {subTab === "my copies" && <CopiedTradesList items={copiedTrades} onMarketClick={onMarketClick} />}
      </div>

      {activeConfigWallet && (
        <CopyConfigModal 
          wallet={activeConfigWallet}
          currentConfig={copyConfigs.find(c => c.source_wallet.toLowerCase() === activeConfigWallet.wallet_address.toLowerCase())}
          onClose={() => setActiveConfigWallet(null)}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
});

const TradeFeed = ({ items = [], onMarketClick, markets = [], getMarketTitle }) => {
  return (
    <div style={{ padding: "16px 20px" }}>
      {!items || items.length === 0 ? (
        <div className="empty-state">No activity detected from followed wallets yet.</div>
      ) : (
        items.map(trade => {
          if (!trade) return null;
          return (
            <div key={trade.id} className="market-card" style={{ padding: 12, marginBottom: 10, border: "1px solid #1f2937" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#a855f7", fontWeight: 700 }}>
                  {trade.alias ? trade.alias.toUpperCase() : `${trade.source_wallet?.slice(0, 10)}...`}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {(() => {
                    const m = markets?.find(m => m?.id?.toLowerCase() === trade.market_id?.toLowerCase());
                    if (m?.end_date && new Date(m.end_date) < new Date(window.SYSTEM_DATE || "2026-04-26")) {
                      return <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5", fontSize: 8 }}>EXPIRED</span>;
                    }
                    return null;
                  })()}
                  <span style={{ fontSize: 9, color: "#4b5563" }}>{trade.ts ? new Date(trade.ts).toLocaleTimeString() : "Pending"}</span>
                </div>
              </div>

              <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 600, marginBottom: 8 }}>
                {getMarketTitle(trade)}
              </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge" style={{ background: trade.side === "BUY" ? "#064e3b" : "#450a0a", color: trade.side === "BUY" ? "#6ee7b7" : "#fca5a5" }}>
                  {trade.side}
                </span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{Math.round(trade.price * 100)}¢</span>
              </div>
              <button 
                className="btn-ghost" 
                style={{ fontSize: 9, padding: "2px 6px" }}
                onClick={() => onMarketClick(trade.market_id)}
              >VIEW MARKET ›</button>
            </div>
          </div>
          );
        })
      )}
    </div>
  );
};

const CopiedTradesList = ({ items, onMarketClick }) => (
  <div style={{ padding: "16px 20px" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", fontSize: 10, color: "#4b5563", borderBottom: "1px solid #1f2937" }}>
          <th style={{ padding: "8px 0" }}>TIME</th>
          <th>SIDE</th>
          <th>SIZE</th>
          <th>PRICE</th>
          <th>PNL</th>
          <th style={{ textAlign: "right" }}>ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        {items.map(t => (
          <tr key={t.id} style={{ borderBottom: "1px solid #0d1117", fontSize: 12 }}>
            <td style={{ padding: "12px 0", color: "#94a3b8" }}>{new Date(t.created_at).toLocaleTimeString()}</td>
            <td>
              <span style={{ color: t.executed_side === "BUY" ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                {t.executed_side}
              </span>
            </td>
            <td style={{ color: "#cbd5e1" }}>${Math.round(t.executed_size_usdc)}</td>
            <td style={{ color: "#cbd5e1" }}>{Math.round(t.executed_price * 100)}¢</td>
            <td>
              {t.status === "RESOLVED" ? (
                <span style={{ color: t.pnl >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                  {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}
                </span>
              ) : (
                <span style={{ color: "#4b5563" }}>OPEN</span>
              )}
            </td>
            <td style={{ textAlign: "right" }}>
              <button 
                className="btn-ghost" 
                style={{ fontSize: 9 }}
                onClick={() => onMarketClick(t.market_id)}
              >DETAILS</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {items.length === 0 && <div className="empty-state" style={{ marginTop: 40 }}>No automated trades executed yet.</div>}
  </div>
);

const FollowingList = ({ wallets, configs, onUnfollow, onConfigure }) => (
  <div style={{ padding: "16px 20px" }}>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", fontSize: 10, color: "#4b5563", borderBottom: "1px solid #1f2937" }}>
          <th style={{ padding: "8px 0" }}>WALLET</th>
          <th>ALIAS</th>
          <th>STATUS</th>
          <th style={{ textAlign: "right" }}>ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        {wallets.map(w => {
          const config = configs.find(c => c.source_wallet.toLowerCase() === w.wallet_address.toLowerCase());
          const isEnabled = config?.enabled === 1;
          
          return (
            <tr key={w.wallet_address} style={{ borderBottom: "1px solid #0d1117", fontSize: 12 }}>
              <td style={{ padding: "12px 0", color: "#cbd5e1" }}>{w.wallet_address.slice(0, 14)}...</td>
              <td style={{ color: "#94a3b8" }}>{w.alias || "-"}</td>
              <td>
                <span style={{ fontSize: 9, color: isEnabled ? "#10b981" : "#4b5563", fontWeight: 700 }}>
                  {isEnabled ? "● ACTIVE" : "○ INACTIVE"}
                </span>
              </td>
              <td style={{ textAlign: "right" }}>
                <button 
                  className="btn-ghost" 
                  style={{ color: "#a855f7", fontSize: 9, marginRight: 12 }}
                  onClick={() => onConfigure(w)}
                >CONFIGURE</button>
                <button 
                  className="btn-ghost" 
                  style={{ color: "#ef4444", fontSize: 9 }}
                  onClick={() => onUnfollow(w.wallet_address)}
                >UNFOLLOW</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    {wallets.length === 0 && <div className="empty-state" style={{ marginTop: 40 }}>You are not following any wallets yet.</div>}
  </div>
);

const DiscoverList = ({ onFollow, alreadyFollowing }) => {
  const [suggested, setSuggested] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSuggested = async () => {
      try {
        const resp = await fetch(`http://localhost:8888/copy/suggested`);
        const data = await resp.json();
        setSuggested(data);
      } catch (e) {
        console.error("Failed to fetch suggested wallets:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSuggested();
  }, []);

  if (isLoading) return <div className="empty-state">Loading suggestions...</div>;

  return (
    <div style={{ padding: "16px 20px" }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 16 }}>SUGGESTED ALPHA WALLETS</h3>
      {suggested.map(s => {
        const addr = s.wallet_address || s.address;
        const alias = s.alias;
        const isFollowing = alreadyFollowing.some(f => f.wallet_address.toLowerCase() === addr.toLowerCase());
        return (
          <div key={addr} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "#0d1117", border: "1px solid #1f2937", borderRadius: 4, marginBottom: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 600 }}>{alias}</div>
                {s.category && <span className="badge" style={{ fontSize: 8, padding: "1px 4px" }}>{s.category.toUpperCase()}</span>}
              </div>
              <div style={{ fontSize: 10, color: "#4b5563" }}>{addr.slice(0, 20)}...</div>
            </div>
            <button 
              className="btn-primary" 
              disabled={isFollowing}
              style={{ fontSize: 10, opacity: isFollowing ? 0.5 : 1 }}
              onClick={() => onFollow(addr, alias)}
            >
              {isFollowing ? "FOLLOWING" : "FOLLOW"}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default CopyTradingHub;
