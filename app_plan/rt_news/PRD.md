# PRD — Polymarket: Real-Time Data + News Edge Module

**Version:** 1.0  
**Status:** Draft  
**Owner:** Product  
**Last Updated:** April 27, 2026

---

## 1. Overview

### 1.1 Problem Statement

Prediction markets are priced by the collective intelligence of traders, but market participants are not equally informed. Breaking news causes rapid, often disproportionate price swings — creating short-lived arbitrage windows for traders who can consume, interpret, and act on information faster than the crowd.

Today, Polymarket users must manually monitor Twitter/X, news aggregators, and market feeds in separate tabs. There is no unified layer that connects raw information velocity to actionable market probability impact. This latency gap is the primary edge leak in the platform.

### 1.2 Solution

A native **Real-Time Data + News Edge** module embedded in the Polymarket app that:

1. Aggregates live signals from Twitter/X, RSS, and breaking news APIs
2. Routes signals through event-specific feeds (elections, crypto, macro, sports, geopolitics)
3. Applies an AI summarizer that scores each news item with a **Probability Impact Score (PIS)** — a 0–100 signal indicating how likely the event is to shift a market's YES/NO probability

### 1.3 Strategic Rationale

- Markets react fast, but retail traders react slowly → information asymmetry is the core edge
- AI-assisted summarization reduces cognitive load on the trader; they spend less time reading, more time deciding
- A dedicated signal layer increases session depth and daily active usage
- Positions Polymarket as the first prediction market with an integrated intelligence layer

---

## 2. Goals & Success Metrics

### 2.1 Primary Goals

| Goal | Metric | Target (6-month) |
|---|---|---|
| Increase trader reaction speed | Median time-to-trade after major news event | < 90 seconds (down from ~8 min) |
| Increase daily active usage | DAU on news module | 40% of trading DAU |
| Drive volume | Trade volume attributable to module sessions | +18% lift |
| Reduce information scatter | Support tickets citing "missed news" | −60% |

### 2.2 Secondary Goals

- Improve new user onboarding: news context helps novice traders understand why markets move
- Reduce overreaction-driven losses via AI "cooldown score" (see Section 5)
- Build proprietary data moat from user engagement with impact scores

---

## 3. Users & Personas

### Persona A — "The Active Trader" (primary)
- Trades 10–50 markets per week
- Monitors multiple news sources manually today
- Pain: context switching, missing fast-moving events
- Need: consolidated feed with instant signal clarity

### Persona B — "The Casual Bettor" (secondary)
- Trades 1–5 markets per week, primarily elections and sports
- Does not actively monitor news
- Pain: doesn't understand why market moved
- Need: plain-language summaries with directional guidance

### Persona C — "The Power Analyst" (tertiary)
- Uses Polymarket as a research signal
- Wants raw data, source attribution, probability delta history
- Need: API access, export, and deep source transparency

---

## 4. Scope

### 4.1 In Scope (v1.0)

- Live news feed aggregation (Twitter/X firehose, RSS, 3 breaking news APIs)
- Event-category routing: Elections, Crypto, Macro/Finance, Geopolitics, Sports
- AI Probability Impact Score per article/tweet
- Per-market news sidebar on existing market detail pages
- Global news feed as standalone module tab
- Push notifications for high-PIS (≥ 75) events on tracked markets
- Sentiment polarity tag (Bullish / Bearish / Neutral for YES position)
- Source credibility tier (Tier 1 / Tier 2 / Unverified)

### 4.2 Out of Scope (v1.0)

- Automated trading triggers based on news signals
- User-generated news submission
- Audio/video news formats
- Multi-language support (English only at launch)
- Backtested accuracy of historical PIS scores (v2 roadmap)

---

## 5. Feature Specifications

### 5.1 Live News Aggregation

**Sources (Priority Order):**

| Source | Type | Latency Target | Notes |
|---|---|---|---|
| Twitter/X Firehose | Social | < 5 seconds | Filtered by curated account list + keywords |
| NewsAPI / GNews | RSS/API | < 30 seconds | Breaking news, wire services |
| CryptoPanic | Domain API | < 15 seconds | Crypto-specific aggregator |
| Politico / AP Wire | RSS | < 60 seconds | Elections & geopolitics |
| Custom RSS Subscriptions | RSS | < 120 seconds | User-configurable (Persona C) |

**Deduplication:** Content hashing across sources; canonical article collapses 3+ duplicate tweets into a single card with source count shown.

**Filtering Logic:**
- Keyword index built per market (from market title + description NLP extraction)
- Each incoming item scored for relevance (cosine similarity ≥ 0.65 threshold)
- Items below threshold silently dropped

### 5.2 Event-Specific Feeds

Five category feeds, each with curated source lists and tuned keyword models:

- **Elections** — AP, Reuters, FiveThirtyEight RSS, election-focused Twitter accounts
- **Crypto** — CryptoPanic, CoinDesk, Decrypt, @whale_alert, on-chain event hooks
- **Macro / Finance** — Bloomberg, FRED data updates, Fed speaker calendars, earnings wires
- **Geopolitics** — Reuters World, BBC Breaking, UN press feeds
- **Sports** — ESPN API, injury reports, official league feeds

Users can subscribe to 1–5 category feeds. Subscriptions are persisted to profile.

### 5.3 AI Probability Impact Score (PIS)

**Definition:** A score from 0–100 representing the estimated probability shift a news item could cause on a directly related market's YES price.

| Score Range | Label | Color | Recommended Action Hint |
|---|---|---|---|
| 0–20 | Noise | Gray | No significant impact expected |
| 21–40 | Low Signal | Blue | Monitor |
| 41–60 | Moderate | Yellow | Consider position review |
| 61–80 | High Signal | Orange | Act before crowd |
| 81–100 | Breaking Edge | Red | Immediate opportunity window |

**Scoring Model Inputs:**
- Source credibility tier weight
- Sentiment polarity and confidence
- Semantic distance to market resolution criteria
- Historical volatility of the market category
- Time proximity to market resolution date (closer = higher weight)
- Recency decay (score degrades 15% per 30 minutes after publication)

**AI Summarizer Output Format (per item):**

```
Headline: [≤ 12 words]
Source: [Name] | Tier [1/2/U] | [Category]
Summary: [2 sentences max — plain English]
Impact: [PIS Score] / 100
Sentiment: [YES Bullish / YES Bearish / Neutral]
Related Markets: [up to 3 linked market cards]
Published: [relative timestamp]
```

### 5.4 Overreaction Cooldown Score

An optional overlay (default OFF, toggled in settings) that displays:

- **Market Velocity Index** — how fast the market moved in the last 15 minutes vs. historical baseline
- **Reversion Probability** — AI estimate that the move will partially reverse within 2 hours
- Displayed as a banner: *"Market moved 12% in 8 min — historical reversion rate: 67%"*

This feature targets Persona A and is positioned as a risk management tool, not trading advice.

### 5.5 Per-Market News Sidebar

On each Market Detail page, a collapsible right-side panel shows:

- Chronological news feed filtered to that specific market
- Last 24 hours by default, expandable to 7 days
- Each item shows PIS, sentiment, and source
- "News influenced this market" banner when a price spike correlates with a high-PIS item (±5 min window)

### 5.6 Push Notifications

Triggered when:
- A tracked market receives a news item with PIS ≥ 75
- A market the user holds a position in receives PIS ≥ 60

Notification format:
```
🔴 Breaking Edge — [Market Title]
[AI Headline]
Market: 54¢ → 71¢ (+17¢)
[Tap to trade]
```

Notification controls: per-market toggle, global frequency cap (max 10/day by default).

---

## 6. User Stories

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-01 | Active Trader | See a live feed of news relevant to my open positions | I can react before the market moves |
| US-02 | Active Trader | See a PIS score on each news item | I can quickly triage which news actually matters |
| US-03 | Casual Bettor | Read a 2-sentence plain-English summary | I don't need to read the full article |
| US-04 | Any User | Filter the news feed by event category | My feed isn't polluted by irrelevant categories |
| US-05 | Power Analyst | Export raw news + PIS data via API | I can backtest my own models |
| US-06 | Active Trader | Receive push notifications on high-PIS events | I don't have to keep the app open |
| US-07 | Active Trader | See the Overreaction Cooldown Score | I avoid chasing fakeout moves |
| US-08 | Any User | See which news caused a market spike | I can understand post-hoc market behavior |

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Feed latency (Twitter/X) | P95 < 8 seconds end-to-end |
| Feed latency (RSS/API) | P95 < 45 seconds end-to-end |
| PIS scoring latency | P95 < 3 seconds per item after ingestion |
| System uptime | 99.9% (≤ 8.7 hours downtime/year) |
| Feed throughput | ≥ 10,000 items/hour at peak |
| Mobile performance | Feed render < 200ms on mid-range device |
| Data retention | Raw articles: 90 days; PIS scores: 2 years |
| GDPR / Privacy | No PII stored from Twitter/X firehose; aggregated signals only |

---

## 8. Dependencies & Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| Twitter/X API access | Tier pricing changes, rate limits | Fallback to Nitter mirrors + Mastodon; negotiate enterprise tier |
| AI model accuracy (PIS) | Low-quality scores erode trust | Human-in-loop audit pipeline; weekly accuracy review vs. actual market moves |
| NewsAPI reliability | API downtime | 3-source redundancy; graceful degradation to RSS-only |
| Regulatory | News aggregation copyright | Display headlines + 2 sentences only; link to source; legal review |
| User behavior | Alert fatigue from notifications | Frequency caps; ML model for notification relevance tuning |

---

## 9. Phased Rollout

### Phase 1 — Private Beta (Weeks 1–6)
- RSS + NewsAPI feed only (no Twitter/X)
- PIS scoring v1 (rule-based, not ML)
- Elections + Crypto categories only
- 500 invited power users

### Phase 2 — Open Beta (Weeks 7–14)
- Twitter/X integration live
- ML-based PIS v2
- All 5 categories
- Per-market sidebar shipped
- Push notifications (iOS only)

### Phase 3 — GA (Week 15+)
- Overreaction Cooldown Score
- Android push notifications
- Power Analyst API access
- Personalization layer (feed learns from user interaction)

---

## 10. Open Questions

1. Should PIS be visible to all users, or gated behind a "Pro" tier?
2. Do we surface the underlying model's confidence interval alongside PIS?
3. Should we partner with a dedicated financial news data provider (e.g., Benzinga, Refinitiv) vs. building on public APIs?
4. What is the legal review timeline for the news aggregation display format?
5. Should the Overreaction Cooldown feature carry a disclaimer to avoid regulatory classification as financial advice?

---

*End of PRD v1.0*
