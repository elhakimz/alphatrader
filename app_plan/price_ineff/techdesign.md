# Technical Design — Polymarket Price Inefficiency Detector

**Version:** 1.0  
**Stack:** Python 3.11+ · SQLite (WAL) · Claude API · Rich CLI  
**Last Updated:** 2026-04-27

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI Entry Point                               │
│                      price_ineff_main.py / price_ineff_cli.py                                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
              ┌─────────────────┼──────────────────────┐
              ▼                 ▼                       ▼
    ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
    │   Ingestion   │   │  Scanner Engine  │   │   Alert Engine   │
    │   Layer       │   │                  │   │                  │
    │  (async)      │   │  - Arb Scanner   │   │  - Dedup         │
    │               │   │  - Cross Scanner │   │  - Severity      │
    │  Polymarket   │   │  - AI Estimator  │   │  - Cooldown      │
    │  REST API     │   │                  │   │  - Dispatch      │
    └──────┬───────┘   └────────┬─────────┘   └───────┬──────────┘
           │                    │                       │
           ▼                    ▼                       ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     SQLite Database                          │
    │   markets | price_snapshots | inefficiencies | alerts        │
    │   ai_estimates | market_groups | scan_logs                   │
    └─────────────────────────────────────────────────────────────┘
           │                    │                       │
           └────────────────────┴───────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │    Rich Dashboard     │
                    │    (Live TUI)         │
                    └──────────────────────┘
```

---

## 2. Project Structure

```
polymarket-detector/
├── price_ineff_main.py                    # Entry point
├── config.yaml                # User configuration
├── requirements.txt
│
├── ingestion/
│   ├── __init__.py
│   ├── polymarket_client.py   # Polymarket REST API wrapper
│   └── normalizer.py          # Price normalization, schema mapping
│
├── scanners/
│   ├── __init__.py
│   ├── arb_scanner.py         # YES+NO sum scanner
│   ├── cross_scanner.py       # Cross-market group scanner
│   └── ai_estimator.py        # Claude API fair probability estimator
│
├── alerts/
│   ├── __init__.py
│   ├── alert_engine.py        # Dedup, cooldown, severity classification
│   └── models.py              # Alert dataclasses
│
├── storage/
│   ├── __init__.py
│   ├── database.py            # SQLite connection, WAL setup
│   ├── migrations.py          # Schema creation / migrations
│   └── queries.py             # Named query functions
│
├── display/
│   ├── __init__.py
│   ├── dashboard.py           # Rich live dashboard
│   └── detail_view.py         # Alert detail panel
│
├── utils/
│   ├── config.py              # Config loader (YAML)
│   └── logger.py              # Structured logging
│
└── tests/
    ├── test_arb_scanner.py
    ├── test_cross_scanner.py
    ├── test_ai_estimator.py
    └── fixtures/
        └── sample_markets.json
```

---

## 3. Data Models

### 3.1 Python Dataclasses

```python
# alerts/models.py

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

class AlertType(str, Enum):
    ARBITRAGE    = "ARBITRAGE"
    AI_EDGE      = "AI_EDGE"
    CROSS_MARKET = "CROSS_MARKET"

class Severity(str, Enum):
    LOW    = "LOW"
    MEDIUM = "MEDIUM"
    HIGH   = "HIGH"

@dataclass
class Market:
    id: str
    question: str
    yes_price: float
    no_price: float
    volume_usd: float
    expiry: Optional[datetime]
    fetched_at: datetime

@dataclass
class ArbOpportunity:
    market: Market
    yes_price: float
    no_price: float
    sum_price: float
    gap: float          # abs(sum - 1.0)
    profit_pct: float   # gap / sum * 100
    severity: Severity
    action: str         # e.g. "SELL BOTH"

@dataclass
class AiEstimate:
    market_id: str
    fair_probability: float
    confidence: str         # LOW / MEDIUM / HIGH
    reasoning: str
    edge: float             # abs(fair_prob - market_price)
    model_version: str
    estimated_at: datetime

@dataclass
class Alert:
    id: str
    alert_type: AlertType
    severity: Severity
    market_id: str
    market_question: str
    message: str
    action: str
    edge_pct: float
    details: dict           # type-specific payload
    created_at: datetime
    dismissed: bool = False
```

### 3.2 SQLite Schema

```sql
-- storage/migrations.py (schema)

CREATE TABLE IF NOT EXISTS markets (
    id          TEXT PRIMARY KEY,
    question    TEXT NOT NULL,
    category    TEXT,
    expiry      TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id   TEXT NOT NULL,
    yes_price   REAL NOT NULL,
    no_price    REAL NOT NULL,
    volume_usd  REAL,
    fetched_at  TEXT NOT NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE TABLE IF NOT EXISTS inefficiencies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id       TEXT NOT NULL,
    scanner_type    TEXT NOT NULL,   -- 'arb' | 'cross' | 'ai'
    gap             REAL NOT NULL,
    profit_pct      REAL,
    severity        TEXT NOT NULL,
    detected_at     TEXT NOT NULL,
    resolved_at     TEXT,            -- NULL if still open
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE TABLE IF NOT EXISTS ai_estimates (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id           TEXT NOT NULL,
    fair_probability    REAL NOT NULL,
    market_price        REAL NOT NULL,
    edge                REAL NOT NULL,
    confidence          TEXT NOT NULL,
    reasoning           TEXT,
    model_version       TEXT,
    estimated_at        TEXT NOT NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id              TEXT PRIMARY KEY,
    alert_type      TEXT NOT NULL,
    severity        TEXT NOT NULL,
    market_id       TEXT NOT NULL,
    message         TEXT NOT NULL,
    action          TEXT,
    edge_pct        REAL,
    details_json    TEXT,
    created_at      TEXT NOT NULL,
    dismissed_at    TEXT,
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE TABLE IF NOT EXISTS market_groups (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    description     TEXT,
    group_type      TEXT NOT NULL,   -- 'exhaustive' | 'correlated'
    market_ids_json TEXT NOT NULL,   -- JSON array of market IDs
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    scanned_at      TEXT NOT NULL,
    markets_checked INTEGER,
    arb_found       INTEGER,
    ai_edges_found  INTEGER,
    cross_found     INTEGER,
    duration_ms     INTEGER
);

-- Indices for common query patterns
CREATE INDEX IF NOT EXISTS idx_snapshots_market_time
    ON price_snapshots(market_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_created
    ON alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inefficiencies_detected
    ON inefficiencies(detected_at DESC);
```

---

## 4. Core Modules

### 4.1 Polymarket Client

```python
# ingestion/polymarket_client.py

import httpx
import asyncio
from typing import List
from ..alerts.models import Market

POLYMARKET_API = "https://gamma-api.polymarket.com"

class PolymarketClient:
    def __init__(self, timeout: int = 10):
        self.client = httpx.AsyncClient(timeout=timeout)

    async def fetch_active_markets(self, limit: int = 500) -> List[dict]:
        """Fetch active markets with YES/NO prices."""
        url = f"{POLYMARKET_API}/markets"
        params = {
            "active": True,
            "closed": False,
            "limit": limit,
            "_order": "volume24hr",
        }
        resp = await self.client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    async def fetch_market(self, market_id: str) -> dict:
        resp = await self.client.get(f"{POLYMARKET_API}/markets/{market_id}")
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self.client.aclose()
```

### 4.2 Arbitrage Scanner

```python
# scanners/arb_scanner.py

from typing import List, Optional
from ..alerts.models import Market, ArbOpportunity, Severity

class ArbScanner:
    def __init__(self, min_gap: float = 0.02):
        self.min_gap = min_gap

    def scan(self, markets: List[Market]) -> List[ArbOpportunity]:
        opportunities = []
        for market in markets:
            opp = self._check_market(market)
            if opp:
                opportunities.append(opp)
        return sorted(opportunities, key=lambda x: x.gap, reverse=True)

    def _check_market(self, market: Market) -> Optional[ArbOpportunity]:
        yes = market.yes_price
        no  = market.no_price
        total = yes + no

        gap = abs(total - 1.0)
        if gap < self.min_gap:
            return None

        profit_pct = (gap / total) * 100
        severity = self._classify(gap)

        if total > 1.0:
            action = f"SELL BOTH — collect {profit_pct:.1f}%"
        else:
            action = f"BUY BOTH — collect {profit_pct:.1f}% at expiry"

        return ArbOpportunity(
            market=market,
            yes_price=yes,
            no_price=no,
            sum_price=total,
            gap=gap,
            profit_pct=profit_pct,
            severity=severity,
            action=action,
        )

    def _classify(self, gap: float) -> Severity:
        if gap >= 0.10:
            return Severity.HIGH
        elif gap >= 0.05:
            return Severity.MEDIUM
        return Severity.LOW
```

### 4.3 AI Estimator

```python
# scanners/ai_estimator.py

import anthropic
import json
from datetime import datetime
from ..alerts.models import Market, AiEstimate

SYSTEM_PROMPT = """You are a prediction market analyst with access to web search.

Your task:
1. Search the web for the latest information relevant to the market question.
2. Based on what you find, estimate the fair probability the market resolves YES.

After searching, respond ONLY with valid JSON matching this schema:
{
  "fair_probability": <float 0.0-1.0>,
  "confidence": "<LOW|MEDIUM|HIGH>",
  "reasoning": "<2-3 sentence explanation citing what you found>",
  "sources_used": <integer — number of search results consulted>
}

Rules:
- Search before estimating. Do not rely on training knowledge alone for current events.
- Be calibrated: if search results are sparse or contradictory, lower your confidence.
- Do not let the current market price anchor your estimate.
- Output ONLY the JSON object, no preamble or markdown."""

WEB_SEARCH_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
}

class AiEstimator:
    def __init__(self, min_edge: float = 0.10, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.Anthropic()
        self.min_edge = min_edge
        self.model = model

    def estimate(self, market: Market) -> AiEstimate | None:
        prompt = self._build_prompt(market)
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=[WEB_SEARCH_TOOL],
                messages=[{"role": "user", "content": prompt}],
            )
            # Extract the final text block (after any tool-use rounds)
            raw = next(
                (block.text for block in reversed(response.content)
                 if hasattr(block, "text")),
                None,
            )
            if not raw:
                return None

            data = json.loads(raw.strip())
            fair_prob = float(data["fair_probability"])
            edge = abs(fair_prob - market.yes_price)

            if edge < self.min_edge:
                return None

            return AiEstimate(
                market_id=market.id,
                fair_probability=fair_prob,
                confidence=data["confidence"],
                reasoning=data["reasoning"],
                edge=edge,
                model_version=self.model,
                estimated_at=datetime.utcnow(),
            )
        except (json.JSONDecodeError, KeyError, ValueError, StopIteration):
            return None

    def _build_prompt(self, market: Market) -> str:
        return (
            f"Market question: {market.question}\n"
            f"Current market YES price: {market.yes_price:.3f} "
            f"({market.yes_price * 100:.1f}%)\n"
            f"Market volume: ${market.volume_usd:,.0f}\n"
            f"Expiry: {market.expiry or 'unknown'}\n\n"
            "Search the web for recent, relevant information, then estimate "
            "the fair probability this market resolves YES."
        )
```

### 4.4 Alert Engine

```python
# alerts/alert_engine.py

import uuid
from datetime import datetime, timedelta
from typing import List, Dict
from .models import Alert, AlertType, ArbOpportunity, AiEstimate, Severity

class AlertEngine:
    def __init__(self, cooldown_minutes: int = 60):
        self.cooldown = timedelta(minutes=cooldown_minutes)
        self._last_alert: Dict[str, datetime] = {}  # market_id+type -> timestamp

    def process_arb(self, opp: ArbOpportunity) -> Alert | None:
        key = f"{opp.market.id}:ARBITRAGE"
        if self._is_cooling_down(key):
            return None
        self._last_alert[key] = datetime.utcnow()

        msg = (
            f"YES={opp.yes_price:.3f}  NO={opp.no_price:.3f}  "
            f"Sum={opp.sum_price:.3f}  Gap={opp.gap*100:.1f}%"
        )
        return Alert(
            id=str(uuid.uuid4()),
            alert_type=AlertType.ARBITRAGE,
            severity=opp.severity,
            market_id=opp.market.id,
            market_question=opp.market.question,
            message=msg,
            action=opp.action,
            edge_pct=opp.gap * 100,
            details={"yes": opp.yes_price, "no": opp.no_price,
                     "sum": opp.sum_price, "gap": opp.gap},
            created_at=datetime.utcnow(),
        )

    def process_ai_edge(self, market, estimate: AiEstimate) -> Alert | None:
        key = f"{market.id}:AI_EDGE"
        if self._is_cooling_down(key):
            return None
        self._last_alert[key] = datetime.utcnow()

        direction = "BUY YES" if estimate.fair_probability > market.yes_price else "BUY NO"
        severity = self._classify_edge(estimate.edge)
        msg = (
            f"Market={market.yes_price*100:.1f}%  "
            f"Model={estimate.fair_probability*100:.1f}%  "
            f"Edge={estimate.edge*100:.1f}%  "
            f"Confidence={estimate.confidence}"
        )
        return Alert(
            id=str(uuid.uuid4()),
            alert_type=AlertType.AI_EDGE,
            severity=severity,
            market_id=market.id,
            market_question=market.question,
            message=msg,
            action=direction,
            edge_pct=estimate.edge * 100,
            details={"fair_prob": estimate.fair_probability,
                     "market_price": market.yes_price,
                     "reasoning": estimate.reasoning,
                     "confidence": estimate.confidence},
            created_at=datetime.utcnow(),
        )

    def _is_cooling_down(self, key: str) -> bool:
        last = self._last_alert.get(key)
        if last is None:
            return False
        return datetime.utcnow() - last < self.cooldown

    def _classify_edge(self, edge: float) -> Severity:
        if edge >= 0.20:   return Severity.HIGH
        elif edge >= 0.10: return Severity.MEDIUM
        return Severity.LOW
```

---

## 5. Database Layer

```python
# storage/database.py

import sqlite3
import threading
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path("data/detector.db")

class Database:
    _local = threading.local()

    def __init__(self, path: Path = DB_PATH):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connection(self):
        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(self.path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.row_factory = sqlite3.Row
            self._local.conn = conn
        try:
            yield self._local.conn
            self._local.conn.commit()
        except Exception:
            self._local.conn.rollback()
            raise

    def insert_snapshot(self, market_id, yes, no, volume, fetched_at):
        sql = """INSERT INTO price_snapshots 
                 (market_id, yes_price, no_price, volume_usd, fetched_at)
                 VALUES (?, ?, ?, ?, ?)"""
        with self.connection() as conn:
            conn.execute(sql, (market_id, yes, no, volume, fetched_at))

    def insert_alert(self, alert):
        import json
        sql = """INSERT OR IGNORE INTO alerts
                 (id, alert_type, severity, market_id, message, action,
                  edge_pct, details_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"""
        with self.connection() as conn:
            conn.execute(sql, (
                alert.id, alert.alert_type, alert.severity,
                alert.market_id, alert.message, alert.action,
                alert.edge_pct, json.dumps(alert.details),
                alert.created_at.isoformat(),
            ))

    def get_recent_alerts(self, hours: int = 24, min_edge: float = 0.0):
        sql = """SELECT * FROM alerts
                 WHERE created_at > datetime('now', ?)
                 AND edge_pct >= ?
                 ORDER BY edge_pct DESC"""
        with self.connection() as conn:
            return conn.execute(sql, (f"-{hours} hours", min_edge)).fetchall()
```

---

## 6. Main Orchestration Loop

```python
# price_ineff_main.py

import asyncio
from ingestion.polymarket_client import PolymarketClient
from ingestion.normalizer import normalize_market
from scanners.arb_scanner import ArbScanner
from scanners.ai_estimator import AiEstimator
from alerts.alert_engine import AlertEngine
from storage.database import Database
from storage.migrations import run_migrations
from display.dashboard import Dashboard
from utils.config import load_config

async def run_scan(client, arb_scanner, ai_estimator, alert_engine, db):
    raw_markets = await client.fetch_active_markets()
    markets = [normalize_market(m) for m in raw_markets if m.get("active")]

    # Persist snapshots
    for m in markets:
        db.insert_snapshot(m.id, m.yes_price, m.no_price, m.volume_usd,
                           m.fetched_at.isoformat())

    alerts = []

    # 1. Arbitrage scan (cheap, run on all markets)
    arb_opps = arb_scanner.scan(markets)
    for opp in arb_opps:
        alert = alert_engine.process_arb(opp)
        if alert:
            db.insert_alert(alert)
            alerts.append(alert)

    # 2. AI scan (expensive, run on high-volume markets only)
    top_markets = sorted(markets, key=lambda m: m.volume_usd, reverse=True)[:50]
    for market in top_markets:
        estimate = ai_estimator.estimate(market)
        if estimate:
            alert = alert_engine.process_ai_edge(market, estimate)
            if alert:
                db.insert_alert(alert)
                alerts.append(alert)

    return alerts

async def main():
    config = load_config("config.yaml")
    db = Database()
    run_migrations(db)

    client       = PolymarketClient()
    arb_scanner  = ArbScanner(min_gap=config.thresholds.arb_min_gap)
    ai_estimator = AiEstimator(min_edge=config.thresholds.ai_min_edge)
    alert_engine = AlertEngine(cooldown_minutes=config.alerts.cooldown_minutes)
    dashboard    = Dashboard(config)

    try:
        while True:
            alerts = await run_scan(client, arb_scanner, ai_estimator,
                                    alert_engine, db)
            dashboard.update(alerts)
            await asyncio.sleep(config.polling.interval_seconds)
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 7. Dependencies

```text
# requirements.txt

httpx>=0.27.0          # Async HTTP client for Polymarket API
anthropic>=0.25.0      # Claude API SDK or Other prefered OpenAPI compatible LLM
rich>=13.7.0           # Terminal UI (dashboard, tables, panels)
pyyaml>=6.0.1          # Config file parsing
click>=8.1.7           # CLI argument parsing
python-dateutil>=2.9   # Date parsing utilities
pytest>=8.0.0          # Testing
pytest-asyncio>=0.23   # Async test support
```

---

## 8. Performance & Scaling Considerations

### SQLite WAL Mode
WAL (Write-Ahead Logging) is enabled by default. This allows concurrent reads during writes, which matters when the dashboard is reading while the ingestion loop is writing snapshots.

### AI Estimator Rate Limiting
Claude API calls are expensive and rate-limited. The estimator is only triggered on:
1. Top N markets by 24h volume (configurable, default 50)
2. Markets with a cooldown that has expired
3. Markets where the arb scanner already found a gap (higher priority)

This keeps API usage under 50 calls/hour by default.

### Price Snapshot Pruning
Price snapshots accumulate fast. A scheduled cleanup runs at startup to delete snapshots older than 7 days (configurable), keeping the DB compact.

```python
# Run on startup
db.execute("DELETE FROM price_snapshots WHERE fetched_at < datetime('now', '-7 days')")
```

### Async Architecture
The ingestion loop is fully async using `httpx.AsyncClient`. The scanner and alert engine are synchronous (CPU-bound, fast). The AI estimator is synchronous (blocking Claude API call) — if needed in v2, this can be moved to `asyncio.to_thread`.

---

## 9. Testing Strategy

| Layer | Test Type | Key Cases |
|---|---|---|
| `ArbScanner` | Unit | Gap detection, severity classification, edge cases (prices at 0 or 1) |
| `AiEstimator` | Unit (mocked) | JSON parse, confidence filter, edge threshold |
| `AlertEngine` | Unit | Cooldown logic, deduplication, severity mapping |
| `Database` | Integration | Insert/query round-trips, WAL mode, index usage |
| `PolymarketClient` | Integration (mocked) | API response parsing, error handling |
| End-to-end | Integration | Full scan loop with fixture markets → expected alerts |

---

## 10. Configuration Schema

```python
# utils/config.py (dataclass representation)

from dataclasses import dataclass

@dataclass
class PollingConfig:
    interval_seconds: int = 30
    max_markets: int = 1000

@dataclass
class ThresholdConfig:
    arb_min_gap: float = 0.02
    ai_min_edge: float = 0.10
    cross_market_min_gap: float = 0.03

@dataclass
class AiConfig:
    enabled: bool = True
    confidence_filter: str = "medium"
    max_calls_per_hour: int = 50

@dataclass
class AlertConfig:
    cooldown_minutes: int = 60
    severity_filter: str = "low"

@dataclass
class DisplayConfig:
    refresh_seconds: int = 5
    max_alerts_shown: int = 10
    truncate_question: int = 60

@dataclass
class AppConfig:
    polling: PollingConfig
    thresholds: ThresholdConfig
    ai_estimator: AiConfig
    alerts: AlertConfig
    display: DisplayConfig
```

---

## 11. Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...          # Required for AI estimator + web search
DETECTOR_DB_PATH=./data/detector.db   # Optional override
DETECTOR_LOG_LEVEL=INFO               # DEBUG | INFO | WARNING
FLASK_PORT=5050                        # v1.5 API port (default 5050)
```

---

## 12. Cross-Market Groups Config

Groups are defined in `market_groups.yaml` and seeded into SQLite at startup. No code changes needed to add new groups.

```yaml
# market_groups.yaml

groups:
  - name: "2028 US Presidential Primary — Republican"
    type: exhaustive        # sum of prices must equal 1.0
    markets:
      - question_contains: "Trump wins 2028 Republican primary"
      - question_contains: "DeSantis wins 2028 Republican primary"
      - question_contains: "Other Republican wins 2028 primary"

  - name: "FOMC June 2026 Decision"
    type: exhaustive
    markets:
      - question_contains: "Fed cuts rates June 2026"
      - question_contains: "Fed holds rates June 2026"
      - question_contains: "Fed hikes rates June 2026"

  - name: "Bitcoin Price Milestones 2026"
    type: ordered_ascending  # P(A) >= P(B) >= P(C) must hold
    markets:
      - question_contains: "Bitcoin hits $80K in 2026"
      - question_contains: "Bitcoin hits $100K in 2026"
      - question_contains: "Bitcoin hits $120K in 2026"

  - name: "2025-26 NBA Champion"
    type: exhaustive
    markets:
      - question_contains: "win the 2026 NBA Championship"
```

---

## 13. v1.5 Flask API Layer

A lightweight read-only REST API wrapping the SQLite database. Runs as a separate process alongside the CLI scanner.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/alerts` | Recent alerts, filterable by type/severity/hours |
| `GET` | `/api/alerts/:id` | Full alert detail with AI reasoning |
| `GET` | `/api/markets/:id/history` | Price history for a market |
| `GET` | `/api/opportunities` | Top opportunities ranked by edge |
| `GET` | `/api/stats` | Scan stats (alerts today, markets tracked, etc.) |
| `GET` | `/api/groups` | Configured cross-market groups + current status |

### Example Response — `/api/alerts`

```json
{
  "alerts": [
    {
      "id": "a3f1...",
      "type": "AI_EDGE",
      "severity": "HIGH",
      "market_question": "Will the Fed cut rates in June 2026?",
      "market_price": 0.30,
      "model_price": 0.55,
      "edge_pct": 25.0,
      "action": "BUY YES",
      "confidence": "HIGH",
      "reasoning": "Recent CPI data and Fed language suggest...",
      "created_at": "2026-04-27T14:21:03Z"
    }
  ],
  "total": 1,
  "generated_at": "2026-04-27T14:25:00Z"
}
```

### Implementation Sketch

```python
# api/app.py  (v1.5)

from flask import Flask, jsonify, request
from storage.database import Database

app = Flask(__name__)
db = Database()

@app.get("/api/alerts")
def get_alerts():
    hours    = int(request.args.get("hours", 24))
    min_edge = float(request.args.get("min_edge", 0))
    rows     = db.get_recent_alerts(hours=hours, min_edge=min_edge)
    return jsonify({"alerts": [dict(r) for r in rows], "total": len(rows)})

@app.get("/api/opportunities")
def get_opportunities():
    rows = db.get_recent_alerts(hours=24, min_edge=5.0)
    sorted_rows = sorted(rows, key=lambda r: r["edge_pct"], reverse=True)
    return jsonify({"opportunities": [dict(r) for r in sorted_rows[:20]]})

if __name__ == "__main__":
    import os
    app.run(port=int(os.getenv("FLASK_PORT", 5050)))
```

Add `flask>=3.0.0` to `requirements.txt` for v1.5.
