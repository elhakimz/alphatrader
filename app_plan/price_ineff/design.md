# Design — Polymarket Price Inefficiency Detector

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-04-27

---

## 1. Design Philosophy

This tool is built for traders and researchers who think in numbers. The design principles follow from that:

- **Signal over noise** — every screen element earns its place by surfacing actionable information
- **Immediacy** — the most important alert is the one visible right now, not buried in a list
- **Transparency** — AI estimates show their reasoning; no black-box outputs
- **Speed over aesthetics** — CLI-first; a web UI is a v2 concern

---

## 2. User Flows

### 2.1 Primary Flow: Arbitrage Alert

```
Start CLI
    │
    ▼
System polls Polymarket API (every 30s)
    │
    ▼
Scanner evaluates YES + NO prices
    │
    ├── Sum ≠ 1.0 (gap > threshold)
    │       │
    │       ▼
    │   Alert created → shown in dashboard
    │   "ARBITRAGE | Market X | YES=0.62 NO=0.41 | Gap=3% | SELL BOTH"
    │
    └── Sum ≈ 1.0 → no action
```

### 2.2 Secondary Flow: AI Edge Alert

```
Market flagged as interesting (volume spike or large gap)
    │
    ▼
System calls Claude API with market question + context
    │
    ▼
Claude returns: fair_prob=55%, confidence=HIGH, reasoning=...
    │
    ▼
Edge computed: market=30%, model=55%, edge=25%
    │
    ▼
Alert shown:
"AI_EDGE | Market X | Market=30% | Model=55% | Edge=+25% | BUY YES"
    │
    ▼
User reviews reasoning → decides to act or dismiss
```

### 2.3 Research Flow: Historical Query

```
User runs CLI with --history flag
    │
    ▼
Prompts: date range, min edge, alert type
    │
    ▼
Queries SQLite → renders table in terminal
    │
    ▼
Optional: export to CSV
```

---

## 3. Dashboard Layout

The live dashboard uses `rich` panels in a fixed layout, refreshing every 5 seconds.

```
╔══════════════════════════════════════════════════════════════════════════╗
║  🔍 POLYMARKET INEFFICIENCY DETECTOR          [LIVE]  Last scan: 3s ago ║
╠══════════════════════════════════════════════╦═══════════════════════════╣
║  🚨 ACTIVE ALERTS (3)                        ║  📊 SYSTEM STATUS        ║
║  ─────────────────────────────────────────── ║  ────────────────────     ║
║  [HIGH]  ARBITRAGE                           ║  Markets tracked:  847    ║
║  "Will ETH hit $10K by Dec 2026?"            ║  Scans today:      142    ║
║  YES=0.62  NO=0.41  Gap=3.0%                 ║  Alerts today:     7      ║
║  Profit if sell both: ~2.9%  → SELL BOTH     ║  API status:       ✓      ║
║                                              ║  DB size:          14 MB  ║
║  [MEDIUM] AI_EDGE                            ║                           ║
║  "Trump wins 2028 primary?"                  ╠═══════════════════════════╣
║  Market=30%  Model=55%  Edge=+25%            ║  📈 TOP OPPORTUNITIES     ║
║  Confidence: HIGH  → BUY YES                 ║  ────────────────────     ║
║                                              ║  1. ETH $10K  +3.0% arb   ║
║  [LOW]   CROSS_MARKET                        ║  2. Trump 28  +25% edge   ║
║  "Candidate A + B + C prices sum to 1.08"    ║  3. Lakers W  +12% edge   ║
║  Sell the most overpriced leg                ║  4. Fed cut   +8% edge    ║
║                                              ║                           ║
╠══════════════════════════════════════════════╩═══════════════════════════╣
║  📋 RECENT SCANS                                                         ║
║  14:23:01  Scanned 847 markets  |  3 arb gaps  |  2 AI edges  |  1 cross ║
║  14:22:31  Scanned 847 markets  |  2 arb gaps  |  2 AI edges  |  0 cross ║
║  14:22:01  Scanned 847 markets  |  3 arb gaps  |  1 AI edge   |  1 cross ║
╠══════════════════════════════════════════════════════════════════════════╣
║  [P] Pause   [R] Refresh   [H] History   [E] Export   [Q] Quit           ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 4. Alert Design

### 4.1 Alert Card Anatomy

Each alert is a structured record with four visible layers:

```
[SEVERITY]  [TYPE]
"Market question text (truncated to 60 chars)"
Key Prices  →  Edge/Gap  →  Recommended Action
Reasoning snippet (AI alerts only)
```

### 4.2 Severity Color Coding

| Severity | Color | Threshold |
|---|---|---|
| HIGH | Red | Arb gap >10% or AI edge >20% |
| MEDIUM | Yellow | Arb gap 5–10% or AI edge 10–20% |
| LOW | Cyan | Arb gap 2–5% or AI edge 5–10% |

### 4.3 Alert Message Templates

**ARBITRAGE:**
```
[HIGH] ARBITRAGE | "Will ETH reach $10K?" 
YES=0.62  NO=0.41  Sum=1.03  Gap=+3.0%
Action: SELL both YES and NO → guaranteed ~2.9% profit
```

**AI_EDGE:**
```
[MEDIUM] AI_EDGE | "Will Fed cut rates in June?"
Market=30%  Model=42%  Edge=+12%  Confidence=MEDIUM
Action: BUY YES (market underpriced vs model)
Reason: "Recent CPI data and Fed language suggest higher cut probability..."
```

**CROSS_MARKET:**
```
[LOW] CROSS_MARKET | Group: "2026 NBA Champion"
Lakers=40%  Celtics=35%  Nuggets=30%  → Sum=105%
Action: SELL Lakers (most overpriced leg)
```

---

## 5. Configuration UX

Users configure the tool via a `config.yaml` file. Key settings are documented inline:

```yaml
# config.yaml — Polymarket Inefficiency Detector

polling:
  interval_seconds: 30         # How often to poll market prices
  max_markets: 1000            # Cap on active markets to track

thresholds:
  arb_min_gap: 0.02            # YES+NO must deviate by this to trigger
  ai_min_edge: 0.10            # AI vs market gap must exceed this
  cross_market_min_gap: 0.03   # Cross-market sum deviation threshold

ai_estimator:
  enabled: true
  confidence_filter: medium    # Only show alerts with medium+ confidence
  max_calls_per_hour: 50       # Rate limit Claude API calls

alerts:
  cooldown_minutes: 60         # Don't re-alert same market within this window
  severity_filter: low         # Minimum severity to display

display:
  refresh_seconds: 5           # Dashboard refresh rate
  max_alerts_shown: 10         # Alerts to show in live panel
  truncate_question: 60        # Characters before truncating market question
```

---

## 6. Alert Detail View

When a user presses Enter on an alert, an expanded detail panel appears:

```
╔══════════════════════════════════════════════════════╗
║  ALERT DETAIL — AI_EDGE                              ║
║  "Will the Fed cut rates at the June 2026 meeting?"  ║
╠══════════════════════════════════════════════════════╣
║  Market Price (YES):   30.0%                         ║
║  Model Estimate:       42.0%                         ║
║  Edge:                +12.0%  (model > market)       ║
║  Confidence:           MEDIUM                        ║
║  Detected:             2026-04-27 14:21:03           ║
║  Market Volume:        $284,000                      ║
║  Market Expires:       2026-06-20                    ║
╠══════════════════════════════════════════════════════╣
║  AI REASONING                                        ║
║  ──────────────────────────────────────────────────  ║
║  "Based on recent CPI readings (March 2026: 2.8%),  ║
║  Federal Reserve forward guidance, and the current  ║
║  Fed funds rate of 4.5%, a June cut is more likely  ║
║  than the market suggests. Markets may be pricing   ║
║  in lingering inflation risk that has since eased." ║
╠══════════════════════════════════════════════════════╣
║  PRICE HISTORY (last 2h)                             ║
║  14:00 ──────────────── 28%                          ║
║  14:10 ──────────────────── 30%                      ║
║  14:20 ──────────────────── 30%  ← now               ║
╠══════════════════════════════════════════════════════╣
║  [B] Back   [D] Dismiss Alert   [E] Export to CSV   ║
╚══════════════════════════════════════════════════════╝
```

---

## 7. Error States

| Situation | Display |
|---|---|
| Polymarket API unreachable | Status panel: `API ✗` + yellow warning bar |
| Claude API rate limited | AI alerts paused; banner: "AI estimator cooling down (12m)" |
| No markets loaded yet | Full-screen: "Fetching markets… (first run may take 30s)" |
| No alerts in current scan | "No inefficiencies detected above threshold. Watching..." |
| SQLite write error | Error bar with message; in-memory alerts continue |

---

## 8. Design Decisions & Rationale

**Why CLI over Web UI (v1)?**  
Traders who run bots and scripts live in the terminal. Shipping a web UI adds weeks of scope with limited marginal benefit for the core user. A web UI is planned for v2 once the detection engine is stable.

**Why show reasoning for AI alerts?**  
Blind AI signals erode trust. Showing the reasoning lets the user calibrate: a high-edge alert backed by solid reasoning is actionable; one with thin reasoning is a signal to wait.

**Why deduplicate alerts with a cooldown?**  
A market with a persistent 3% arbitrage gap would spam the dashboard without cooldown. Cooldown forces re-evaluation — if the gap persists after 60 minutes, it re-alerts, which is valuable information itself.

**Why YAML config over CLI flags?**  
Traders adjust thresholds frequently. A persistent config file is easier to version-control and share than memorising flag combinations.
