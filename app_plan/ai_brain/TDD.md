# Technical Design: AI Probability Engine ("Edge Brain")
### Polymarket Desktop App
**Status:** Draft v0.1
**Author:** —
**Last Updated:** 2026-04-27

---

## 0. Document Purpose

This document describes the technical architecture, data pipeline, model design, and API contracts for the Edge Brain feature. It surfaces tradeoffs at every major decision point rather than pretending there is one obvious answer.

Read the PRD first. This doc assumes that context.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     DESKTOP CLIENT                           │
│  Edge Brain Panel → REST poll → /api/edge-brain/{market_id} │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EDGE BRAIN SERVICE                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Historical  │  │    News      │  │  Macro Indicators │  │
│  │  Signal Svc  │  │  Signal Svc  │  │  Signal Svc       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         └─────────────────┼──────────────────┘             │
│                           ▼                                 │
│                  ┌─────────────────┐                        │
│                  │  Ensemble Layer │                        │
│                  │  (combiner +    │                        │
│                  │   calibration)  │                        │
│                  └────────┬────────┘                        │
│                           ▼                                 │
│                  ┌─────────────────┐                        │
│                  │  Output Layer   │                        │
│                  │  Edge Score     │                        │
│                  │  Confidence     │                        │
│                  └────────┬────────┘                        │
│                           ▼                                 │
│                  ┌─────────────────┐                        │
│                  │  Result Cache   │ (Redis, 15min TTL)     │
│                  └─────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
   ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐
   │ Polymarket  │   │  News API    │   │  Macro Data API  │
   │ Historical  │   │  (TBD)       │   │  (FRED / WB)     │
   │ Resolution  │   └──────────────┘   └──────────────────┘
   │ Data        │
   └─────────────┘
```

---

## 2. Signal Architecture

Each signal is an independent service that:
- Accepts a `MarketContext` object
- Returns a `SignalOutput { probability: float, weight: float, confidence: float, metadata: dict }`
- Fails gracefully (if a signal is unavailable, the ensemble runs with remaining signals)

> ⚠️ **Tradeoff T-TECH-01:** Running all three signals in parallel is fast but adds complexity (fan-out, partial failure handling). Running them sequentially is simpler but slow (~3–6s per request). **Recommendation: parallel fan-out with timeout of 4s per signal; missing signals logged and excluded from ensemble.**

### 2.1 Signal 1: Historical Base Rate

**Purpose:** Establish a base rate from how similar markets have resolved historically.

**Approach:**
1. Classify the market into a category (Politics/Policy/Econ/Sports) and subcategory using market title + tags.
2. Query historical Polymarket resolutions for markets in same category with similar resolution dates and initial odds range.
3. Compute resolution rate (% that resolved YES) weighted by recency and similarity.

**Data Source:** Polymarket historical data (resolution outcomes + market metadata)

**Naive implementation:** Bucket by category → compute mean resolution rate → use as base probability.

**Improved implementation:** Logistic regression on features: category, market age, initial price, time-to-resolution, liquidity tier.

> ⚠️ **Tradeoff T-TECH-02:** Naive bucketing is fast to ship but crude (all "election" markets are not the same). Regression is better but requires labeled training data and regular retraining. **Ship naive, plan regression for M4.**

> ⚠️ **Concern:** Polymarket historical data availability and licensing is an assumption (PRD A1). If we don't have it internally, we must either scrape (risky, ToS) or use a third-party archive. Clarify with data team before architecture is finalized.

**Output example:**
```json
{
  "signal": "historical",
  "probability": 0.54,
  "weight": 0.35,
  "confidence": 0.62,
  "metadata": {
    "sample_size": 142,
    "category": "us_politics",
    "similarity_method": "bucket_v1"
  }
}
```

---

### 2.2 Signal 2: News Sentiment

**Purpose:** Adjust the base rate based on recent news coverage direction and volume.

**Approach:**
1. Extract keywords from market title using NLP (named entity recognition + topic extraction).
2. Query news API for articles in the past 7 days matching those keywords.
3. Run sentiment analysis (positive/negative/neutral per article, weighted by source credibility and recency).
4. Aggregate into a sentiment score (−1 to +1) and translate to a probability adjustment.

**Data Source Options (pick one):**

| Option | Pros | Cons |
|--------|------|------|
| GDELT | Free, massive coverage, global | Noisy, complex API, entity matching is hard |
| NewsAPI | Clean API, good coverage | Paid, English-heavy, 1-month lookback on free tier |
| Bing News Search API | Good quality | Expensive at scale |
| Diffbot News | High quality extraction | Very expensive |

> ⚠️ **Open Question OQ-TECH-01:** Which news API? GDELT is free but operationally complex. NewsAPI is clean but limited. Cost scales with query volume (one query per market per refresh). Need to model: [markets_active] × [refreshes/day] × [cost/query] before committing.

**Sentiment → Probability Translation:**
The hardest part is converting a sentiment score into a probability delta. A naive approach: `prob_delta = sentiment_score × 0.10` (max ±10pp adjustment). This is a tunable constant.

> ⚠️ **Concern:** News sentiment is noisy and can be gamed. A flood of negative articles doesn't always mean a YES outcome is less likely. The translation function needs empirical calibration, not just a reasonable-sounding constant.

**Output example:**
```json
{
  "signal": "news_sentiment",
  "probability": 0.61,
  "weight": 0.35,
  "confidence": 0.45,
  "metadata": {
    "articles_analyzed": 23,
    "sentiment_score": 0.31,
    "top_sources": ["Reuters", "AP", "WSJ"],
    "query_keywords": ["Federal Reserve", "rate cut", "2026"]
  }
}
```

---

### 2.3 Signal 3: Macro Indicators

**Purpose:** Factor in economic or political context that may shift outcome probability independent of news.

**Approach:**
- Identify which macro indicators are relevant to a given market category (e.g., GDP growth → economic policy markets; polling averages → election markets; inflation → rate decision markets).
- Pull latest indicator values from FRED, World Bank, or category-specific sources (e.g., FiveThirtyEight-style polling aggregates for politics).
- Map indicator state to a probability modifier using predefined rules or a learned model.

> ⚠️ **Tradeoff T-TECH-03:** Macro indicators are slow-moving and high-quality but hard to map reliably to market-specific probabilities. The mapping is largely domain knowledge, not data-driven — which means it's brittle and opinionated. v1 should be transparent about this: expose the indicator and its direction, but weight it conservatively (lowest weight in ensemble). Consider hardcoding only 3–5 indicator types per category for v1.

**Data Sources:** FRED API (free, reliable for US economic data), World Bank API (free, slower cadence), polling aggregates (licensing TBD).

**Output example:**
```json
{
  "signal": "macro",
  "probability": 0.57,
  "weight": 0.30,
  "confidence": 0.38,
  "metadata": {
    "indicators_used": ["cpi_yoy", "fed_funds_rate"],
    "indicator_direction": "dovish",
    "notes": "CPI below 3% for 3 consecutive months; rate cut historically probable"
  }
}
```

---

## 3. Ensemble Layer

### 3.1 Combining Signals

The ensemble combines signal outputs into a single model probability.

**Method: Weighted Average (v1)**
```
model_probability = Σ(signal_i.probability × signal_i.weight) / Σ(signal_i.weight)
```

Weights are initialized as:
- Historical: 0.35
- News Sentiment: 0.35
- Macro: 0.30

These are **starting points, not final values.** They should be tuned empirically once we have resolution data.

> ⚠️ **Tradeoff T-TECH-04:** Weighted average is interpretable and simple. More sophisticated methods (Bayesian updating, logistic stacking) may outperform but require more training data and add black-box complexity. Given trust is critical for this feature, interpretability wins in v1.

### 3.2 Calibration

Raw model probabilities are almost certainly miscalibrated out of the box (e.g., a 70% estimate might actually resolve YES only 55% of the time). We must apply calibration.

**Calibration Method:**
- Platt Scaling (logistic regression on raw probability → calibrated probability)
- Requires: a held-out set of resolved markets with historical model predictions
- Problem: We don't have this at launch.

> ⚠️ **Bootstrapping Problem:** We can't calibrate before we have resolution data, but we're shipping before we have resolution data. Options:
> 1. Ship uncalibrated, display a "Beta — model under calibration" label
> 2. Pre-calibrate using published prediction market accuracy benchmarks as a prior
> 3. Use Brier score diagnostics after 30 days of resolved markets, retrain
>
> **Recommendation: Option 1 + Option 3. Be honest with users about the model's early-stage status.**

---

## 4. Output: Edge Score and Confidence

### 4.1 Edge Score

```
edge_score = model_probability - market_price
```

Displayed as a signed percentage point delta (e.g., `+12pp` or `−7pp`).

> ⚠️ **Decision Needed:** PRD OQ-01. Raw delta (+12pp) is honest but gives no sense of whether that's statistically meaningful. A market with 90% confidence +12pp is very different from 20% confidence +12pp. Consider: `edge_score_display = edge_delta × confidence_level` — this rewards high-confidence edges. Needs product alignment.

**Tier labels (optional UX layer):**
- `|edge| < 5pp` → "Efficient" (no edge)
- `5 ≤ |edge| < 12pp` → "Mild Edge"
- `|edge| ≥ 12pp` → "Strong Edge"

Thresholds are provisional. Calibrate against real data.

### 4.2 Confidence Level

Confidence reflects model certainty, not probability certainty. It is derived from:

1. **Signal agreement:** If all three signals agree directionally, confidence is higher.
2. **Signal data quality:** More articles, larger historical sample = higher confidence.
3. **Market age / liquidity:** Very thin markets with little history → low confidence.

Formula:
```
confidence = 0.4 × signal_agreement_score
           + 0.35 × avg(signal_i.confidence)
           + 0.25 × data_quality_score
```

> ⚠️ **Concern:** This formula is illustrative, not validated. Every component (signal agreement, data quality) needs a concrete operationalization before we implement. "Data quality score" especially — what counts as high quality for news vs. historical data is different. This needs a design session before dev starts.

Displayed as: Low / Medium / High (or as a 0–100% scale — TBD with Design).

---

## 5. API Contract

### `GET /api/v1/edge-brain/{market_id}`

**Response:**
```json
{
  "market_id": "0x1234...",
  "market_price": 0.62,
  "model_probability": 0.74,
  "edge_score": 0.12,
  "edge_tier": "strong",
  "confidence": {
    "level": "medium",
    "score": 0.54
  },
  "signals": {
    "historical": {
      "probability": 0.71,
      "weight": 0.35,
      "confidence": 0.68,
      "sample_size": 142
    },
    "news_sentiment": {
      "probability": 0.79,
      "weight": 0.35,
      "confidence": 0.44,
      "articles": 23,
      "sentiment": 0.38
    },
    "macro": {
      "probability": 0.70,
      "weight": 0.30,
      "confidence": 0.38,
      "indicators": ["cpi_yoy", "fed_funds_rate"]
    }
  },
  "last_updated": "2026-04-27T10:30:00Z",
  "market_scope": "supported",
  "disclaimer": "Experimental. Not financial advice."
}
```

**Error states:**
- `market_scope: "unsupported"` — market type not in v1 scope
- `market_scope: "insufficient_data"` — market too new or too thin
- `429` — rate limit (compute-heavy endpoint)
- `503` — one or more signal services unavailable (partial results may be returned)

---

## 6. Infrastructure & Caching

| Component | Technology | Notes |
|-----------|-----------|-------|
| Edge Brain Service | Python (FastAPI) | ML-friendly runtime |
| Signal execution | Async parallel (asyncio) | 4s per-signal timeout |
| Result cache | Redis | 15-min TTL, keyed by market_id |
| Model storage | S3 (serialized model files) | Versioned |
| News API | TBD | See OQ-TECH-01 |
| Historical data | PostgreSQL | Internal |
| Macro data | FRED API (external) | Cached 24h |

**Cache Strategy:**
- Cache at the market level, not the user level.
- Invalidate on Polymarket price changes >3pp (webhook or polling).
- Stale-while-revalidate acceptable given 15-min TTL.

---

## 7. Data Privacy & Model Governance

- No user-level inputs feed the model (it's market-level only). Low PII risk.
- Model version must be logged with every prediction for auditability.
- Predictions + resolutions stored for calibration. No PII attached.
- Regular model review cadence: monthly for first 6 months.

---

## 8. Open Technical Questions (Summary)

| ID | Question | Blocking? |
|----|----------|-----------|
| OQ-TECH-01 | Which news API? | Yes — needed before Signal 2 dev |
| OQ-TECH-02 | Historical data source and licensing? | Yes — needed before Signal 1 dev |
| OQ-TECH-03 | Calibration approach pre-launch? | High — affects user trust messaging |
| OQ-TECH-04 | Confidence formula operationalization | High — needed before M3 |
| OQ-TECH-05 | Edge Score display: delta vs. scaled vs. tiered? | Medium — product decision |

---

*End of Technical Design. See PRD for requirements context and Design doc for UI specifications.*
