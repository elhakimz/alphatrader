import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import "./index.css";

// Components
import MarketChart from "./components/MarketChart";
import OrderBookView from "./components/OrderBookView";
import TradeHistoryView from "./components/TradeHistoryView";
import MarketDetailView from "./components/MarketDetailView";
import TradeModal from "./components/TradeModal";
import Header from "./components/Header";
import MarketList from "./components/MarketList";
import PortfolioView from "./components/PortfolioView";
import Sidebar from "./components/Sidebar";
import ScannerDashboard from "./components/ScannerDashboard";
import LogViewer from "./components/LogViewer";
import NewsFeed from "./components/NewsFeed";
import CopyTradingHub from "./components/copy_trading/CopyTradingHub";

// ── Global Config ──────────────────────────────────────────
const SESSION_ID = (() => {
  let id = typeof window !== "undefined" ? localStorage.getItem("poly_session_id") : null;
  if (!id) {
    id = "user_" + Math.random().toString(36).slice(2, 10);
    if (typeof window !== "undefined") localStorage.setItem("poly_session_id", id);
  }
  return id;
})();

const API_HOST = window.location.hostname + ":8888";
const WS_URL = `ws://${API_HOST}/ws/${SESSION_ID}`;
const STARTING_CASH = 1000.0;
const CONN_STATES = { CONNECTING: "CONNECTING", OPEN: "OPEN", CLOSED: "CLOSED", ERROR: "ERROR" };
const SEC_MAP = { "1s": 1, "1m": 60, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400, "1w": 604800 };

export default function PolymarketTrader() {
  const wsRef = useRef(null);

  // 1. State
  const [connState, setConnState] = useState(CONN_STATES.CLOSED);
  const [markets, setMarkets] = useState([]);
  const [prices, setPrices] = useState({});
  const [orderBooks, setOrderBooks] = useState({});
  const [tradeMode, setTradeMode] = useState("PAPER");
  const [paperPortfolio, setPaperPortfolio] = useState({ cash: STARTING_CASH, positions: {}, history: [] });
  const [livePortfolio, setLivePortfolio] = useState({ cash: 0, positions: {}, history: [] });
  const [wsStatus, setWsStatus] = useState({ connected: false, messages_received: 0 });
  const [wsLog, setWsLog] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("markets");
  const [tradeModal, setTradeModal] = useState(null);
  const [tradeShares, setTradeShares] = useState("10");
  const [tradeSide, setTradeSide] = useState("buy");
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [toast, setToast] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [selectedMarketId, setSelectedMarketId] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [timescale, setTimescale] = useState("1s");
  const [chartHeight, setChartHeight] = useState(300);
  const [sortConfig, setSortConfig] = useState({ key: "start_date", direction: "desc" });
  const [viewMode, setViewMode] = useState("table");
  const [listType, setListType] = useState("active");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogsVisible, setIsLogsVisible] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [news, setNews] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [intelligenceReport, setIntelligenceReport] = useState(null);
  const [isIntelligenceLoading, setIsIntelligenceLoading] = useState(false);
  const [scannerStats, setScannerStats] = useState({ markets_count: 0, scans_today: 0, alerts_today: 0, last_scan: null });
  const [systemStatus, setSystemStatus] = useState({
    api: { status: "active" },
    scanner: { status: "off" },
    copy: { status: "off" },
    news: { status: "off" }
  });
  
  // Buffers for high-frequency data
  const priceBufferRef = useRef({});
  const orderBookBufferRef = useRef({});

  // Commit buffers to state every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(priceBufferRef.current).length > 0) {
        setPrices(prev => ({ ...prev, ...priceBufferRef.current }));
        priceBufferRef.current = {};
      }
      if (Object.keys(orderBookBufferRef.current).length > 0) {
        setOrderBooks(prev => ({ ...prev, ...orderBookBufferRef.current }));
        orderBookBufferRef.current = {};
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Guard refs
  const lastSyncModeRef = useRef("");
  const lastHistoryKeyRef = useRef("");
  const lastFetchRef = useRef("");
  const lastSearchedIdRef = useRef("");
  const lastBrainMarketIdRef = useRef("");
  const selectedMarketIdRef = useRef(null);

  // Sync ref with state
  useEffect(() => {
    selectedMarketIdRef.current = selectedMarketId;
  }, [selectedMarketId]);

  // 2. Helpers
  const getTokenId = (market, outcomeIdx) => {
    if (!market) return "";
    const tokens = market.tokens || [];
    const t = tokens[outcomeIdx];
    return t ? (typeof t === "string" ? t : t.token_id || t.id || "") : "";
  };

  const getPrice = useCallback((market, outcomeIdx) => {
    const tid = getTokenId(market, outcomeIdx);
    if (tid && prices[tid]?.price != null) return prices[tid].price;
    return parseFloat((market?.outcome_prices || [])[outcomeIdx]) || 0.5;
  }, [prices]);

  // 3. Derived State
  const portfolio = useMemo(() => 
    tradeMode === "PAPER" ? paperPortfolio : livePortfolio, 
    [tradeMode, paperPortfolio, livePortfolio]
  );

  const stats = useMemo(() => {
    let posVal = 0; let pnl = 0;
    for (const [tid, pos] of Object.entries(portfolio.positions || {})) {
      const curr = prices[tid]?.price ?? pos.avg_cost;
      posVal += pos.shares * curr;
      pnl += pos.shares * (curr - pos.avg_cost);
    }
    const val = (portfolio.cash || 0) + posVal;
    return { value: val, pnl, totalPnl: val - STARTING_CASH };
  }, [portfolio, prices]);

  const sortedMarkets = useMemo(() => {
    const q = searchQ.toLowerCase();
    let result = q ? markets.filter(m => (m.question || "").toLowerCase().includes(q) || (m.category || "").toLowerCase().includes(q)) : [...markets];

    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === "yes") {
          valA = getPrice(a, 0); valB = getPrice(b, 0);
        } else if (sortConfig.key === "no") {
          valA = getPrice(a, 1); valB = getPrice(b, 1);
        } else {
          valA = a[sortConfig.key] || 0; valB = b[sortConfig.key] || 0;
        }

        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [markets, searchQ, sortConfig, getPrice]);

  const addLog = useCallback((level, message, ts = null) => {
    setWsLog(prev => [...prev.slice(-100), { level, message, ts: ts || new Date().toISOString() }]);
  }, []);

  const send = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(obj));
  }, []);

  const showToast = useCallback((msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) { console.error("Audio error", e); }
  }, []);

  const onMarketClick = useCallback((marketId) => {
    if (!marketId) return;
    // Handle comma-separated lists (take first ID)
    const singleId = marketId.toString().split(',')[0].trim();
    setSelectedMarketId(singleId);
    setActiveTab("detail");
  }, []);

  // 4. Data Fetching
  const fetchTradeHistory = useCallback(async () => {
    if (tradeMode === "PAPER") {
      setTradeHistory(paperPortfolio.history.map(h => ({
        timestamp: Math.floor(new Date(h.ts).getTime() / 1000),
        side: h.side.toUpperCase(), title: h.question,
        outcomeIndex: h.outcome === "YES" ? 0 : 1,
        size: h.shares, price: h.price, transactionHash: "PAPER_" + h.id
      })));
      return;
    }
    setIsHistoryLoading(true);
    try {
      const resp = await fetch(`http://${API_HOST}/live/history`);
      setTradeHistory(await resp.json() || []);
    } catch (err) { console.error("History error", err); }
    finally { setIsHistoryLoading(false); }
  }, [tradeMode, paperPortfolio.history]);

  const fetchHistory = useCallback(async (marketId, ts) => {
    if (!marketId) return;
    setIsChartLoading(true);
    try {
      const market = markets.find(m => m.id?.toLowerCase() === marketId.toLowerCase());
      const tid = getTokenId(market, 0);
      if (!tid) {
        lastFetchRef.current = ""; // Reset so we retry when market loads
        return;
      }
      const map = { "1s": ["1d", 0], "1m": ["1w", 1], "15m": ["1d", 1], "1h": ["1w", 5], "6h": ["max", 60], "1d": ["max", 60], "1w": ["max", 1440] };
      const [apiInt, apiFid] = map[ts] || ["1w", 60];
      const resp = await fetch(`http://${API_HOST}/history?token_id=${tid}&interval=${apiInt}&fidelity=${apiFid}`);
      const data = await resp.json();
      if (data?.history?.length > 5) {
        const raw = data.history.map(item => ({ t: Number(item.t), p: Number(item.p) })).sort((a, b) => a.t - b.t);
        const interval = SEC_MAP[ts] || 3600;
        const aggregated = []; let currentCandle = null;
        for (const point of raw) {
          const roundedTime = Math.floor(point.t / interval) * interval;
          if (!currentCandle || roundedTime !== currentCandle.time) {
            if (currentCandle) aggregated.push(currentCandle);
            currentCandle = { time: roundedTime, open: point.p, high: point.p, low: point.p, close: point.p };
          } else {
            currentCandle.high = Math.max(currentCandle.high, point.p);
            currentCandle.low = Math.min(currentCandle.low, point.p);
            currentCandle.close = point.p;
          }
        }
        if (currentCandle) aggregated.push(currentCandle);
        setChartData(aggregated);
      } else {
        const now = Math.floor(Date.now() / 1000);
        const interval = SEC_MAP[ts] || 3600;
        const cp = getPrice(market, 0);
        setChartData(Array.from({ length: 20 }, (_, i) => ({
          time: Math.floor((now - (20 - i) * interval) / interval) * interval,
          open: cp, high: cp, low: cp, close: cp
        })));
      }
    } catch { setChartData([]); }
    finally { setIsChartLoading(false); }
  }, [markets, getPrice]);

  // 5. Effects
  useEffect(() => {
    setTimeout(() => setConnState(CONN_STATES.CONNECTING), 0);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => { setConnState(CONN_STATES.OPEN); addLog("sys", "Connected to Backend"); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "init" || msg.type === "state") {
          if (msg.markets) setMarkets(msg.markets);
          if (msg.prices) setPrices(msg.prices);
          if (msg.order_books) setOrderBooks(msg.order_books);
          if (msg.news) setNews(msg.news.sort((a, b) => new Date(b.ts) - new Date(a.ts)));
          if (msg.mode === "LIVE") setLivePortfolio(msg.portfolio || {});
          else setPaperPortfolio(msg.portfolio || {});
          if (msg.ws_status) setWsStatus(msg.ws_status);
          if (msg.system_date) window.SYSTEM_DATE = msg.system_date;
          if (msg.server_logs) {
            setWsLog(msg.server_logs);
          }
        } else if (msg.type === "price_update" || msg.type === "heartbeat") {
          // Use buffers for high-frequency updates
          if (msg.prices) {
            priceBufferRef.current = { ...priceBufferRef.current, ...msg.prices };
          }
          if (msg.order_books) {
            orderBookBufferRef.current = { ...orderBookBufferRef.current, ...msg.order_books };
          }
          if (msg.ws_status) setWsStatus(msg.ws_status);
          if (msg.engine_status) setSystemStatus(msg.engine_status);
        } else if (msg.type === "trade_result") {
          if (msg.mode === "LIVE") send({ type: "sync_live_state" });
          else setPaperPortfolio(msg.portfolio);
          showToast(msg.result.success ? "Trade executed" : msg.result.error, msg.result.success);
          if (msg.result.success) setTradeModal(null);
        } else if (msg.type === "markets_refresh") {
          if (msg.markets) setMarkets(msg.markets);
        } else if (msg.type === "alerts_refresh") {
          if (msg.alerts) setAlerts(msg.alerts);
          if (msg.scanner_stats) setScannerStats(msg.scanner_stats);
        } else if (msg.type === "scanner_stats_update") {
          if (msg.scanner_stats) setScannerStats(msg.scanner_stats);
        } else if (msg.type === "news_update") {
          setNews(prev => {
            if (prev.find(n => n.id === msg.item.id)) return prev;
            const updated = [msg.item, ...prev].slice(0, 100);
            return updated.sort((a, b) => new Date(b.ts) - new Date(a.ts));
          });
        } else if (msg.type === "new_alpha_alert") {
          const id = Math.random().toString(36).slice(2, 9);
          setNotifications(prev => [{ id, ...msg.alert }, ...prev].slice(0, 5));
          playNotificationSound();
          // Hide after 3 minutes (180,000 ms)
          setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 180000);
        } else if (msg.type === "copy_executed" && msg.session_id === SESSION_ID) {
          const id = Math.random().toString(36).slice(2, 9);
          const alert = {
            id,
            alert_type: "MIRROR EXECUTION",
            severity: "HIGH",
            market_id: msg.market_id,
            market_question: "Automated Copy Trade",
            message: `Mirroring ${msg.side} ${msg.size} USDC at ${Math.round(msg.price * 100)}¢`
          };
          setNotifications(prev => [alert, ...prev].slice(0, 5));
          addLog("sys", `COPY: [${msg.wallet_address.slice(0, 8)}] Mirroring ${msg.side} on ${msg.market_id.slice(0, 8)}`);
          playNotificationSound();
        } else if (msg.type === "copy_settled" && msg.session_id === SESSION_ID) {
          const id = Math.random().toString(36).slice(2, 9);
          const alert = {
            id,
            alert_type: "COPY RESOLVED",
            severity: "MEDIUM",
            market_id: msg.market_id,
            market_question: "Automated Copy Settle",
            message: `Trade settled with PnL: ${msg.pnl >= 0 ? "+" : ""}${msg.pnl.toFixed(2)} USDC`
          };
          setNotifications(prev => [alert, ...prev].slice(0, 5));
          addLog("sys", `COPY: Settled trade on ${msg.market_id.slice(0, 8)} | PnL: $${msg.pnl.toFixed(2)}`);
          playNotificationSound();
          // Dispatch a custom event to tell CopyTradingHub to refresh
          window.dispatchEvent(new CustomEvent("copy_trading_refresh"));
        } else if (msg.type === "intelligence_report") {
          console.log(`[BRAIN] Report received for ${msg.market_id}`);
          const currentId = selectedMarketIdRef.current;
          if (currentId && msg.market_id.toLowerCase() === currentId.toLowerCase()) {
            if (msg.error) {
              showToast(`Brain Error: ${msg.error}`, false);
              setIsIntelligenceLoading(false);
            } else {
              setIntelligenceReport(msg.report);
              setIsIntelligenceLoading(false);
            }
          }
        } else if (msg.type === "server_log") {
          addLog(msg.level, msg.message, msg.ts);
        }
      } catch (ex) { console.error("WS Error", ex); }
    };
    ws.onclose = () => setConnState(CONN_STATES.CLOSED);
    return () => ws.close();
  }, [addLog, showToast, send, playNotificationSound]);

  useEffect(() => {
    if (tradeMode === "LIVE" && connState === CONN_STATES.OPEN && lastSyncModeRef.current !== "LIVE") {
      send({ type: "sync_live_state" });
      lastSyncModeRef.current = "LIVE";
    } else if (tradeMode === "PAPER") lastSyncModeRef.current = "PAPER";
  }, [tradeMode, connState, send]);

  useEffect(() => {
    const key = activeTab + tradeMode;
    if ((activeTab === "history" || tradeMode === "LIVE") && lastHistoryKeyRef.current !== key) {
      fetchTradeHistory();
      lastHistoryKeyRef.current = key;
    }
  }, [activeTab, tradeMode, fetchTradeHistory]);

  useEffect(() => {
    const fetchKey = `${selectedMarketId}-${timescale}`;
    if (selectedMarketId && lastFetchRef.current !== fetchKey) {
      fetchHistory(selectedMarketId, timescale);
      lastFetchRef.current = fetchKey;
    }
  }, [selectedMarketId, timescale, fetchHistory]);

  // On-demand Fetch Missing Market
  useEffect(() => {
    if (selectedMarketId) {
      const market = markets.find(m => m.id?.toLowerCase() === selectedMarketId.toLowerCase());
      if (!market) {
        send({ type: "fetch_market", market_id: selectedMarketId });
      }
    }
  }, [selectedMarketId, markets, send]);

  // On-demand News Search
  useEffect(() => {
    if (activeTab === "news" && selectedMarketId && lastSearchedIdRef.current !== selectedMarketId) {
      const market = markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase());
      if (market) {
        setTimeout(() => addLog("sys", `RESEARCH: Requesting intelligence for '${market.question.slice(0, 40)}...'`), 0);
        send({ type: "search_news", query: market.question, market_id: market.id });
        lastSearchedIdRef.current = selectedMarketId;
      }
    } else if (!selectedMarketId) {
      lastSearchedIdRef.current = "";
    }
  }, [activeTab, selectedMarketId, markets, send, addLog]);

  const refreshIntelligence = useCallback(() => {
    if (selectedMarketId) {
      send({ type: "request_intelligence", market_id: selectedMarketId });
      setIsIntelligenceLoading(true);
      setIntelligenceReport(null);
      lastBrainMarketIdRef.current = selectedMarketId;
    }
  }, [selectedMarketId, send]);

  // On-demand Edge Brain Intelligence
  useEffect(() => {
    if (activeTab === "detail" && selectedMarketId && lastBrainMarketIdRef.current !== selectedMarketId) {
      refreshIntelligence();
    } else if (!selectedMarketId) {
      lastBrainMarketIdRef.current = "";
      setTimeout(() => setIntelligenceReport(null), 0);
    }
  }, [activeTab, selectedMarketId, refreshIntelligence]);

  useEffect(() => {
    if (!selectedMarketId || isChartLoading || chartData.length === 0) return;
    const tid = getTokenId(markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase()), 0);
    const newPrice = prices[tid]?.price;
    if (newPrice == null) return;
    const secMap = { "1s": 1, "1m": 60, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400, "1w": 604800 };
    const interval = secMap[timescale] || 3600;
    const roundedTime = Math.floor((Date.now() / 1000) / interval) * interval;
    setTimeout(() => {
      setChartData(prev => {
        if (prev.length === 0) return prev;
        const last = { ...prev[prev.length - 1] };
        if (last.time === roundedTime) {
          last.high = Math.max(last.high, newPrice); last.low = Math.min(last.low, newPrice); last.close = newPrice;
          return [...prev.slice(0, -1), last];
        } else if (roundedTime > last.time) {
          return [...prev, { time: roundedTime, open: newPrice, high: newPrice, low: newPrice, close: newPrice }].slice(-1000);
        }
        return prev;
      });
    }, 0);
    }, [prices, selectedMarketId, timescale, isChartLoading, markets, chartData.length]);

  const [tradePrice, setTradePrice] = useState(0);
  const openTrade = (market, side, outcomeIdx, initialPrice = null) => {
    setTradeModal(market); setTradeSide(side); setSelectedOutcome(outcomeIdx); setTradeShares("10");
    setTradePrice(initialPrice || getPrice(market, outcomeIdx));
  };

  const submitTrade = () => {
    if (!tradeModal) return;
    const shares = parseFloat(tradeShares);
    if (isNaN(shares) || shares <= 0) return showToast("Enter valid shares", false);
    send({ type: "trade", token_id: getTokenId(tradeModal, selectedOutcome), side: tradeSide, shares, price: tradePrice || getPrice(tradeModal, selectedOutcome), question: tradeModal.question, outcome: (tradeModal.outcomes || ["YES", "NO"])[selectedOutcome], mode: tradeMode });
  };

  const terminalTabs = ["markets", "detail", "depth", "history"];
  const isTerminalActive = terminalTabs.includes(activeTab);

  const chartMarkers = useMemo(() => {
    if (!selectedMarketId) return [];
    return news
      .filter(n => 
        n.market_id && 
        n.market_id.toString().toLowerCase().includes(selectedMarketId.toLowerCase()) && 
        n.pis >= 70
      )
      .map(n => ({
        time: Math.floor(new Date(n.ts).getTime() / 1000),
        position: 'aboveBar',
        color: '#ef4444',
        shape: 'circle',
        text: 'NEWS',
        size: 1
      }))
      .sort((a, b) => a.time - b.time);
  }, [news, selectedMarketId]);

  const connDot = { CONNECTING: "#f59e0b", OPEN: "#10b981", CLOSED: "#6b7280", ERROR: "#ef4444" }[connState];
  const connLabel = { CONNECTING: "CONNECTING", OPEN: "LIVE", CLOSED: "OFFLINE", ERROR: "ERROR" }[connState];

  return (
    <div className="terminal-root">
      <Header 
        connDot={connDot} connLabel={connLabel} wsStatus={wsStatus} tradeMode={tradeMode} 
        setTradeMode={setTradeMode} portfolioValue={stats.value} totalPnl={stats.totalPnl} 
        portfolioCash={portfolio.cash} connState={connState} connect={() => window.location.reload()} 
        send={send} CONN_STATES={CONN_STATES} 
        isLogsVisible={isLogsVisible} setIsLogsVisible={setIsLogsVisible}
        showChart={showChart} setShowChart={setShowChart}
        showPortfolio={showPortfolio} setShowPortfolio={setShowPortfolio}
        systemStatus={systemStatus}
      />
      
      <div className="main-layout">
        <Sidebar 
          isOpen={isSidebarOpen} 
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="left-panel">
          {/* Permanent Chart Header (if market selected, chart visible, and in terminal tabs) */}
          {isTerminalActive && selectedMarketId && showChart && (
            <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid #1f2937" }}>
              <div style={{ position: "relative" }}>
                <MarketChart 
                  data={chartData} loading={isChartLoading} timescale={timescale} 
                  onTimescaleChange={setTimescale} chartHeight={chartHeight} 
                  markers={chartMarkers}
                  tokenName={(() => {
                    const m = markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase());
                    if (!m) return "Loading Market Data...";
                    let prefix = "";
                    if (m.start_date && new Date(m.start_date).toISOString().split('T')[0] === new Date(window.SYSTEM_DATE || "2026-04-26").toISOString().split('T')[0]) prefix += "[NEW] ";
                    if (m.end_date && new Date(m.end_date) < new Date(window.SYSTEM_DATE || "2026-04-26")) prefix += "[EXPIRED] ";
                    return prefix + (m.question?.slice(0, 60) || "Unknown Market") + "...";
                  })()} 
                />
              </div>
              <div className="resizer" onMouseDown={(e) => {
                const startY = e.clientY; const startH = chartHeight;
                const onMove = (me) => setChartHeight(Math.max(100, Math.min(800, startH + (me.clientY - startY))));
                const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
                document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
              }}><div className="resizer-handle" /></div>
            </div>
          )}

          {isTerminalActive && (
            <div className="tab-bar">
              <div style={{ display: "flex", flex: 1 }}>
                {terminalTabs.map(t => (
                  <button key={t} className={"tab" + (activeTab === t ? " active" : "")} onClick={() => setActiveTab(t)}>{t.toUpperCase()}</button>
                ))}
                {selectedMarketId && (
                  <button 
                    className="tab" 
                    style={{ color: "#ef4444", borderLeft: "1px solid #1f2937" }} 
                    onClick={() => setSelectedMarketId(null)}
                  >
                    [ CLEAR SELECTION ]
                  </button>
                )}
              </div>

              {activeTab === "markets" && (
                <div style={{ display: "flex", alignItems: "center", paddingRight: 8, gap: 8 }}>
                  <div style={{ display: "flex", background: "#0d1117", borderRadius: 4, padding: 2, border: "1px solid #1f2937" }}>
                    <button 
                      className={"btn-ghost" + (listType === "active" ? " active" : "")} 
                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: listType === "active" ? "#1e293b" : "transparent", color: listType === "active" ? "#f8fafc" : "#4b5563", border: "none" }}
                      onClick={() => { setListType("active"); send({ type: "sync_active" }); }}
                    >ACTIVE</button>
                    <button 
                      className={"btn-ghost" + (listType === "featured" ? " active" : "")} 
                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: listType === "featured" ? "#1e293b" : "transparent", color: listType === "featured" ? "#f8fafc" : "#4b5563", border: "none" }}
                      onClick={() => { setListType("featured"); send({ type: "sync_featured" }); }}
                    >FEATURED</button>
                  </div>

                  <div style={{ width: 1, height: 12, background: "#1f2937" }} />

                  <div style={{ display: "flex", gap: 4 }}>
                    <button 
                      className={"btn-ghost" + (viewMode === "table" ? " active" : "")} 
                      style={{ fontSize: 10, padding: "2px 8px", background: viewMode === "table" ? "rgba(59, 130, 246, 0.1)" : "transparent", color: viewMode === "table" ? "#60a5fa" : "#4b5563" }}
                      onClick={() => setViewMode("table")}
                    >TABLE</button>
                    <button 
                      className={"btn-ghost" + (viewMode === "cards" ? " active" : "")} 
                      style={{ fontSize: 10, padding: "2px 8px", background: viewMode === "cards" ? "rgba(59, 130, 246, 0.1)" : "transparent", color: viewMode === "cards" ? "#60a5fa" : "#4b5563" }}
                      onClick={() => setViewMode("cards")}
                    >CARDS</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="tab-content" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {activeTab === "markets" && (
              <>
                <div className="search-box"><input className="inp" placeholder="Search markets…" value={searchQ} onChange={e => setSearchQ(e.target.value)} /></div>
                <MarketList 
                filteredMarkets={sortedMarkets} 
                getPrice={getPrice} 
                portfolio={portfolio} 
                tradeMode={tradeMode} 
                selectedMarketId={selectedMarketId} 
                setSelectedMarketId={setSelectedMarketId} 
                openTrade={openTrade} 
                CONN_STATES={CONN_STATES} 
                connState={connState}
                sortConfig={sortConfig}
                setSortConfig={setSortConfig}
                viewMode={viewMode}
              />
              </>
            )}
            {activeTab === "scanner" && (
              <ScannerDashboard 
                alerts={alerts} 
                onRescan={() => send({ type: "run_manual_scan" })} 
                stats={scannerStats}
                markets={markets}
                onMarketClick={onMarketClick}
                openTrade={openTrade}
              />
            )}
            {activeTab === "copy" && (
              <CopyTradingHub session_id={SESSION_ID} onMarketClick={onMarketClick} markets={markets} />
            )}
            {activeTab === "news" && (
              <NewsFeed 
                news={(() => {
                  if (!selectedMarketId) return news;
                  return news.filter(n => 
                    n.market_id && n.market_id.toString().toLowerCase().includes(selectedMarketId.toLowerCase())
                  );
                })()} 
                onMarketClick={onMarketClick} 
                title={selectedMarketId ? markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase())?.question : null}
              />
            )}
            {activeTab === "depth" && (
              selectedMarketId ? <OrderBookView book={orderBooks[getTokenId(markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase()), 0)]} onPriceClick={(p) => openTrade(markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase()), "buy", 0, p)} /> : <div className="empty-state">Select a market.</div>
            )}
            {activeTab === "history" && <TradeHistoryView history={tradeHistory} loading={isHistoryLoading} />}
            {activeTab === "detail" && (
              <MarketDetailView 
                market={markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase())} 
                isMarketLoading={selectedMarketId && !markets.find(m => m.id?.toLowerCase() === selectedMarketId?.toLowerCase())}
                intelligenceReport={intelligenceReport}
                isIntelligenceLoading={isIntelligenceLoading}
                openTrade={openTrade}
                getPrice={getPrice}
                onRefresh={refreshIntelligence}
              />
            )}
          </div>
        </div>

        <div style={{ 
          width: showPortfolio ? 400 : 0, 
          height: "100%",
          overflow: "hidden", 
          transition: "width 0.2s ease",
          borderLeft: showPortfolio ? "1px solid #1f2937" : "none",
          display: "flex",
          flexDirection: "column"
        }}>
          <div style={{ width: 400, minWidth: 400, height: "100%", display: "flex", flexDirection: "column" }}>
            <PortfolioView 
              portfolio={portfolio} prices={prices} markets={markets} setTradeModal={setTradeModal} 
              setTradeSide={setTradeSide} setSelectedOutcome={setSelectedOutcome} setTradeShares={setTradeShares} positionPnl={stats.pnl}
            />
          </div>
        </div>
      </div>

      {/* Global Bottom Log Panel */}
      <div className={`bottom-log-panel ${isLogsVisible ? 'visible' : ''}`} style={{ 
        height: isLogsVisible ? 200 : 0, 
        borderTop: isLogsVisible ? "1px solid #1f2937" : "none",
        transition: "height 0.2s ease",
        background: "#0a0c0f",
        overflow: "hidden",
        position: "relative",
        zIndex: 10
      }}>
        {isLogsVisible && (
          <button 
            onClick={() => setIsLogsVisible(false)}
            style={{
              position: "absolute",
              top: 8,
              right: 12,
              background: "rgba(31, 41, 55, 0.5)",
              color: "#94a3b8",
              border: "1px solid #374151",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "12px",
              cursor: "pointer",
              zIndex: 20
            }}
            title="Minimize Logs"
          >
            —
          </button>
        )}
        <LogViewer logs={wsLog} />
      </div>

      <TradeModal 
        tradeModal={tradeModal} setTradeModal={setTradeModal} tradeSide={tradeSide} selectedOutcome={selectedOutcome} 
        setSelectedOutcome={setSelectedOutcome} tradeShares={tradeShares} setTradeShares={setTradeShares} 
        tradePrice={tradePrice} setTradePrice={setTradePrice} getPrice={getPrice} submitTrade={submitTrade} portfolio={portfolio}
      />

      <NotificationCenter 
        notifications={notifications} 
        onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} 
        onMarketClick={onMarketClick}
      />

      {toast && <div className="toast" style={{ background: toast.ok ? "#064e3b" : "#450a0a" }}>{toast.ok ? "✓" : "✗"} {toast.msg}</div>}
    </div>
  );
}

function NotificationCenter({ notifications, onDismiss, onMarketClick }) {
  if (!notifications || notifications.length === 0) return null;
  return (
    <div style={{
      position: "fixed",
      bottom: 220,
      right: 20,
      zIndex: 100,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      width: 320,
      pointerEvents: "none"
    }}>
      {notifications.map(n => (
        <div key={n.id} 
          onClick={() => { onMarketClick && onMarketClick(n.market_id); onDismiss(n.id); }}
          style={{
            background: "#0d1117",
            border: "1px solid #1f2937",
            borderLeft: `4px solid ${n.severity === 'HIGH' ? '#ef4444' : '#f59e0b'}`,
            padding: "12px 16px",
            borderRadius: 4,
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
            pointerEvents: "auto",
            animation: "slideIn 0.3s ease-out",
            position: "relative",
            cursor: "pointer"
          }}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "transparent",
              border: "none",
              color: "#4b5563",
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px"
            }}
          >×</button>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: n.severity === 'HIGH' ? '#ef4444' : '#f59e0b' }}>
              ALPHA ALERT: {n.alert_type}
            </span>
            <span style={{ fontSize: 9, color: "#4b5563" }}>JUST NOW</span>
          </div>
          <div style={{ fontSize: 12, color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}>
            {n.market_question}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            {n.message}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
