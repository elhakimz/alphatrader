import asyncio
import time
from datetime import datetime
from typing import List, Dict, Any

from .config import settings
from .models import Market, Signal, Position, ExecutionResult
from .db import PmbotDB
from .bus import EventBus
from .scanner import MarketScanner
from .consensus import GroqConsensus
from .whale_tracker import WhaleTracker
from .orchestrator import ExecutionOrchestrator

class PmbotEngine:
    def __init__(self, main_state=None):
        self.db = PmbotDB()
        self.bus = EventBus()
        self.main_state = main_state # Reference to AlphaTrader state
        
        self.scanner = MarketScanner(self.db, self.bus)
        self.consensus = GroqConsensus(self.bus)
        self.whale_tracker = WhaleTracker(self.db, self.bus)
        self.orchestrator = ExecutionOrchestrator(self.db, self.bus)
        
        self.is_running = False
        self._setup_subscriptions()

    def _setup_subscriptions(self):
        self.bus.subscribe("SIGNAL", self.orchestrator.on_signal)
        self.bus.subscribe("EXECUTION_PLAN_READY", self._handle_execution_plan)
        self.bus.subscribe("LOG", self._on_log_event)

    async def _on_log_event(self, data):
        level = data.get("level", "INFO")
        message = data.get("message", "")
        await self.broadcast_log(level, message)

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        await self.broadcast_log("INFO", "PMBOT Engine started")
        
        # Start background tasks
        asyncio.create_task(self.whale_tracker.run(interval=60))
        asyncio.create_task(self.scanner_loop())

    async def broadcast_log(self, level: str, message: str):
        """Sends a log entry to the main LogViewer."""
        if self.main_state and hasattr(self.main_state, 'broadcast'):
            await self.main_state.broadcast({
                "type": "server_log",
                "level": level,
                "message": f"[PMBOT] {message}",
                "ts": datetime.now().isoformat()
            })

    async def broadcast_state(self, change_type: str, data: Any = None):
        """Triggers a UI refresh for PMBot components."""
        if self.main_state and hasattr(self.main_state, 'broadcast'):
            await self.main_state.broadcast({
                "type": "pmbot_state_update",
                "change": change_type,
                "data": data
            })

    async def scanner_loop(self):
        while self.is_running:
            try:
                await self.run_scan_cycle()
            except Exception as e:
                await self.broadcast_log("ERROR", f"Scanner cycle error: {e}")
            await asyncio.sleep(settings.scan_interval_seconds)

    async def run_scan_cycle(self):
        if not self.main_state or not self.main_state.active_markets:
            return

        # 1. Fetch and Filter
        raw_markets = self.main_state.active_markets
        sid = getattr(self.main_state, "active_session_id", "demo")
        bankroll = self.main_state.calculate_equity(sid) or 10000.0
        
        await self.broadcast_log("INFO", f"Scan cycle start (Bankroll: ${bankroll:,.2f})")
        
        markets = []
        for m in raw_markets:
            pm_m = self._map_market(m)
            if self.scanner.hard_filter(pm_m):
                markets.append(pm_m)
        
        # 2. Feature Extraction & Scoring
        signals_emitted = 0
        cycle_distribution = {"ENTER": 0, "QUEUE": 0, "KEEP": 0, "KILL": 0, "SKIP": 0}
        for m in markets:
            features = self.scanner.extract_features(m, self.whale_tracker)
            score, bet_size = self.scanner.score_and_size(m, features, bankroll)
            label = await self.scanner.label_market(score, features, m)
            
            cycle_distribution[label] = cycle_distribution.get(label, 0) + 1
            signal = Signal(market=m, features=features, score=score, bet_usd=bet_size, label=label)
            self.db.insert_signal(signal)
            
            if label == "ENTER" or label == "QUEUE":
                await self.bus.emit("SIGNAL", signal)
                signals_emitted += 1
        
        self.scanner.decay_penalties()
        
        # 3. Broadcast refreshed state for UI
        stats = self.get_stats(sid)
        stats["cycle_distribution"] = cycle_distribution
        await self.broadcast_state("scan_complete", stats)

    def get_stats(self, session_id: str) -> Dict[str, Any]:
        """Aggregates synced stats from main_state and pmbot_db."""
        equity = self.main_state.calculate_equity(session_id)
        p = self.main_state.portfolios.get(session_id, {})
        
        # PMBot specific stats from its DB
        daily_pnl = self.db.get_daily_pnl()
        open_pos = self.db.get_open_positions()
        total_stats = self.db.get_total_stats()

        # Last scan distribution
        with self.db._get_conn() as conn:
            last_ts_row = conn.execute("SELECT created_at FROM pmbot_signals ORDER BY created_at DESC LIMIT 1").fetchone()
            last_dist = {"ENTER": 0, "QUEUE": 0, "KEEP": 0, "KILL": 0, "SKIP": 0}
            if last_ts_row:
                last_ts = last_ts_row['created_at']
                # Group signals within 2 seconds of the last one to define a "cycle"
                dist_rows = conn.execute(
                    "SELECT label, COUNT(*) as count FROM pmbot_signals WHERE created_at >= datetime(?, '-2 seconds') GROUP BY label",
                    (last_ts,)
                ).fetchall()
                for r in dist_rows:
                    last_dist[r['label']] = r['count']
        
        # Reconstruct equity curve from closed trades
        closed_trades = self.db.get_closed_trades(limit=100)
        # Starting with a baseline, then adding each trade's pnl
        curve = [10000.0] # Starting bankroll
        current = 10000.0
        for trade in closed_trades:
            pnl = trade.get("pnl_usd") or 0.0
            current += pnl
            curve.append(round(current, 2))
            
        pnl_history = self.db.get_pnl_history(days=10)
            
        # Calculate Risk Metrics
        peak_equity = max(curve) if curve else 10000.0
        drawdown = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0.0
        
        total_exposure_usd = sum(p["size_usd"] for p in open_pos)
        exposure_pct = total_exposure_usd / equity if equity > 0 else 0.0
        
        # Derive Exit Triggers from open positions
        # In a real scenario, this would check against current prices/stop-losses
        exit_triggers = []
        for p in open_pos:
            # Simple heuristic for demonstration: targeting 20% gain or -10% stop
            # Actual prices would be fetched from self.main_state.market_prices
            exit_triggers.append({
                "title": p.get("title", "Unknown"),
                "type": "TARGET" if (p.get("pnl_pct") or 0) > 0 else "STALE",
                "message": f"{p['side']} {p['size_usd']}$ // exit thr reached"
            })

        # Enrich titles if missing (for legacy rows)
        if self.main_state and self.main_state.active_markets:
            title_map = {m['id']: m['question'] for m in self.main_state.active_markets}
            for pos in open_pos:
                if not pos.get("title"):
                    pos["title"] = title_map.get(pos["market_id"], "Unknown Market")
        
        return {
            "bankroll": equity,
            "trade_count": total_stats["total_trades"],
            "win_rate": total_stats["win_rate"],
            "open_positions": open_pos,
            "daily_pnl": daily_pnl,
            "equity_curve": curve,
            "daily_pnl_history": pnl_history,
            "drawdown": drawdown,
            "exposure_pct": exposure_pct,
            "exit_triggers": exit_triggers,
            "cycle_distribution": last_dist,
            "limits": {
                "max_drawdown": 0.20, # Hardcoded for now or from settings
                "kelly_cap": settings.kelly_cap,
                "max_portfolio_pct": settings.max_portfolio_pct,
                "max_daily_loss": settings.max_daily_loss
            }
        }

    def _map_market(self, m: Dict[str, Any]) -> Market:
        # Extract prices from main_state.market_prices if available
        tokens = m.get('tokens', [])
        tid_yes = tokens[0] if len(tokens) > 0 else None
        tid_no = tokens[1] if len(tokens) > 1 else None
        
        yes_price = 0.5
        no_price = 0.5
        if self.main_state and tid_yes in self.main_state.market_prices:
            yes_price = self.main_state.market_prices[tid_yes].get('price', 0.5)
        if self.main_state and tid_no in self.main_state.market_prices:
            no_price = self.main_state.market_prices[tid_no].get('price', 0.5)
            
        # Volume and Depth
        vol = float(m.get('volume24hr') or m.get('volume') or 1000.0)
        
        # Time to Resolution (TTR)
        ttr = 24.0
        if m.get('end_date'):
            try:
                # Use timezone-aware UTC now for subtraction
                from datetime import timezone
                end_dt = datetime.fromisoformat(m['end_date'].replace('Z', '+00:00'))
                ttr = (end_dt - datetime.now(timezone.utc)).total_seconds() / 3600.0
            except: pass
            
        # Fair Value from AI Predictions
        fair_val = 0.5
        if self.main_state and hasattr(self.main_state, 'market_predictions'):
            pred = self.main_state.market_predictions.get(str(m.get('id')), {})
            fair_val = float(pred.get('fair_prob', 0.5))

        return Market(
            id=str(m.get('id', '')),
            title=m.get('question', 'Unknown Market'),
            YES_price=float(yes_price),
            NO_price=float(no_price),
            fair_value=fair_val, 
            best_ask=float(yes_price) + 0.01,
            best_bid=float(yes_price) - 0.01,
            depth_USD=vol * 0.1, # Conservative depth estimate as 10% of 24h vol
            ttr_hours=max(0.1, ttr),
            volume_1h=vol / 24.0,
            volume_24h=vol,
            category=m.get('category', 'unknown')
        )

    async def _handle_execution_plan(self, signal: Signal):
        """Runs consensus and dispatches to execution bot."""
        await self.broadcast_log("INFO", f"Signal ENTER for {signal.market.title[:40]}... Running consensus")
        
        # 1. Groq Consensus
        reached, reasons = await self.consensus.get_consensus(signal.market, signal.features)
        
        # Log votes
        for i, reason in enumerate(reasons):
            self.db.insert_vote(signal.market.id, i+1, "ENTER" if reached else "SKIP", reason, 0)
            
        if reached:
            await self.broadcast_log("SUCCESS", f"Consensus REACHED for {signal.market.title[:40]}")
            await self._simulate_fill(signal)
        else:
            # Aggregate reasons for failure log
            fail_reasons = "; ".join([r for r in reasons if "ENTER" not in r])
            await self.broadcast_log("WARNING", f"Consensus FAILED for {signal.market.title[:40]} ({len(reasons)-len([r for r in reasons if 'ENTER' not in r])}/3) BECAUSE: {fail_reasons}")

    async def _simulate_fill(self, signal: Signal):
        # 1. Internal PMBot Position tracking
        result = ExecutionResult(
            market_id=signal.market.id,
            title=signal.market.title,
            side=signal.features['side'],
            status="filled",
            filled_usd=signal.bet_usd,
            fill_rate=1.0,
            avg_price=signal.market.YES_price if signal.features['side'] == "YES" else signal.market.NO_price,
            slippage_bps=0,
            latency_ms=100
        )
        await self.orchestrator.on_order_filled(result)
        
        # 2. Sync with Main Portfolio (Paper)
        if self.main_state and hasattr(self.main_state, 'execute_trade'):
            sid = getattr(self.main_state, 'active_session_id', 'demo')
            outcome = signal.features.get('side', 'YES')
            price = signal.market.YES_price if outcome == "YES" else signal.market.NO_price
            shares = signal.bet_usd / price if price > 0 else 0
            
            trade_msg = {
                "type": "trade",
                "market_id": signal.market.id,
                "side": "buy",
                "shares": shares,
                "price": price,
                "outcome": outcome,
                "question": signal.market.title
            }
            
            # Execute trade in main paper engine
            res = self.main_state.execute_trade(sid, trade_msg)
            
            if res.get("success"):
                await self.broadcast_log("SUCCESS", f"PMBOT Auto-Trade: {outcome} {shares:.1f} shares @ {price:.2f}")
                # Save portfolios
                if hasattr(self.main_state, 'save_portfolios'):
                     await self.main_state.save_portfolios()
            else:
                await self.broadcast_log("ERROR", f"PMBOT Sync Trade Failed: {res.get('error')}")

        # 3. Final broadcast for UI refresh
        if self.main_state and hasattr(self.main_state, 'broadcast'):
            await self.main_state.broadcast({
                "type": "pmbot_trade_executed",
                "market_id": signal.market.id,
                "side": signal.features['side'],
                "amount": signal.bet_usd
            })
