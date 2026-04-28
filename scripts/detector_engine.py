import sqlite3
import os
import json
import uuid
import yaml
import asyncio
from datetime import datetime, timedelta
from typing import List, Optional
from groq import Groq

class DetectorDB:
    def __init__(self, db_path=None):
        # Resolve to root directory
        if db_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.db_path = os.path.join(base_dir, "detector.db")
        else:
            self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            # Persistent Alerts (Filtered/User-facing)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id TEXT PRIMARY KEY,
                    alert_type TEXT,
                    severity TEXT,
                    market_id TEXT,
                    market_question TEXT,
                    message TEXT,
                    action TEXT,
                    edge_pct REAL,
                    details_json TEXT,
                    created_at TEXT
                )
            """)
            
            # Raw Inefficiencies (Unfiltered, for research)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS inefficiencies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id TEXT,
                    type TEXT,
                    gap REAL,
                    yes_price REAL,
                    no_price REAL,
                    created_at TEXT
                )
            """)

            # AI Estimates (Every model call)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ai_estimates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id TEXT,
                    market_question TEXT,
                    fair_prob REAL,
                    market_price REAL,
                    confidence TEXT,
                    reasoning TEXT,
                    created_at TEXT
                )
            """)

            # Trade History
            conn.execute("""
                CREATE TABLE IF NOT EXISTS trades (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    side TEXT,
                    token_id TEXT,
                    shares REAL,
                    price REAL,
                    cost REAL,
                    market_question TEXT,
                    outcome TEXT,
                    created_at TEXT
                )
            """)

            # Real-Time News
            conn.execute("""
                CREATE TABLE IF NOT EXISTS news (
                    id TEXT PRIMARY KEY,
                    market_id TEXT,
                    headline TEXT,
                    summary TEXT,
                    source TEXT,
                    url TEXT,
                    pis INTEGER,
                    sentiment TEXT,
                    ts TEXT
                )
            """)

            conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_session ON trades(session_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ineff_market ON inefficiencies(market_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_market ON ai_estimates(market_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_news_ts ON news(ts DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_news_market ON news(market_id)")

    def insert_news_item(self, item: dict):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO news (id, market_id, headline, summary, source, url, pis, sentiment, ts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item["id"], item.get("market_id"), item["headline"], 
                item["summary"], item["source"], item["url"], 
                item["pis"], item["sentiment"], item.get("ts")
            ))

    def get_recent_news(self, market_id=None, limit=50):
        with self._get_conn() as conn:
            if market_id:
                curr = conn.execute(
                    "SELECT * FROM news WHERE market_id = ? ORDER BY ts DESC LIMIT ?", 
                    (market_id, limit)
                )
            else:
                curr = conn.execute(
                    "SELECT * FROM news ORDER BY ts DESC LIMIT ?", 
                    (limit,)
                )
            return [dict(row) for row in curr.fetchall()]

    def insert_alert(self, alert_data: dict):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR IGNORE INTO alerts 
                (id, alert_type, severity, market_id, market_question, message, action, edge_pct, details_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                alert_data['id'], alert_data['alert_type'], alert_data['severity'],
                alert_data['market_id'], alert_data['market_question'], alert_data['message'],
                alert_data['action'], alert_data['edge_pct'], json.dumps(alert_data['details']),
                alert_data['created_at']
            ))

    def get_last_alert_ts(self, market_id: str, alert_type: str) -> Optional[datetime]:
        with self._get_conn() as conn:
            curr = conn.execute(
                "SELECT created_at FROM alerts WHERE market_id = ? AND alert_type = ? ORDER BY created_at DESC LIMIT 1",
                (market_id, alert_type)
            )
            row = curr.fetchone()
            if row:
                try:
                    return datetime.fromisoformat(row[0])
                except ValueError:
                    return None
            return None

    def insert_raw_inefficiency(self, market_id: str, type: str, gap: float, yes: float, no: float):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO inefficiencies (market_id, type, gap, yes_price, no_price, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (market_id, type, gap, yes, no, datetime.utcnow().isoformat()))

    def insert_ai_estimate(self, market_id: str, question: str, fair_prob: float, market_price: float, confidence: str, reasoning: str):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO ai_estimates (market_id, market_question, fair_prob, market_price, confidence, reasoning, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (market_id, question, fair_prob, market_price, confidence, reasoning, datetime.utcnow().isoformat()))

    def insert_trade(self, trade_data: dict):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO trades 
                (id, session_id, side, token_id, shares, price, cost, market_question, outcome, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                trade_data['id'], trade_data['session_id'], trade_data['side'],
                trade_data['token_id'], trade_data['shares'], trade_data['price'],
                trade_data['cost'], trade_data['market_question'], trade_data['outcome'],
                trade_data['created_at']
            ))

    def get_trades_for_session(self, session_id: str, limit=100):
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM trades WHERE session_id = ? ORDER BY created_at DESC LIMIT ?", (session_id, limit)).fetchall()
            return [dict(r) for r in rows]

    def query_db(self, table_name: str, limit=100):
        # Whitelist tables for security
        if table_name not in ["alerts", "inefficiencies", "ai_estimates", "trades"]:
            return []
        with self._get_conn() as conn:
            rows = conn.execute(f"SELECT * FROM {table_name} ORDER BY rowid DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def get_recent_alerts(self, limit=50):
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

class ArbScanner:
    def __init__(self, threshold=None):
        self.threshold = threshold or float(os.getenv("ARB_MIN_GAP", 0.02))

    def scan(self, market: dict) -> Optional[dict]:
        prices = market.get('outcome_prices')
        if not prices or len(prices) < 2:
            return None
            
        yes = float(prices[0] or 0)
        no = float(prices[1] or 0)
        total = yes + no
        gap = abs(total - 1.0)
        
        if gap < self.threshold or total <= 0:
            return None
            
        profit_pct = (gap / total) * 100
        severity = "HIGH" if gap > 0.10 else "MEDIUM" if gap > 0.05 else "LOW"
        action = "SELL BOTH" if total > 1.0 else "BUY BOTH"
        
        return {
            "type": "ARBITRAGE", "severity": severity, "gap_pct": round(gap * 100, 2),
            "profit_pct": round(profit_pct, 2), "action": f"{action} — {round(profit_pct, 1)}% edge",
            "message": f"YES={yes:.2f} NO={no:.2f} Sum={total:.2f} Gap={gap*100:.1f}%",
            "details": {"yes": yes, "no": no, "total": total, "gap": gap}
        }

class CrossScanner:
    def __init__(self, config_path=None):
        self.groups = []
        if config_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            config_path = os.path.join(base_dir, "market_groups.yaml")
            
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                self.groups = yaml.safe_load(f).get('groups', [])

    def scan(self, all_markets: List[dict]) -> List[dict]:
        opportunities = []
        for group in self.groups:
            # Find markets matching this group
            members = []
            for m in all_markets:
                if any(k.lower() in m['question'].lower() for k in group['keywords']):
                    members.append(m)
            
            if len(members) < 2:
                continue

            if group['type'] == "exhaustive":
                opp = self._check_exhaustive(group, members)
                if opp:
                    opportunities.append(opp)
            elif group['type'] == "ordered_ascending":
                opps = self._check_ordered(group, members)
                opportunities.extend(opps)
        
        return opportunities

    def _check_exhaustive(self, group, members) -> Optional[dict]:
        total_prob = sum([float(m['outcome_prices'][0] if m.get('outcome_prices') else 0.5) for m in members])
        gap = abs(total_prob - 1.0)
        if gap > group.get('threshold', 0.05):
            severity = "HIGH" if gap > 0.15 else "MEDIUM" if gap > 0.10 else "LOW"
            return {
                "market_id": f"group:{group['name']}", "market_question": f"Group: {group['name']}",
                "type": "CROSS_MARKET", "severity": severity, "edge_pct": round(gap * 100, 2),
                "action": "SELL OVERPRICED LEG" if total_prob > 1.0 else "BUY UNDERPRICED LEG",
                "message": f"Group Sum: {total_prob:.2f} | Gap: {gap*100:.1f}% | members: {len(members)}",
                "details": {"group": group['name'], "sum": total_prob, "gap": gap}
            }
        return None

    def _check_ordered(self, group, members) -> List[dict]:
        # Sort members by keyword order to ensure logical sequence
        sorted_ms = []
        for k in group['keywords']:
            m = next((x for x in members if k.lower() in x['question'].lower()), None)
            if m:
                sorted_ms.append(m)
        
        opps = []
        for i in range(len(sorted_ms) - 1):
            p1 = float(sorted_ms[i]['outcome_prices'][0] or 0.5)
            p2 = float(sorted_ms[i+1]['outcome_prices'][0] or 0.5)
            if p2 > (p1 + group.get('threshold', 0.02)):
                opps.append({
                    "market_id": sorted_ms[i+1]['id'], "market_question": sorted_ms[i+1]['question'],
                    "type": "CROSS_MARKET", "severity": "HIGH", "edge_pct": round((p2-p1)*100, 2),
                    "action": f"ARBITRAGE: {sorted_ms[i+1]['question']} is priced higher than {sorted_ms[i]['question']}",
                    "message": f"Inversion: {p2:.2f} > {p1:.2f} (Logical error)",
                    "details": {"m1": sorted_ms[i]['question'], "m2": sorted_ms[i+1]['question'], "p1": p1, "p2": p2}
                })
        return opps

class GroqEstimator:
    def __init__(self, api_key: str, threshold=None):
        if not api_key:
            self.client = None
            return
        self.client = Groq(api_key=api_key)
        self.threshold = threshold or float(os.getenv("AI_MIN_EDGE", 0.10))

    async def estimate(self, market: dict) -> Optional[dict]:
        if not self.client:
            return None
        prompt = f"Estimate fair probability for: {market['question']}. Current: {market['outcome_prices'][0]}. Return JSON: fair_probability, confidence, reasoning."
        try:
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            data = json.loads(response.choices[0].message.content)
            fair_prob = float(data['fair_probability'])
            market_price = float(market['outcome_prices'][0] or 0.5)
            edge = abs(fair_prob - market_price)
            if edge < self.threshold:
                return None
            severity = "HIGH" if edge > 0.20 else "MEDIUM" if edge > 0.10 else "LOW"
            return {
                "type": "AI_EDGE", "severity": severity, "edge_pct": round(edge * 100, 2),
                "action": f"{'BUY YES' if fair_prob > market_price else 'BUY NO'} ({round(fair_prob*100)}% model)",
                "message": f"Model: {fair_prob*100:.1f}% | Market: {market_price*100:.1f}% | Confidence: {data['confidence']}",
                "details": {"fair_prob": fair_prob, "market_price": market_price, "confidence": data['confidence'], "reasoning": data['reasoning']}
            }
        except Exception:
            return None

class AlertEngine:
    def __init__(self, db: DetectorDB, cooldown_minutes=60):
        self.db = db
        self.cooldown = timedelta(minutes=cooldown_minutes)

    def is_cooling_down(self, market_id: str, alert_type: str) -> bool:
        """Check if an alert of this type for this market is currently cooling down via DB."""
        last_ts = self.db.get_last_alert_ts(market_id, alert_type)
        if last_ts is None:
            return False
        return datetime.utcnow() - last_ts < self.cooldown

    def process_opportunity(self, market: dict, opp: dict) -> Optional[dict]:
        if self.is_cooling_down(market['id'], opp['type']):
            return None
        
        now = datetime.utcnow()
        alert = {
            "id": str(uuid.uuid4())[:8], "alert_type": opp['type'], "severity": opp['severity'],
            "market_id": market['id'], "market_question": market['question'],
            "message": opp['message'], "action": opp['action'], "edge_pct": opp.get('edge_pct') or opp.get('gap_pct') or 0,
            "details": opp['details'], "created_at": now.isoformat()
        }
        self.db.insert_alert(alert)
        return alert
