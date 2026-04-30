import { useState, useEffect, useRef, memo } from "react";

/**
 * WalletProfile Component
 * Shows historical PnL curve and detailed stats for a trader.
 */
const WalletProfile = memo(({ wallet, _session_id, onClose, isFollowing, onFollow, onUnfollow, onSetupCopy }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const resp = await fetch(`http://localhost:8888/copy/wallet/${wallet.wallet_address}/history`);
        const data = await resp.json();
        setHistory(data);
      } catch (e) {
        console.error("Failed to fetch wallet history", e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [wallet.wallet_address]);

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current || !window.LightweightCharts) return;

    const chart = window.LightweightCharts.createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: "#0d1117" },
        textColor: "#94a3b8",
        fontSize: 10,
        fontFamily: "'IBM Plex Mono', monospace",
      },
      grid: {
        vertLines: { color: "rgba(31, 41, 55, 0.2)" },
        horzLines: { color: "rgba(31, 41, 55, 0.2)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 240,
      timeScale: {
        borderColor: "#1f2937",
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: "#1f2937",
      },
      crosshair: {
        mode: 0,
        vertLine: { labelBackgroundColor: "#1e293b" },
        horzLine: { labelBackgroundColor: "#1e293b" },
      }
    });

    const series = chart.addLineSeries({
      color: "#60a5fa",
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Sync Data
  useEffect(() => {
    if (seriesRef.current && history.length > 0) {
      seriesRef.current.setData(history);
      chartRef.current?.timeScale().fitContent();
    }
  }, [history]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, backdropFilter: "blur(8px)" }}>
      <div style={{ width: 800, height: 600, background: "#0d1117", border: "1px solid #1f2937", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #1f2937", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161b22", position: "relative", zIndex: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", margin: 0 }}>{wallet.alias}</h2>
              <span style={{ fontSize: 10, color: "#4b5563", background: "rgba(75, 85, 99, 0.1)", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(75, 85, 99, 0.2)" }}>
                {wallet.wallet_address.slice(0, 10)}...{wallet.wallet_address.slice(-8)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Trader Profile • Data-driven Insights</div>
          </div>
          <div style={{ display: "flex", gap: 12, position: "relative", zIndex: 20 }}>
            {isFollowing ? (
              <button onClick={() => onUnfollow(wallet.wallet_address)} className="btn-ghost" style={{ fontSize: 11, borderColor: "#ef4444", color: "#ef4444", cursor: "pointer" }}>UNFOLLOW</button>
            ) : (
              <button onClick={() => onFollow(wallet.wallet_address, wallet.alias)} className="btn-primary" style={{ fontSize: 11, cursor: "pointer" }}>FOLLOW</button>
            )}
            <button onClick={onClose} className="btn-ghost" style={{ padding: "8px 12px", cursor: "pointer" }}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
          
          {/* Main: Chart & History */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ background: "#0d1117", border: "1px solid #1f2937", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #1f2937", fontSize: 10, fontWeight: 700, color: "#60a5fa", letterSpacing: "0.05em" }}>EQUITY CURVE (CUMULATIVE PNL)</div>
              <div ref={chartContainerRef} style={{ width: "100%", height: 240 }} />
              {loading && (
                <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", position: "absolute", inset: 0, background: "rgba(13, 17, 23, 0.5)" }}>
                  <div className="pulse" style={{ fontSize: 10, color: "#60a5fa" }}>SYNCING ON-CHAIN HISTORY...</div>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 12, letterSpacing: "0.05em" }}>RECENT ACTIVITY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.slice(-5).reverse().map((t, i) => (
                  <div key={i} style={{ padding: 12, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 10, color: t.side === 'BUY' ? '#10b981' : '#ef4444', fontWeight: 700 }}>{t.side}</span>
                      <span style={{ fontSize: 11, color: "#f8fafc", marginLeft: 8 }}>${t.size.toLocaleString()} USDC</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#4b5563" }}>{new Date(t.time * 1000).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar: Stats & Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 20, background: "rgba(96, 165, 250, 0.05)", border: "1px solid rgba(96, 165, 250, 0.1)", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", marginBottom: 16 }}>QUICK STATS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#4b5563" }}>TOTAL PNL (30D)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: (wallet.pnl || 0) >= 0 ? "#10b981" : "#ef4444" }}>
                    {(wallet.pnl || 0) >= 0 ? "+" : ""}${Math.abs(wallet.pnl || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#4b5563" }}>TRADE VOLUME</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc" }}>
                    ${(wallet.volume || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#4b5563" }}>RANK</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc" }}>
                    #{wallet.rank || "N/A"}
                  </div>
                </div>
              </div>
            </div>

            {isFollowing && (
              <button 
                onClick={onSetupCopy}
                className="btn-primary" 
                style={{ width: "100%", padding: "14px", fontWeight: 700, letterSpacing: "0.1em" }}
              >
                SETUP COPY TRADING
              </button>
            )}

            <div style={{ marginTop: "auto", padding: 16, background: "#0d1117", border: "1px dotted #30363d", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#4b5563", fontStyle: "italic", lineHeight: 1.4 }}>
                Risk Warning: Performance data is based on public on-chain snapshots and may have up to 60s latency.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
});

export default WalletProfile;
