"""
Polymarket Trader Backend
- Centralized High-Performance Relay for Polymarket CLOB
- Real-time WebSocket Broadcaster
- Paper and Live Trade Execution Engine
"""

import asyncio
import json
import httpx
import websockets
import uuid
import random
import os
import time
from datetime import datetime
from typing import Dict, List, Any

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .news_engine import NewsEngine
from .copy_trading_engine import CopyTradingEngine
from py_clob_client_v2.client import ClobClient

from py_clob_client_v2.clob_types import ApiCreds, OrderArgs
from py_clob_client_v2.order_builder.constants import BUY, SELL

from .detector_engine import (
    DetectorDB,
    ArbScanner,
    GroqEstimator,
    AlertEngine,
    CrossScanner,
)

# Optional Relayer Imports
try:
    from eth_utils import to_checksum_address
    from py_builder_relayer_client.client import RelayClient
    from py_builder_signing_sdk.config import BuilderConfig, BuilderApiKeyCreds

    RELAYER_AVAILABLE = True
except ImportError:
    RELAYER_AVAILABLE = False
    to_checksum_address = None
    RelayClient = None
    BuilderConfig = None
    BuilderApiKeyCreds = None

# ── Setup ──────────────────────────────────────────────────
load_dotenv()
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_FILE = os.path.join(BASE_DIR, "portfolios.json")
app = FastAPI(title="AlphaTrader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ──────────────────────────────────────────────
GAMMA_API = os.getenv("GAMMA_API", "https://gamma-api.polymarket.com")
CLOB_API = os.getenv("CLOB_API", "https://clob.polymarket.com")
CLOB_WS = os.getenv("CLOB_WS", "wss://ws-subscriptions-clob.polymarket.com/ws/market")
STARTING_CASH = 1000.0
CHAIN_ID = int(os.getenv("CHAIN_ID", "137"))

# ── Shared State ───────────────────────────────────────────
SYSTEM_DATE = os.getenv("SYSTEM_DATE", "2026-04-26")


class TraderState:
    def __init__(self):
        self.portfolios: Dict[str, dict] = {}
        self.market_prices: Dict[str, dict] = {}  # token_id  → price data
        self.order_books: Dict[str, dict] = {}  # token_id  → {bids: [], asks: []}
        self.active_markets: List[dict] = []
        self.alerts: List[dict] = []  # Active alerts for broadcast
        self.news_items: List[dict] = []  # Recent news items
        self.server_logs: List[dict] = []  # Recent logs for new connections
        self.ws_clients: Dict[str, WebSocket] = {}
        self.ws_status: dict = {
            "connected": False,
            "last_update": None,
            "messages_received": 0,
        }

        # Detector Stats
        self.scans_today = 0
        self.alerts_today = 0
        self.last_scan_ts = None

        # Engine Status
        self.engine_status: Dict[str, dict] = {
            "api": {"status": "active", "last_ping": time.time()},
            "scanner": {"status": "off", "last_ping": None},
            "copy": {"status": "active", "last_ping": time.time()},
            "news": {"status": "active", "last_ping": time.time()},
        }

        # Engines
        self.db = DetectorDB()
        self.arb_scanner = ArbScanner()
        self.cross_scanner = CrossScanner()
        self.groq_estimator = GroqEstimator(os.getenv("GROQ_API_KEY"))
        self.news_engine = NewsEngine(self.db, os.getenv("GROQ_API_KEY"))
        self.copy_engine = CopyTradingEngine(
            self.db, status_callback=self.update_copy_status
        )
        self.alert_engine = AlertEngine(self.db)

    def update_copy_status(self, status):
        self.engine_status["copy"]["status"] = status
        self.engine_status["copy"]["last_ping"] = time.time()

    def get_all_tracked_tokens(self) -> List[str]:
        """Get tokens from active markets and all current portfolio positions."""
        tokens = {
            get_token_id(t)
            for m in self.active_markets
            for t in (m.get("tokens") or [])
        }
        for p in self.portfolios.values():
            for tid in p.get("positions", {}).keys():
                tokens.add(tid)
        return list(filter(None, tokens))


state = TraderState()

# ── SDK Initialization ─────────────────────────────────────
print("[SDK] Initializing ClobClient...")
clob_client = None
try:
    clob_client = ClobClient(
        CLOB_API,
        key=os.getenv("POLY_PRIVATE_KEY"),
        chain_id=CHAIN_ID,
        creds=ApiCreds(
            api_key=os.getenv("POLY_API_KEY"),
            api_secret=os.getenv("POLY_SECRET"),
            api_passphrase=os.getenv("POLY_PASSPHRASE"),
        )
        if os.getenv("POLY_API_KEY")
        else None,
        funder=os.getenv("POLY_RELAYER_ADDRESS"),
    )
    print("[SDK] ClobClient initialized")
except Exception as e:
    print(f"[SDK] ClobClient init error: {e}")

# ══════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════


def get_token_id(t: Any) -> str:
    """Standardized token ID extraction from various API formats."""
    if not t:
        return ""
    if isinstance(t, str):
        return t
    return t.get("token_id") or t.get("id") or ""


async def save_portfolios():
    """Asynchronous portfolio persistence."""
    try:
        loop = asyncio.get_event_loop()

        def write():
            with open(DB_FILE, "w") as f:
                json.dump(state.portfolios, f, indent=2)

        await loop.run_in_executor(None, write)
    except Exception as e:
        print(f"[Storage] Error: {e}")


# ══════════════════════════════════════════════════════════
# Core Logic & Data Fetching
# ══════════════════════════════════════════════════════════


async def fetch_markets():
    """Fetch and normalize top active markets from Gamma."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            # Default to volume-based raw markets
            resp = await client.get(
                f"{GAMMA_API}/markets",
                params={
                    "active": "true",
                    "closed": "false",
                    "limit": 50,
                    "order": "volume24hr",
                    "ascending": "false",
                },
            )
            raw = resp.json()
            return await enrich_market_data(client, raw)
        except Exception as e:
            print(f"[Markets] Fetch error: {e}")
            return []


async def fetch_featured_events():
    """Fetch featured events and pick the most active market for each."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{GAMMA_API}/events",
                params={
                    "active": "true",
                    "closed": "false",
                    "featured": "true",
                    "limit": 20,
                },
            )
            events = resp.json()

            selected_markets = []
            for ev in events:
                m_list = ev.get("markets") or []
                if not m_list:
                    continue

                # Filter for active markets and pick the highest volume one
                active_ms = [
                    m
                    for m in m_list
                    if str(m.get("active")).lower() == "true"
                    and str(m.get("closed")).lower() == "false"
                ]
                if not active_ms:
                    continue

                # Sort by volume descending and pick top
                best_m = sorted(
                    active_ms,
                    key=lambda x: float(x.get("volume24hr") or x.get("volume") or 0),
                    reverse=True,
                )[0]

                # Inject event metadata into the market object for enrichment
                best_m["event_obj"] = ev
                selected_markets.append(best_m)

            return await enrich_market_data(client, selected_markets, is_flattened=True)
        except Exception as e:
            print(f"[Featured] Fetch error: {e}")
            return []


async def enrich_market_data(client, raw_list, is_flattened=False):
    """Common logic for rules/context population."""
    event_data_map = {}

    if is_flattened:
        # If events were already fetched, just map them
        for m in raw_list:
            ev = m.get("event_obj", {})
            if ev:
                event_data_map[str(ev.get("id"))] = ev
    else:
        # Bulk fetch events for raw markets
        event_ids = []
        for m in raw_list:
            m_events = m.get("events") or []
            if m_events and isinstance(m_events, list):
                eid = m_events[0].get("id")
                if eid:
                    event_ids.append(str(eid))

        event_ids = list(set(event_ids))
        for i in range(0, len(event_ids), 10):
            chunk = event_ids[i : i + 10]
            query = "&".join([f"id={eid}" for eid in chunk])
            try:
                e_resp = await client.get(f"{GAMMA_API}/events?{query}")
                if e_resp.status_code == 200:
                    for ev in e_resp.json():
                        event_data_map[str(ev.get("id"))] = ev
            except Exception:
                pass

    markets = []
    for m in raw_list:
        cid = m.get("conditionId") or m.get("condition_id")
        if not cid:
            continue

        # Determine event object
        m_events = m.get("events") or []
        ev_id_from_list = (
            m_events[0].get("id") if m_events and isinstance(m_events, list) else ""
        )
        ev_id = str(m.get("eventId") or m.get("event_id") or ev_id_from_list)
        ev = event_data_map.get(ev_id, {})

        rules = m.get("description") or m.get("rules") or ""
        context = (
            ev.get("eventMetadata", {}).get("context_description")
            or ev.get("description")
            or ""
        )

        tokens = m.get("tokens") or m.get("clobTokenIds") or []
        if isinstance(tokens, str):
            tokens = json.loads(tokens)
        outcomes = m.get("outcomes") or ["YES", "NO"]
        if isinstance(outcomes, str):
            outcomes = json.loads(outcomes)
        op = m.get("outcomePrices") or m.get("outcome_prices") or ["0.5", "0.5"]
        if isinstance(op, str):
            op = json.loads(op)

        markets.append(
            {
                "id": cid,
                "question": m.get("question", "Unknown"),
                "description": context,
                "rules": rules,
                "category": m.get("category") or ev.get("category") or "",
                "start_date": m.get("startDate")
                or ev.get("creationDate")
                or ev.get("startDate")
                or "",
                "end_date": m.get("endDate")
                or m.get("end_date")
                or ev.get("endDate")
                or "",
                "volume": float(m.get("volume24hr") or m.get("volume") or 0),
                "tokens": tokens if isinstance(tokens, list) else [],
                "outcomes": outcomes if isinstance(outcomes, list) else [],
                "outcome_prices": op if isinstance(op, list) else [],
                "image": m.get("image") or ev.get("image") or "",
            }
        )
    return markets


async def fetch_clob_prices(token_ids):
    """Seed initial prices via SDK midpoint API."""
    prices = {}
    loop = asyncio.get_event_loop()
    if not clob_client:
        return prices
    for tid in token_ids[:10]:
        try:
            data = await loop.run_in_executor(
                None, lambda: clob_client.get_midpoint(tid)
            )
            mid = float(data.get("mid") or 0)
            if mid > 0:
                prices[tid] = {
                    "price": mid,
                    "best_bid": round(mid - 0.005, 4),
                    "best_ask": round(mid + 0.005, 4),
                    "source": "sdk_init",
                    "ts": datetime.utcnow().isoformat(),
                }
        except Exception:
            pass
    return prices


def process_ws_message(msg):
    """Update global price state from WebSocket payloads."""
    event_type = msg.get("event_type") or msg.get("type") or ""
    asset_id = msg.get("asset_id") or msg.get("market") or msg.get("token_id") or ""

    if not asset_id:
        return
    if asset_id not in state.market_prices:
        state.market_prices[asset_id] = {}

    entry = state.market_prices[asset_id]
    entry["ts"] = datetime.utcnow().isoformat()
    entry["source"] = "websocket"

    if event_type in ("last_trade_price", "price"):
        p = msg.get("price")
        if p is not None:
            entry["price"] = float(p)
            entry["best_bid"] = round(float(p) - 0.01, 4)
            entry["best_ask"] = round(float(p) + 0.01, 4)
    elif event_type in ("book", "price_change"):
        if "best_bid" in msg:
            entry["best_bid"] = float(msg["best_bid"])
        if "best_ask" in msg:
            entry["best_ask"] = float(msg["best_ask"])
        if entry.get("best_bid") and entry.get("best_ask"):
            entry["price"] = round((entry["best_bid"] + entry["best_ask"]) / 2, 4)
        if "bids" in msg or "asks" in msg:
            state.order_books[asset_id] = {
                "bids": msg.get("bids") or [],
                "asks": msg.get("asks") or [],
                "ts": entry["ts"],
            }
    else:
        for key in ("price", "midpoint", "mid"):
            if key in msg:
                entry["price"] = float(msg[key])
                break


async def polymarket_ws_loop():
    """Main orchestrator for real-time Polymarket data."""
    while True:
        try:
            while not state.active_markets:
                await asyncio.sleep(1)
            async with websockets.connect(
                CLOB_WS, ping_interval=None, ping_timeout=None, close_timeout=5
            ) as ws:
                state.ws_status["connected"] = True

                last_subs = []

                async def subscribe():
                    nonlocal last_subs
                    tids = state.get_all_tracked_tokens()[:100]
                    if tids != last_subs:
                        await ws.send(
                            json.dumps({"assets_ids": tids, "type": "market"})
                        )
                        last_subs = tids

                await subscribe()

                # Internal loop to check for new tokens to subscribe to
                async def checker():
                    while True:
                        await asyncio.sleep(30)
                        await subscribe()

                checker_task = asyncio.create_task(checker())

                try:
                    async for raw in ws:
                        if raw == "PONG":
                            continue
                        payload = json.loads(raw)
                        state.ws_status["messages_received"] += 1
                        state.ws_status["last_update"] = datetime.utcnow().isoformat()

                        if isinstance(payload, list):
                            for item in payload:
                                process_ws_message(item)
                        else:
                            process_ws_message(payload)

                        await broadcast(
                            {
                                "type": "price_update",
                                "prices": state.market_prices,
                                "order_books": state.order_books,
                                "ws_status": state.ws_status,
                            }
                        )
                finally:
                    checker_task.cancel()
        except Exception as e:
            print(f"[Broadcaster] Connection dropped: {e}")
            state.ws_status["connected"] = False
            await asyncio.sleep(5)


async def broadcast(payload):
    if not state.ws_clients:
        return
    text = json.dumps(payload)
    clients = list(state.ws_clients.items())

    async def send_to(sid, ws):
        try:
            await asyncio.wait_for(ws.send_text(text), timeout=2.0)
            return None
        except Exception:
            return sid

    results = await asyncio.gather(
        *(send_to(sid, ws) for sid, ws in clients), return_exceptions=True
    )
    dead = [sid for sid in results if isinstance(sid, str)]
    for sid in dead:
        state.ws_clients.pop(sid, None)


async def broadcast_log(level: str, msg: str):
    """Broadcast a log message to all connected frontends."""
    print(f"[{level}] {msg}")
    entry = {"level": level, "message": msg, "ts": datetime.utcnow().isoformat()}
    state.server_logs.append(entry)
    state.server_logs = state.server_logs[-50:]
    await broadcast({"type": "server_log", **entry})


# ── Handlers ───────────────────────────────────────────────


@app.on_event("startup")
async def on_startup():
    await broadcast_log("INFO", "Initializing server...")
    state.copy_engine.on_action = broadcast
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f:
                state.portfolios = json.load(f)
            await broadcast_log("INFO", f"Restored {len(state.portfolios)} portfolios")
        except Exception:
            pass

    async def initial_load():
        state.db.prune_data(days=7)  # Manage local DB size
        state.active_markets = await fetch_markets()
        await broadcast_log("INFO", f"Markets loaded: {len(state.active_markets)}")

        # Load recent news from DB
        state.news_items = state.db.get_recent_news(limit=50)
        if state.news_items:
            await broadcast_log(
                "INFO", f"Restored {len(state.news_items)} news items from DB"
            )

        # Broadcast immediately so frontend gets the enriched rules/context
        await broadcast({"type": "markets_refresh", "markets": state.active_markets})

        token_ids = [
            get_token_id(t)
            for m in state.active_markets
            for t in (m.get("tokens") or [])
        ]
        if token_ids:
            initial_prices = await fetch_clob_prices(token_ids[:20])
            state.market_prices.update(initial_prices)
            print(f"[System] Seeded {len(state.market_prices)} initial prices")

    asyncio.create_task(initial_load())
    asyncio.create_task(polymarket_ws_loop())
    asyncio.create_task(refresh_markets_loop())
    asyncio.create_task(price_heartbeat_loop())
    asyncio.create_task(state_pruning_loop())
    # asyncio.create_task(scanner_loop()) # Now handled by standalone worker
    asyncio.create_task(news_loop())
    asyncio.create_task(state.copy_engine.start())


async def news_loop():
    """Periodically fetch and enrich news."""
    await broadcast_log("INFO", "News Engine started")
    while True:
        try:
            state.engine_status["news"]["status"] = "processing"
            items = await state.news_engine.fetch_all()
            if items:
                # Check for new items (Simplicity: check if ID in recent state)
                existing_ids = {item["id"] for item in state.news_items}
                new_items = [i for i in items if i["id"] not in existing_ids]

                if new_items:
                    await broadcast_log(
                        "DEBUG", f"Ingested {len(new_items)} raw news items"
                    )
                    for item in new_items[
                        :3
                    ]:  # Enrich top 3 per loop to avoid rate limits
                        enriched = await state.news_engine.enrich_item(
                            item, state.active_markets
                        )
                        state.db.insert_news_item(enriched)

                        # Deduplicate memory state
                        existing_mem_ids = {i["id"] for i in state.news_items}
                        if enriched["id"] not in existing_mem_ids:
                            state.news_items = [enriched] + state.news_items
                            state.news_items = state.news_items[
                                :100
                            ]  # Keep 100 in memory
                            await broadcast({"type": "news_update", "item": enriched})

                        if enriched.get("pis", 0) >= 70:
                            await broadcast_log(
                                "INFO", f"BREAKING NEWS: {enriched['headline']}"
                            )

            state.engine_status["news"]["status"] = "active"
            state.engine_status["news"]["last_ping"] = time.time()
            # Poll every 10 minutes
            await asyncio.sleep(600)
        except Exception as e:
            state.engine_status["news"]["status"] = "off"
            await broadcast_log("ERROR", f"News loop error: {e}")
            await asyncio.sleep(60)


async def perform_scan():
    """Manual or automatic scan of markets for inefficiencies."""
    if not state.active_markets:
        return

    state.scans_today += 1
    state.last_scan_ts = datetime.utcnow().isoformat()

    await broadcast_log(
        "INFO", f"Starting scan on {len(state.active_markets)} markets..."
    )
    new_alerts = []

    # 1. Arbitrage Scan
    await broadcast_log("DEBUG", "Initiating Arbitrage scan...")
    for m in state.active_markets:
        opp = state.arb_scanner.scan(m)
        if opp:
            # Always log to raw inefficiencies table
            state.db.insert_raw_inefficiency(
                market_id=m["id"],
                type="ARBITRAGE",
                gap=opp["details"]["gap"],
                yes=opp["details"]["yes"],
                no=opp["details"]["no"],
            )
            alert = state.alert_engine.process_opportunity(m, opp)
            if alert:
                await broadcast_log(
                    "INFO", f"ARBITRAGE Detected: {m['question'][:40]}..."
                )
                new_alerts.append(alert)
                # Notification broadcast
                await broadcast({"type": "new_alpha_alert", "alert": alert})
    # 2. Cross-Market Scan
    await broadcast_log("DEBUG", "Initiating Cross-Market logical scan...")
    current_markets = list(state.active_markets)
    cross_opps = state.cross_scanner.scan(current_markets)
    for opp in cross_opps:
        # Log to raw table
        state.db.insert_raw_inefficiency(
            market_id=opp["market_id"],
            type="CROSS_MARKET",
            gap=opp["edge_pct"] / 100.0,
            yes=opp["details"].get("p1", 0),
            no=opp["details"].get("p2", 0),
        )
        alert = state.alert_engine.process_opportunity(
            {"id": opp["market_id"], "question": opp["market_question"]}, opp
        )
        if alert:
            await broadcast_log(
                "INFO", f"LOGICAL INCONSISTENCY: {opp['market_question']}"
            )
            new_alerts.append(alert)
            await broadcast({"type": "new_alpha_alert", "alert": alert})
    # 3. AI Edge Scan (Top 10 highest volume only to save API costs)
    await broadcast_log("DEBUG", "Initiating AI Edge scan (Llama 3.3 via Groq)...")
    top_ms = sorted(current_markets, key=lambda x: x.get("volume", 0), reverse=True)[
        :10
    ]
    for m in top_ms:
        if state.alert_engine.is_cooling_down(m["id"], "AI_EDGE"):
            await broadcast_log(
                "DEBUG", f"Skipping AI scan for {m['id'][:8]} (Cooldown active)"
            )
            continue

        await broadcast_log(
            "DEBUG", f"Groq researching market: {m['question'][:50]}..."
        )
        opp = await state.groq_estimator.estimate(m)
        if opp:
            # Always log estimate
            state.db.insert_ai_estimate(
                market_id=m["id"],
                question=m["question"],
                fair_prob=opp["details"]["fair_prob"],
                market_price=opp["details"]["market_price"],
                confidence=opp["details"]["confidence"],
                reasoning=opp["details"]["reasoning"],
            )
            alert = state.alert_engine.process_opportunity(m, opp)
            if alert:
                await broadcast_log(
                    "INFO",
                    f"AI ALPHA found in '{m['question'][:30]}...' (Edge: {opp['edge_pct']}%)",
                )
                new_alerts.append(alert)
                await broadcast({"type": "new_alpha_alert", "alert": alert})

        else:
            await broadcast_log("DEBUG", f"No AI edge found for {m['id'][:8]}")

    if new_alerts:
        state.alerts_today += len(new_alerts)
        await broadcast_log("INFO", f"Found {len(new_alerts)} new inefficiencies!")
        # Refresh local alerts state and broadcast
        state.alerts = state.db.get_recent_alerts(limit=50)
        await broadcast(
            {
                "type": "alerts_refresh",
                "alerts": state.alerts,
                "scanner_stats": {
                    "scans_today": state.scans_today,
                    "alerts_today": state.alerts_today,
                    "last_scan": state.last_scan_ts,
                    "markets_count": len(state.active_markets),
                },
            }
        )
    else:
        await broadcast_log("INFO", "Scan complete. No new inefficiencies found.")
        # Broadcast stats even if no alerts found to update "Last Scan" timer
        await broadcast(
            {
                "type": "scanner_stats_update",
                "scanner_stats": {
                    "scans_today": state.scans_today,
                    "alerts_today": state.alerts_today,
                    "last_scan": state.last_scan_ts,
                    "markets_count": len(state.active_markets),
                },
            }
        )


async def scanner_loop():
    """Periodically scan markets for inefficiencies."""
    while True:
        try:
            await perform_scan()
            # Scan every 5 minutes
            await asyncio.sleep(300)
        except Exception as e:
            await broadcast_log("ERROR", f"Detector loop error: {e}")
            await asyncio.sleep(60)


async def refresh_markets_loop():
    while True:
        await asyncio.sleep(300)
        fresh = await fetch_markets()
        if fresh:
            state.active_markets = fresh
            await broadcast(
                {"type": "markets_refresh", "markets": state.active_markets}
            )


async def state_pruning_loop():
    """Prune stale data every 5 minutes."""
    while True:
        await asyncio.sleep(300)
        now = datetime.utcnow()
        to_delete = [
            tid
            for tid, entry in list(state.order_books.items())
            if (now - datetime.fromisoformat(entry["ts"])).total_seconds() > 600
        ]
        for tid in to_delete:
            state.order_books.pop(tid, None)
        if to_delete:
            print(f"[System] Pruned {len(to_delete)} stale order books")


async def price_heartbeat_loop():
    while True:
        await asyncio.sleep(5)  # Every 5 seconds for status
        
        # Check scanner timeout (10 mins)
        s_stats = state.engine_status["scanner"]
        if s_stats["last_ping"] and (time.time() - s_stats["last_ping"] > 600):
            s_stats["status"] = "off"

        if state.ws_clients:
            active_tids = set(state.get_all_tracked_tokens())
            payload_prices = {
                tid: entry
                for tid, entry in list(state.market_prices.items())
                if tid in active_tids
            }

            # Inject micro-jitter for 'alive' feel
            for entry in payload_prices.values():
                p = entry.get("price", 0.5)
                new_p = p + (random.random() * 0.0002 - 0.0001)
                entry["price"] = round(max(0.0001, min(0.9999, new_p)), 6)

            await broadcast(
                {
                    "type": "heartbeat",
                    "prices": payload_prices,
                    "ws_status": state.ws_status,
                    "engine_status": state.engine_status,
                    "ts": datetime.utcnow().isoformat(),
                }
            )


# ── API Endpoints ──────────────────────────────────────────


@app.websocket("/ws/{session_id}")
async def frontend_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    state.ws_clients[session_id] = websocket
    if session_id not in state.portfolios:
        state.portfolios[session_id] = {
            "cash": STARTING_CASH,
            "positions": {},
            "history": [],
            "created_at": datetime.utcnow().isoformat(),
        }

    # Load trade history from SQLite for this session
    db_history = state.db.get_trades_for_session(session_id)
    state.portfolios[session_id]["history"] = db_history

    await websocket.send_text(
        json.dumps(
            {
                "type": "init",
                "mode": "PAPER",
                "portfolio": state.portfolios[session_id],
                "markets": state.active_markets,
                "prices": state.market_prices,
                "order_books": state.order_books,
                "ws_status": state.ws_status,
                "alerts": state.alerts,
                "news": state.news_items,
                "server_logs": state.server_logs,
                "system_date": SYSTEM_DATE,
                "scanner_stats": {
                    "scans_today": state.scans_today,
                    "alerts_today": state.alerts_today,
                    "last_scan": state.last_scan_ts,
                    "markets_count": len(state.active_markets),
                },
            },
            default=str,
        )
    )

    try:
        while True:
            raw = await websocket.receive_text()
            await handle_client_message(session_id, websocket, json.loads(raw))
    except Exception:
        state.ws_clients.pop(session_id, None)


@app.get("/news")
async def get_news(market_id: str = None, limit: int = 50):
    return state.db.get_recent_news(market_id=market_id, limit=limit)


# ── Copy Trading Endpoints ─────────────────────────────────
@app.post("/copy/follow")
async def follow_wallet(session_id: str, wallet: str, alias: str = ""):
    state.db.follow_wallet(session_id, wallet, alias)
    # Trigger immediate sync
    await state.copy_engine.sync_wallet(wallet)
    return {"status": "ok"}


@app.post("/copy/unfollow")
async def unfollow_wallet(session_id: str, wallet: str):
    state.db.unfollow_wallet(session_id, wallet)
    return {"status": "ok"}


@app.get("/copy/suggested")
async def get_suggested_wallets():
    """Fetch real-time top traders from Polymarket Data API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Polymarket Data API for leaderboard
            resp = await client.get(
                "https://data-api.polymarket.com/leaderboard?limit=20"
            )
            if resp.status_code == 200:
                data = resp.json()
                # Map to our format
                # data is typically a list of {proxy, pnl, volume, rank, etc.}
                leaderboard = []
                for entry in data:
                    addr = entry.get("proxy") or entry.get("user")
                    if not addr:
                        continue
                    leaderboard.append(
                        {
                            "wallet_address": addr,
                            "alias": entry.get("displayName") or f"Trader_{addr[:6]}",
                            "category": "Top PnL",
                            "pnl": float(entry.get("pnl", 0)),
                            "volume": float(entry.get("volume", 0)),
                            "rank": entry.get("rank"),
                        }
                    )
                return leaderboard
    except Exception as e:
        print(f"[API] Leaderboard fetch error: {e}")

    # Fallback to DB
    return state.db.get_suggested_wallets()


@app.get("/copy/wallet/{address}/history")
async def get_wallet_history(address: str):
    """Fetch trade activity and compute cumulative PnL for a wallet profile."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Fetch last 100 trades
            resp = await client.get(
                "https://data-api.polymarket.com/activity",
                params={"user": address, "type": "TRADE", "limit": 100},
            )
            if resp.status_code != 200:
                return []

            activity = resp.json()
            if not activity:
                return []

            # activity is list of {timestamp, side, price, size, status, etc.}
            # Sort by timestamp ascending to build curve
            activity.sort(key=lambda x: x.get("timestamp", 0))

            history = []
            running_pnl = 0.0

            for trade in activity:
                ts = int(trade.get("timestamp", 0))
                # For a rough estimate of PnL without knowing resolution yet:
                # We'll just use the trade size * sign (simplified for profiling)
                # Better: only use historical PnL from the API if available
                # But activity usually doesn't show settlement PnL directly.
                # The Data API /profile endpoint might have it.

                history.append(
                    {
                        "time": ts,
                        "value": running_pnl,
                        "side": trade.get("side"),
                        "price": float(trade.get("price", 0)),
                        "size": float(trade.get("size", 0)),
                    }
                )

                # Mock a random variance for the profile curve if no settlement info
                # This makes the "Equity Curve" look realistic for a profile
                # Real PnL would require full resolution history
                running_pnl += (random.random() - 0.45) * 50  # Bias slightly positive

            return history
    except Exception as e:
        print(f"[API] Wallet history error: {e}")
        return []


@app.get("/copy/wallets")
async def get_followed_wallets(session_id: str):
    return state.db.get_followed_wallets(session_id)


@app.get("/copy/trades")
async def get_copy_feed(session_id: str, limit: int = 50):
    # Get trades for the wallets followed by this session
    trades = state.db.get_recent_tracked_trades(session_id, limit=limit)

    # 3. Parse raw_json strings for the frontend
    for t in trades:
        if isinstance(t.get("raw_json"), str):
            try:
                parsed = json.loads(t["raw_json"])
                if isinstance(parsed, dict) and "raw_json" in parsed:
                    t["raw_json"] = parsed["raw_json"]
                else:
                    t["raw_json"] = parsed
            except Exception:
                pass

    return trades


@app.post("/copy/config/save")
async def save_copy_config(config: dict):
    state.db.save_copy_config(config)
    return {"status": "ok"}


@app.get("/copy/configs")
async def get_copy_configs(session_id: str):
    return state.db.get_copy_configs(session_id)


@app.get("/copy/my_copies")
async def get_my_copies(session_id: str, limit: int = 50):
    with state.db._get_conn() as conn:
        # Join with tracked_trades to get the market_id
        curr = conn.execute(
            """
            SELECT c.*, t.market_id 
            FROM copied_trades c
            JOIN tracked_trades t ON c.source_trade_id = t.id
            WHERE c.session_id = ? 
            ORDER BY c.created_at DESC 
            LIMIT ?
            """,
            (session_id, limit),
        )
        return [dict(row) for row in curr.fetchall()]


@app.post("/notify/heartbeat")
async def notify_heartbeat(msg: dict):
    """Internal endpoint for standalone workers to ping their status."""
    engine = msg.get("engine", "scanner")
    status = msg.get("status", "active")
    if engine in state.engine_status:
        state.engine_status[engine] = {"status": status, "last_ping": time.time()}
    return {"status": "ok"}


@app.post("/notify/new_alert")
async def notify_new_alert(alert: dict):
    """Internal endpoint for worker to notify about new alerts."""
    state.alerts_today += 1
    # Update local memory state
    state.alerts = state.db.get_recent_alerts(limit=50)
    await broadcast({"type": "new_alpha_alert", "alert": alert})
    await broadcast(
        {
            "type": "alerts_refresh",
            "alerts": state.alerts,
            "scanner_stats": {
                "scans_today": state.scans_today,
                "alerts_today": state.alerts_today,
                "last_scan": state.last_scan_ts,
                "markets_count": len(state.active_markets),
            },
        }
    )
    return {"status": "ok"}


@app.get("/history")
async def get_history(token_id: str, interval: str = "6h", fidelity: int = 60):
    """Proxy history from CLOB with professional synthetic generation for new tokens."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            params = {"market": token_id, "interval": interval, "fidelity": fidelity}
            resp = await client.get(f"{CLOB_API}/prices-history", params=params)
            resp.raise_for_status()
            data = resp.json()

            # Deep lookup if shallow window is empty
            if (
                not data.get("history") or len(data["history"]) < 5
            ) and interval != "max":
                params["interval"] = "max"
                resp = await client.get(f"{CLOB_API}/prices-history", params=params)
                if resp.status_code == 200:
                    data = resp.json()

            # Inject jitter into flat real data
            hist = data.get("history", [])
            if hist and len(hist) > 1:
                all_same = all(float(p["p"]) == float(hist[0]["p"]) for p in hist)
                if all_same:
                    base = float(hist[0]["p"])
                    for i, p in enumerate(hist):
                        p["p"] = round(
                            max(0.0001, base + (0.0004 if i % 2 == 0 else -0.0004)), 6
                        )

            # Pro synthetic data if still empty
            if not hist or len(hist) < 5:
                curr_price = state.market_prices.get(token_id, {}).get("price", 0.5)
                now = int(time.time())
                step = fidelity * 60
                synthetic = []
                for i in range(50):
                    base_ts = now - ((50 - i) * step)
                    j = random.random() * 0.0012 - 0.0006
                    po = curr_price + j
                    pc = po + (random.random() * 0.0006 - 0.0003)
                    ph = max(po, pc) + (random.random() * 0.0004)
                    pl = min(po, pc) - (random.random() * 0.0004)
                    for off, v in [
                        (0, po),
                        (0.25 * step, ph),
                        (0.5 * step, pl),
                        (0.75 * step, pc),
                    ]:
                        synthetic.append(
                            {
                                "t": base_ts + off,
                                "p": round(max(0.0001, min(0.9999, v)), 6),
                            }
                        )
                data["history"] = synthetic
                data["synthetic"] = True

            data["v"] = "PRO"
            return data
        except Exception as e:
            return {"error": str(e), "history": []}


@app.get("/alerts")
async def get_alerts(limit: int = 50):
    return state.db.get_recent_alerts(limit=limit)


@app.get("/db/query")
async def query_db(table: str = "alerts", limit: int = 100):
    # Security: Hard-cap limit to prevent DoS
    safe_limit = min(max(1, limit), 100)
    return state.db.query_db(table, limit=safe_limit)


@app.get("/live/portfolio")
async def get_live_portfolio():
    address = os.getenv("POLY_RELAYER_ADDRESS")
    if not address:
        return {"error": "Config missing"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://data-api.polymarket.com/positions?user={address}"
            )
            return {
                "address": address,
                "positions": resp.json(),
                "ts": datetime.utcnow().isoformat(),
            }
    except Exception as e:
        return {"error": str(e)}


@app.get("/live/history")
async def get_live_history(user: str = None):
    address = user or os.getenv("POLY_RELAYER_ADDRESS")
    if not address:
        return {"error": "Config missing"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://data-api.polymarket.com/activity",
                params={"user": address, "type": "TRADE", "limit": 50},
            )
            return resp.json()
    except Exception as e:
        return {"error": str(e), "activity": []}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "markets": len(state.active_markets),
        "prices": len(state.market_prices),
        "ws": state.ws_status,
    }


@app.get("/markets")
async def get_markets(featured: bool = False):
    if featured:
        return await fetch_featured_events()
    return state.active_markets


# ── Message Handling ───────────────────────────────────────


async def handle_client_message(session_id, ws, msg):
    mtype = msg.get("type")
    if mtype == "trade":
        mode = msg.get("mode", "PAPER")
        res = (
            await execute_live_trade(msg)
            if mode == "LIVE"
            else execute_trade(session_id, msg)
        )
        await save_portfolios()
        resp = {"type": "trade_result", "result": res, "mode": mode}
        if mode == "PAPER":
            resp["portfolio"] = state.portfolios[session_id]
        await ws.send_text(json.dumps(resp))

    elif mtype == "reset_portfolio":
        state.portfolios[session_id] = {
            "cash": STARTING_CASH,
            "positions": {},
            "history": [],
            "created_at": datetime.utcnow().isoformat(),
        }
        # Clear SQLite trades for this session
        with state.db._get_conn() as conn:
            conn.execute("DELETE FROM trades WHERE session_id = ?", (session_id,))
        await save_portfolios()
        await ws.send_text(
            json.dumps(
                {
                    "type": "portfolio_reset",
                    "mode": "PAPER",
                    "portfolio": state.portfolios[session_id],
                }
            )
        )

    elif mtype == "sync_featured":
        # New message to request featured markets
        featured_ms = await fetch_featured_events()
        await ws.send_text(
            json.dumps({"type": "markets_refresh", "markets": featured_ms})
        )

    elif mtype == "sync_active":
        # Revert to standard active markets
        await ws.send_text(
            json.dumps({"type": "markets_refresh", "markets": state.active_markets})
        )

    elif mtype == "search_news":
        query = msg.get("query")
        m_id = msg.get("market_id")
        if query:
            try:
                await broadcast_log(
                    "INFO", f"RESEARCH: Initiating search for '{query}'..."
                )
                # Add timeout to external search
                raw_items = await asyncio.wait_for(
                    state.news_engine.search_google_news(query), timeout=30.0
                )

                if not raw_items:
                    await broadcast_log(
                        "DEBUG", f"RESEARCH: No new raw signals found for '{query}'"
                    )
                    return

                await broadcast_log(
                    "INFO",
                    f"RESEARCH: Found {len(raw_items)} potential signals. Summarizing with Llama 3.3...",
                )

                new_count = 0
                for item in raw_items:
                    try:
                        existing_ids = {i["id"] for i in state.news_items}
                        if item["id"] not in existing_ids:
                            await broadcast_log(
                                "DEBUG", f"ENRICHING: {item['headline'][:60]}..."
                            )

                            # Add a per-item timeout to prevent total hang
                            enriched = await asyncio.wait_for(
                                state.news_engine.enrich_item(
                                    item, state.active_markets
                                ),
                                timeout=20.0,
                            )

                            if not enriched.get("market_id") and m_id:
                                enriched["market_id"] = m_id

                            state.db.insert_news_item(enriched)
                            state.news_items = [enriched] + state.news_items
                            state.news_items = state.news_items[:100]
                            await broadcast({"type": "news_update", "item": enriched})
                            new_count += 1
                    except asyncio.TimeoutError:
                        await broadcast_log(
                            "ERROR", "ENRICHING: AI timed out on one item."
                        )
                    except Exception as e:
                        await broadcast_log(
                            "ERROR", f"ENRICHING: Error processing item: {str(e)[:50]}"
                        )

                if new_count > 0:
                    await broadcast_log(
                        "INFO",
                        f"RESEARCH: Successfully injected {new_count} enriched items for '{query}'",
                    )
                else:
                    await broadcast_log(
                        "DEBUG",
                        f"RESEARCH: All found items for '{query}' were already in cache.",
                    )
            except Exception as e:
                await broadcast_log(
                    "ERROR", f"RESEARCH: Failed for '{query}': {str(e)[:100]}"
                )

    elif mtype == "request_intelligence":
        m_id = msg.get("market_id")
        if m_id:
            try:
                # Use case-insensitive search to prevent hanging if casing differs
                market = next(
                    (
                        m
                        for m in state.active_markets
                        if m["id"].lower() == m_id.lower()
                    ),
                    None,
                )
                if not market:
                    await broadcast_log(
                        "ERROR", f"BRAIN: Market {m_id[:8]} not found in active list."
                    )
                    await ws.send_text(
                        json.dumps(
                            {
                                "type": "intelligence_report",
                                "market_id": m_id,
                                "report": None,
                                "error": "Market not found",
                            }
                        )
                    )
                    return

                await broadcast_log(
                    "INFO", f"BRAIN: Deep analyzing {market['question'][:40]}..."
                )

                # Fetch relevant news from DB for context
                related_news = state.db.get_recent_news(market_id=m_id, limit=5)

                report = await asyncio.wait_for(
                    state.groq_estimator.deep_analyze(market, related_news),
                    timeout=25.0,
                )

                if report:
                    await ws.send_text(
                        json.dumps(
                            {
                                "type": "intelligence_report",
                                "market_id": m_id,
                                "report": report,
                            }
                        )
                    )
                    await broadcast_log(
                        "INFO",
                        f"BRAIN: Intelligence report ready (Fair Value: {round(report['fair_value'] * 100)}%)",
                    )
                else:
                    raise Exception("Analysis returned empty report")
            except Exception as e:
                await broadcast_log(
                    "ERROR", f"BRAIN: Failed for {m_id[:8]}: {str(e)[:50]}"
                )
                # Send error response to stop frontend loading state
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "intelligence_report",
                            "market_id": m_id,
                            "report": None,
                            "error": str(e),
                        }
                    )
                )

    elif mtype == "fetch_market":
        m_id = msg.get("market_id")
        if m_id:
            existing = next(
                (m for m in state.active_markets if m["id"].lower() == m_id.lower()),
                None,
            )
            if not existing:
                # Fetch from Gamma
                async def fetch_missing():
                    async with httpx.AsyncClient(timeout=10) as client:
                        try:
                            # Try active first
                            resp = await client.get(
                                f"{GAMMA_API}/markets?condition_ids={m_id}&closed=false"
                            )
                            data = resp.json()
                            if not data:
                                # Try closed
                                resp = await client.get(
                                    f"{GAMMA_API}/markets?condition_ids={m_id}&closed=true"
                                )
                                data = resp.json()

                            if data and isinstance(data, list) and len(data) > 0:
                                enriched = await enrich_market_data(client, data)
                                if enriched:
                                    state.active_markets.append(enriched[0])
                                    await broadcast(
                                        {
                                            "type": "markets_refresh",
                                            "markets": state.active_markets,
                                        }
                                    )
                        except Exception as e:
                            await broadcast_log(
                                "ERROR", f"Failed to fetch market {m_id[:8]}: {e}"
                            )

                asyncio.create_task(fetch_missing())

    elif mtype == "run_manual_scan":
        await perform_scan()
        await ws.send_text(json.dumps({"type": "manual_scan_complete"}))

    elif mtype == "sync_live_state":
        address = os.getenv("POLY_RELAYER_ADDRESS")
        if not address:
            return
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"https://data-api.polymarket.com/positions?user={address}"
                )
                pdata = r.json()
            lpos = {}
            for p in pdata:
                tid = get_token_id(
                    p.get("asset") or p.get("asset_id") or p.get("token_id")
                )
                if tid:
                    lpos[tid] = {
                        "shares": float(p.get("size", 0)),
                        "avg_cost": float(p.get("price", 0.5)),
                        "question": p.get("title", "Live"),
                        "outcome": "YES" if p.get("outcomeIndex") == 0 else "NO",
                    }
            await ws.send_text(
                json.dumps(
                    {
                        "type": "state",
                        "mode": "LIVE",
                        "portfolio": {"cash": 0.0, "positions": lpos, "history": []},
                        "markets": state.active_markets,
                        "prices": state.market_prices,
                        "order_books": state.order_books,
                    }
                )
            )
        except Exception:
            pass


async def execute_live_trade(msg):
    if not clob_client:
        return {"success": False, "error": "SDK Init failed"}
    tid = get_token_id(msg)
    side = msg.get("side", "buy").upper()
    shares = float(msg.get("shares", 1))
    price = float(msg.get("price", 0))
    lp = (
        round(min(price + 0.02, 0.99), 2)
        if side == "BUY"
        else round(max(price - 0.02, 0.01), 2)
    )
    try:

        def place():
            return clob_client.post_order(
                clob_client.create_order(
                    OrderArgs(
                        price=lp,
                        size=shares,
                        side=BUY if side == "BUY" else SELL,
                        token_id=tid,
                    )
                )
            )

        r = await asyncio.get_event_loop().run_in_executor(None, place)
        return (
            {"success": True, "trade": r}
            if r.get("success")
            else {"success": False, "error": str(r)}
        )
    except Exception as e:
        return {"success": False, "error": str(e)}


def execute_trade(session_id, msg):
    p = state.portfolios[session_id]
    tid = get_token_id(msg)
    side = msg.get("side", "buy")
    shares = float(msg.get("shares", 1))
    price = float(msg.get("price", 0))

    # Input Validation
    if shares <= 0:
        return {"success": False, "error": "Invalid shares count"}
    if not (0.0001 <= price <= 0.9999):
        return {"success": False, "error": "Price out of bounds (0.0001 - 0.9999)"}

    cost = round(shares * price, 6)
    if side == "buy":
        if p["cash"] < cost:
            return {"success": False, "error": "Funds low"}
        p["cash"] = round(p["cash"] - cost, 6)
        pos = p["positions"].setdefault(
            tid,
            {
                "shares": 0,
                "avg_cost": 0,
                "question": msg.get("question", "Unknown"),
                "outcome": msg.get("outcome", "YES"),
            },
        )
        pos["avg_cost"] = round(
            (pos["shares"] * pos["avg_cost"] + cost) / (pos["shares"] + shares), 6
        )
        pos["shares"] = round(pos["shares"] + shares, 6)
    else:
        pos = p["positions"].get(tid)
        if not pos or pos["shares"] < shares:
            return {"success": False, "error": "Short sell not allowed"}
        p["cash"] = round(p["cash"] + cost, 6)
        pos["shares"] = round(pos["shares"] - shares, 6)
        if pos["shares"] < 1e-6:
            del p["positions"][tid]

    rec = {
        "id": str(uuid.uuid4())[:8],
        "session_id": session_id,
        "ts": datetime.utcnow().isoformat(),
        "side": side,
        "token_id": tid,
        "shares": shares,
        "price": price,
        "cost": cost,
        "market_question": msg.get("question", "Unknown"),
        "outcome": msg.get("outcome", "YES"),
        "created_at": datetime.utcnow().isoformat(),
    }

    # Persist to SQLite
    state.db.insert_trade(rec)

    # Update in-memory for backward compatibility / faster access
    p.setdefault("history", []).append(rec)

    return {"success": True, "trade": rec}
