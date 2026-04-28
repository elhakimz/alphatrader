# PRD: AI Probability Engine ("Edge Brain")
### Polymarket Desktop App
**Status:** Draft v0.1
**Author:** —
**Last Updated:** 2026-04-27

---

## 0. Why This Document Exists

This PRD defines the AI Probability Engine — a feature that computes a model-derived probability for any Polymarket prediction market and surfaces the delta between that estimate and the live market price. The goal is to give active traders a systematic, repeatable signal to pressure-test intuition.

This document does **not** make final decisions on model architecture, data sourcing, or scoring formula. Those are captured in the Technical Design doc. This document surfaces what we're trying to do, for whom, and what "done" looks like.

---

## 1. Problem Statement

### 1.1 Context

Polymarket traders currently face two failure modes:

1. **Undercalibrated gut:** Acting on vibes, recency bias, or social sentiment without a quantitative anchor.
2. **Overcalibrated markets:** Assuming the market price is always right, missing edges when markets are thin, slow, or subject to crowded sentiment.

Neither extreme is good. The market price is a useful prior, but it's not omniscient — especially in low-liquidity markets, early in an event's lifecycle, or when macro context shifts faster than traders reprice.

### 1.2 The Gap

There is no current in-app tool that helps a trader answer: *"What probability do I actually believe this resolves YES, and how does that compare to what I'm being offered?"*

Traders either do this externally (spreadsheets, gut) or don't do it at all.

---

## 2. Goals

| # | Goal | Priority |
|---|------|----------|
| G1 | Generate a model probability for any active market | Must |
| G2 | Display the delta between model probability and market price | Must |
| G3 | Produce an "Edge Score" that quantifies the opportunity | Must |
| G4 | Produce a "Confidence Level" that quantifies model certainty | Must |
| G5 | Expose the signal sources behind the estimate | Should |
| G6 | Allow users to weight or override signal components | Could |
| G7 | Track historical accuracy of Edge Brain predictions | Could |

### 2.1 Non-Goals (explicitly out of scope for v1)

- **Auto-trading or order placement** — Edge Brain is a decision-support tool, not an execution engine.
- **Portfolio optimization** — No Kelly sizing, position recommendations, or risk management.
- **User-created models** — No custom signal builder in v1.
- **Mobile** — Desktop only for v1 given screen space requirements.
- **Real-time streaming** — Polling acceptable; sub-second latency not required.

---

## 3. Users

### 3.1 Primary: Active Discretionary Trader

- Places 10–50 trades/week
- Already familiar with Polymarket mechanics
- Has a loose mental model of probabilities but doesn't formalize it
- **Pain:** "I don't know if a 68% market is priced right or not"
- **Gain:** Wants a fast, trustworthy second opinion before committing

### 3.2 Secondary: Quant-Adjacent Researcher

- Treats Polymarket as alpha-generation surface
- Wants to understand *why* a signal fires, not just what it says
- **Pain:** Can't easily combine news, historical data, and market price in one place
- **Gain:** Wants to audit model reasoning, not just read outputs

### 3.3 Out-of-scope Users (v1)

- Casual or first-time traders (Edge Brain may confuse rather than help without calibration context)
- Institutional market-makers (need order-book depth, not probability signals)

---

## 4. Feature Requirements

### 4.1 Core: Edge Brain Panel

**FR-01 — Model Probability**
The system shall compute a probability estimate (0–100%) for the YES outcome of any active market, combining at minimum: (a) historical base rates, (b) recent news sentiment, (c) relevant macro indicators.

**FR-02 — Edge Score**
The system shall compute an Edge Score = f(model_probability − market_price, confidence). The formula, range, and display format TBD in Technical Design. The score must convey directionality (positive = lean YES, negative = lean NO) and magnitude.

> ⚠️ **Open Question OQ-01:** Should Edge Score be displayed as a raw delta (e.g., "+12pp"), a scaled score (e.g., "+3.2σ"), or a qualitative tier (e.g., "Strong Edge")? Each has legibility tradeoffs. Raw delta is honest but noisy. Tiers hide signal granularity. Recommend user testing before locking.

**FR-03 — Confidence Level**
The system shall output a Confidence Level alongside the model probability. Confidence must reflect model certainty, not outcome certainty. A high-confidence LOW probability is a valid and distinct state from a low-confidence LOW probability.

> ⚠️ **Open Question OQ-02:** Confidence is notoriously difficult to calibrate in ML models. If we ship a "High Confidence" label and the model is wrong at 40%, we erode user trust fast. We need to define confidence as a first-class concern, not a cosmetic label. See Technical Design §4.

**FR-04 — Signal Breakdown**
The panel shall display the contributing signals (historical, news, macro) with their relative weights or influence. This does not need to be deeply technical — it needs to be legible to a non-engineer.

**FR-05 — Refresh Cadence**
The model estimate shall update on a cadence to be defined. Considerations: computational cost, data freshness, user expectation of "liveness."

> ⚠️ **Tradeoff T-01:** Frequent refreshes feel alive but are expensive and may cause estimate volatility that confuses users. Infrequent refreshes are stable but may feel stale. Recommend starting at 15-minute refresh with a "last updated" timestamp always visible.

**FR-06 — Market Scope**
v1 shall target markets in: Politics, Economics, and Sports. Crypto and entertainment markets may behave differently (sentiment-driven, thin data) and should be flagged or excluded from v1 scope.

> ⚠️ **Tradeoff T-02:** Including all markets inflates the addressable feature surface but risks low-quality signals in thin markets. A narrow, high-quality scope builds trust faster than wide, inconsistent coverage.

### 4.2 Secondary: Historical Performance Tracker (v1.5)

**FR-07 — Prediction Log**
The system shall record Edge Brain's estimate at the time a user views it (with timestamp and market price at that moment) and compare to resolution outcome.

**FR-08 — Calibration Display**
An optional "How's Edge Brain doing?" view showing historical accuracy segmented by confidence tier.

> ⚠️ **Open Question OQ-03:** Do we show Edge Brain's historical accuracy before it's proven? Showing early-stage data could backfire if accuracy is mediocre. Consider a minimum N-resolved-markets threshold before displaying.

---

## 5. Success Metrics

| Metric | Target (90 days post-launch) | Notes |
|--------|------------------------------|-------|
| Panel open rate | >40% of active daily sessions | Proxy for "do people find it useful enough to look" |
| Model calibration (Brier score) | <0.18 on resolved markets | Baseline to beat: random = 0.25 |
| Edge capture rate | Edge Brain "Strong Edge" markets outperform by >5pp | Requires logging + resolution tracking |
| User opt-out rate | <15% disable the panel after enabling | Proxy for trust |
| Support tickets re: confusion | <5% of panel users | If people don't understand it, it's broken UX |

> ⚠️ **Measurement Risk:** Calibration and edge capture require resolved markets. We won't have clean data for 30–90 days depending on market duration. Plan for a "patience period" before evaluating model quality.

---

## 6. Assumptions

- A1: We have access to or can acquire historical Polymarket resolution data
- A2: A news API (e.g., GDELT, NewsAPI, or similar) is licensable at acceptable cost
- A3: Macro indicator data (e.g., FRED, World Bank) is accessible via API
- A4: The model can be run server-side and results cached per market (not computed client-side)
- A5: Users are willing to interpret a quantitative signal without extensive onboarding

---

## 7. Risks & Open Questions Summary

| ID | Risk / Question | Severity | Owner |
|----|-----------------|----------|-------|
| OQ-01 | Edge Score display format | Medium | Product + Design |
| OQ-02 | Confidence calibration definition | High | ML |
| OQ-03 | When to show historical accuracy | Medium | Product |
| T-01 | Refresh cadence vs. cost vs. staleness | Medium | Eng |
| T-02 | Market scope breadth vs. signal quality | High | Product |
| R-01 | Model overconfidence erodes user trust | High | ML + Product |
| R-02 | Regulatory: are we providing "financial advice"? | High | Legal |
| R-03 | Data licensing cost is prohibitive | Medium | Eng + Finance |

> ⚠️ **R-02 Flagged:** Prediction market tooling that generates probability scores and "edge" language may be interpreted as financial advice in some jurisdictions. Legal review required before launch copy is finalized.

---

## 8. Milestones (Proposed)

| Milestone | Target | Definition of Done |
|-----------|--------|---------------------|
| M1: Signal Spike | Week 3 | Each signal source (historical, news, macro) returns a number for 1 test market |
| M2: Model Alpha | Week 6 | Combined model probability output for all Politics markets |
| M3: Edge Score Alpha | Week 8 | Edge Score + Confidence displayed in UI (internal only) |
| M4: Closed Beta | Week 12 | 100 users, feedback loop, calibration tracking live |
| M5: Launch | Week 16 | Full rollout with prediction log |

---

## 9. Out of Scope / Parking Lot

- User-adjustable signal weights (interesting, complex, deferred)
- Social sentiment from X/Twitter (noisy, licensing fragile)
- AI-generated plain-language "rationale" for the probability estimate
- Integration with portfolio tracking

---

*End of PRD. See Technical Design doc for architecture and signal implementation. See Design doc for UI specifications.*
