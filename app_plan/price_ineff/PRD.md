# PRD — Polymarket Price Inefficiency Detector

**Version:** 1.0  
**Status:** Draft  
**Owner:** TBD  
**Last Updated:** 2026-04-27

---

## 1. Overview

### 1.1 Problem Statement

Polymarket is a decentralized prediction market where prices reflect crowd-sourced probability estimates. However, mispricings emerge regularly due to:

- Liquidity fragmentation across related markets
- Slow information diffusion
- Emotional or uninformed trading
- YES + NO prices that fail to sum to 1.0 (pure arbitrage)
- Cross-market inconsistencies (e.g., Candidate A wins ≠ 1 − Candidate B wins)

Traders who identify these inefficiencies can capture guaranteed or high-probability profits. Currently, no dedicated open tool surfaces these opportunities in real time with AI-assisted fair value estimation.

### 1.2 Opportunity

| Signal Type | Example | Edge |
|---|---|---|
| YES/NO mispricing | YES=0.62, NO=0.41 → sum=1.03 | Guaranteed profit selling both |
| Cross-market gap | A wins (60%) + B wins (50%) > 100% | Sell overpriced leg |
| AI vs market gap | Market=30%, Model=55% | Long at market price |

### 1.3 Goals

- **G1** — Detect YES+NO sum deviations from 1.0 in real time
- **G2** — Identify cross-market inconsistencies across related outcomes
- **G3** — Produce AI-estimated fair probabilities and compare to market prices
- **G4** — Surface actionable alerts ranked by edge size
- **G5** — Store historical inefficiency data for back-testing and model improvement

---

## 2. Target Users

| Persona | Description | Primary Need |
|---|---|---|
| **Arbitrageur** | Active trader, wants guaranteed-profit ops | Real-time YES/NO alerts |
| **Edge Trader** | Quant-leaning, trusts model over market | AI vs market alerts |
| **Researcher** | Studies prediction market efficiency | Historical data, exports |
| **Developer** | Builds on top of this system | Clean API / DB access |

---

## 3. Scope

### 3.1 In Scope (v1.0)

- Polymarket data ingestion via public API / subgraph
- YES + NO arbitrage scanner
- Cross-market inconsistency scanner (manually defined market groups)
- AI fair-probability estimator using Claude API
- Alert engine with severity tiers
- CLI dashboard (terminal UI)
- SQLite persistence for markets, prices, inefficiencies, alerts
- Configurable alert thresholds
- CSV export of detected opportunities

### 3.2 Out of Scope (v1.0)

- Automated trade execution
- Portfolio management / position sizing
- On-chain wallet integration
- Web UI (planned v2)
- Real-money P&L tracking
- Multi-chain or non-Polymarket sources

---

## 4. Functional Requirements

### FR-01: Market Data Ingestion
- Poll Polymarket REST API every N seconds (configurable, default 30s)
- Fetch active markets: id, question, YES price, NO price, volume, expiry
- Normalize prices to float in [0, 1]
- Persist raw snapshots to SQLite with timestamp

### FR-02: YES/NO Arbitrage Scanner
- For each market: compute `gap = abs((yes + no) - 1.0)`
- Flag as arbitrage if `gap > threshold` (default: 0.02, i.e., 2%)
- Compute theoretical profit: `profit_pct = gap / (yes + no) * 100`
- Classify severity: LOW (2–5%), MEDIUM (5–10%), HIGH (>10%)

### FR-03: Cross-Market Inconsistency Scanner
- User defines market groups (e.g., election candidates, sports outcomes)
- For mutually exclusive exhaustive groups: sum of prices should equal 1.0
- For correlated markets (A implies B): enforce logical bounds
- Alert when sum deviates by more than threshold

### FR-04: AI Fair Probability Estimator
- For each flagged market, call Claude API with:
  - Market question
  - Resolution criteria
  - Current market price
  - Recent relevant context (optional: web search)
- Claude returns: estimated fair probability, confidence, reasoning summary
- Compute `edge = abs(fair_prob - market_price)`
- Alert if `edge > ai_threshold` (default: 0.10, i.e., 10%)

### FR-05: Alert Engine
- Deduplicate: do not re-alert for same market within cooldown window
- Alert format: `[TYPE] Market | Market=X% | Fair=Y% | Edge=Z% | Action`
- Alert types: ARBITRAGE, AI_EDGE, CROSS_MARKET
- Output channels: terminal print, SQLite log, optional file log

### FR-06: CLI Dashboard
- Live-refreshing terminal UI (using `rich` library)
- Panels: Active Alerts, Recent Scans, Top Opportunities, System Status
- Keyboard controls: pause, refresh, filter by type, export

### FR-07: Historical Storage & Export
- Store all price snapshots, detected inefficiencies, AI estimates
- Query: "show all opportunities in last 24h above 5% edge"
- Export filtered results to CSV

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Latency** | Alert surfaced within 5s of price snapshot |
| **Reliability** | Graceful handling of API rate limits and downtime |
| **Accuracy** | AI estimates accompanied by confidence score |
| **Configurability** | All thresholds adjustable via config file |
| **Portability** | Runs on macOS, Linux, Windows (Python 3.11+) |
| **Privacy** | No user data collected; API keys stored locally |

---

## 6. Success Metrics

| Metric | Target (v1.0) |
|---|---|
| Arbitrage opportunities detected per day | >5 on active market days |
| False positive rate (YES/NO scanner) | <5% |
| AI estimate accuracy (back-test vs resolution) | Brier score < 0.20 |
| Alert latency | <5 seconds from price change |
| System uptime during market hours | >99% |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Polymarket API rate limits | Medium | High | Exponential backoff, caching |
| Market prices update faster than poll interval | High | Medium | Configurable poll rate, webhook support in v2 |
| AI model hallucinations on fair value | Medium | Medium | Require confidence score; flag low-confidence estimates |
| Polymarket changes API structure | Low | High | Adapter pattern in ingestion layer |
| SQLite locks under high write frequency | Low | Medium | WAL mode enabled by default |

---

## 8. Milestones

| Milestone | Deliverable | Target |
|---|---|---|
| M1 | Data ingestion + SQLite storage working | Week 1 |
| M2 | YES/NO arbitrage scanner + alerts | Week 2 |
| M3 | Cross-market scanner + market groups | Week 3 |
| M4 | AI fair probability estimator integrated | Week 4 |
| M5 | CLI dashboard + CSV export | Week 5 |
| M6 | Testing, tuning thresholds, documentation | Week 6 |

---

## 9. Resolved Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | AI estimator: web search or training knowledge only? | **Web search enabled** via Anthropic tool use | Prediction markets resolve on current events; training knowledge is stale by definition. Web search is essential for accurate fair-value estimates. |
| 2 | Minimum viable cross-market groups for v1? | **See §9.1 below** | Four high-signal domains covering elections, macro, crypto, and sports — all with consistent Polymarket liquidity. |
| 3 | Alert cooldown: per-market or per-opportunity-type? | **Per market + type composite key** | A market can simultaneously have an arb gap AND an AI edge — these are independent signals and should not suppress each other. Cooldown key = `market_id:alert_type`. |
| 4 | Flask API layer in v1.5? | **Yes** | Enables external tooling, mobile notifications, and dashboard UI without coupling to the CLI process. |

### 9.1 Pre-defined Cross-Market Groups (v1)

**Group 1 — US Elections (Exhaustive)**
Track all candidates in the same race. Sum of win-probabilities must equal 1.0.
Examples: 2026 Senate races, 2028 Presidential primary candidates.
Signal: any candidate cluster summing >1.05 or <0.95.

**Group 2 — Federal Reserve Rate Decisions (Sequential)**
Each FOMC meeting has Cut / Hold / Hike markets. These are mutually exclusive per meeting.
Sum must equal 1.0 per meeting date.
Signal: meetings where the three outcomes don't sum cleanly — common around surprise macro data.

**Group 3 — Crypto Price Milestones (Ordered)**
Markets like "BTC hits $80K", "BTC hits $100K", "BTC hits $120K" are logically ordered.
P(hits $80K) ≥ P(hits $100K) ≥ P(hits $120K) must hold.
Signal: inversion of this ordering = direct arbitrage.

**Group 4 — Sports Championship Winner (Exhaustive)**
All teams in a tournament: prices must sum to ~1.0 (adjusting for liquidity spread).
Examples: NBA Champion, Super Bowl winner, EPL title.
Signal: sum >1.08 or <0.92 after spread adjustment.

**Implementation note:** Groups are defined in `market_groups.yaml` and seeded into the `market_groups` table at startup. New groups can be added without code changes.
