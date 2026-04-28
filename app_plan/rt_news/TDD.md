# Technical Design — Polymarket: Real-Time Data + News Edge Module

**Version:** 1.0  
**Status:** Draft  
**Owner:** Engineering  
**Last Updated:** April 27, 2026

---

## 1. Architecture Overview

The module is built as a **real-time event-driven pipeline** composed of four layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                            │
│  Twitter/X Firehose  │  RSS/NewsAPI  │  Domain APIs (Crypto)    │
└────────────┬────────────────┬────────────────┬──────────────────┘
             │                │                │
             ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INGESTION LAYER                            │
│         Kafka Topics │ Deduplication │ Source Router            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ENRICHMENT LAYER (AI)                        │
│      NLP Relevance Filter │ PIS Scorer │ Sentiment Tagger       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DELIVERY LAYER                              │
│    WebSocket Push │ REST API │ Push Notifications │ Cache       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENT LAYER                              │
│          React Native App │ Web App │ Power Analyst API         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Ingestion Layer

### 2.1 Source Connectors

Each source is implemented as an independent **connector service** (Node.js microservice) that normalizes output into a canonical `NewsItem` schema before publishing to Kafka.

**Canonical NewsItem Schema:**

```typescript
interface NewsItem {
  id: string;                    // SHA-256 hash of (source + url + publishedAt)
  source: {
    name: string;
    type: "twitter" | "rss" | "api";
    tier: 1 | 2 | "unverified";
    url: string;
  };
  content: {
    headline: string;            // max 280 chars
    body: string | null;         // first 500 chars of article body
    url: string;
    imageUrl: string | null;
  };
  metadata: {
    publishedAt: ISO8601;
    ingestedAt: ISO8601;
    category: CategoryEnum;
    rawKeywords: string[];
  };
  enrichment: null | NewsItemEnrichment;  // populated post-AI pipeline
}

type CategoryEnum = 
  | "elections" 
  | "crypto" 
  | "macro" 
  | "geopolitics" 
  | "sports" 
  | "general";
```

### 2.2 Twitter/X Connector

- Uses **Twitter/X Filtered Stream API v2** with enterprise access
- Filter rules defined per category keyword set (updated via rules API, no restart required)
- Backpressure handling: if Kafka is slow, drop items with category = "general" first
- Reconnect logic: exponential backoff (1s → 2s → 4s → 32s max) on disconnect
- Rate limit budget: 500,000 tweets/month allocated across categories

```typescript
// Filter rule example for Elections category
const electionRules = [
  { value: "context:7.10061214224849714176", tag: "election_events" },
  { value: "(election OR ballot OR polling OR senate) -is:retweet lang:en", tag: "election_keywords" },
  { value: "from:AP from:Reuters from:FiveThirtyEight", tag: "election_sources" }
];
```

### 2.3 RSS / NewsAPI Connector

- **Polling interval:** 30 seconds per feed
- Managed via a **feed registry** (PostgreSQL table with cron scheduling)
- Etag and Last-Modified header caching to avoid re-processing unchanged feeds
- Feed health monitoring: auto-disable feeds with >5 consecutive fetch errors, alert PagerDuty

### 2.4 Deduplication Service

- **Primary dedup:** SHA-256 hash of normalized URL (strip UTM params, canonicalize)
- **Semantic dedup:** MinHash LSH on headline tokens — items with Jaccard similarity > 0.85 within 10-minute window are collapsed
- Dedup window: 24 hours (Redis TTL-based)
- Collapsed items stored as `duplicateGroup` with original + count for display

```typescript
// Dedup pipeline (Redis)
async function deduplicateItem(item: NewsItem): Promise<"new" | "duplicate"> {
  const urlHash = sha256(normalizeUrl(item.content.url));
  const exists = await redis.set(`dedup:url:${urlHash}`, "1", "EX", 86400, "NX");
  if (!exists) return "duplicate";

  const minhash = computeMinHash(tokenize(item.content.headline));
  const similar = await lshIndex.query(minhash, 0.85);
  if (similar.length > 0) {
    await incrementDuplicateGroup(similar[0].id);
    return "duplicate";
  }

  await lshIndex.insert(item.id, minhash);
  return "new";
}
```

---

## 3. Kafka Topic Architecture

```
news.raw.twitter          # Raw firehose items, unfiltered
news.raw.rss              # Raw RSS/API items
news.deduped              # Post-dedup canonical items
news.enriched             # Post-AI pipeline items (PIS + sentiment)
news.market-matched       # Items matched to ≥1 market
notifications.triggers    # High-PIS items that trigger push notifications
```

**Partitioning:**
- `news.enriched` partitioned by `category` (5 partitions) for parallel consumption
- `news.market-matched` partitioned by `marketId` hash for per-market stream isolation

**Retention:**
- `news.raw.*`: 24 hours (high volume, transient)
- `news.enriched`: 7 days
- `news.market-matched`: 90 days

---

## 4. Enrichment Layer (AI Pipeline)

### 4.1 Pipeline Overview

```
news.deduped
    │
    ├─► [Relevance Filter] ─► Discard (< 0.65 similarity)
    │
    ├─► [Headline + Summary Generator]
    │
    ├─► [Sentiment Tagger]
    │
    ├─► [Market Matcher]
    │
    └─► [PIS Scorer]
              │
              ▼
        news.enriched
```

Each stage is a **Kafka Streams processor** running as a stateless microservice, horizontally scalable.

### 4.2 Relevance Filter

- Uses `text-embedding-3-small` (OpenAI) for low-latency embedding generation
- Each market maintains a **keyword index** (noun phrases extracted from title + description at market creation)
- Cosine similarity computed between news item embedding and market keyword centroid
- Items below threshold (0.65) are discarded from market-matched stream but retained in category feeds

**Embedding Cache:** Market embeddings cached in Redis with 1-hour TTL, refreshed on market description change.

### 4.3 AI Summarizer

Calls `claude-sonnet-4-20250514` via Anthropic API with structured output prompt:

```
System: You are a financial news analyst for a prediction market platform.
Summarize the following news item in exactly this JSON format, no other text:
{
  "headline": "<12 words max, active voice>",
  "summary": "<2 sentences, plain English, no jargon>",
  "sentiment": "bullish_yes | bearish_yes | neutral",
  "sentimentConfidence": 0.0-1.0,
  "keyEntities": ["<entity1>", "<entity2>"]
}

User: [raw article content]
```

**Latency budget:** 2.5 seconds P95  
**Fallback:** If API > 3s or errors, use extractive summary (first 2 sentences of body) and sentiment = "neutral"

### 4.4 Probability Impact Score (PIS)

Computed as a weighted composite of 6 sub-signals:

```typescript
interface PISComponents {
  sourceCredibility: number;     // 0-1: Tier 1 = 1.0, Tier 2 = 0.6, Unverified = 0.2
  sentimentStrength: number;     // 0-1: confidence score from sentiment model
  marketRelevance: number;       // 0-1: cosine similarity score
  categoryVolatility: number;    // 0-1: historical avg price move per news event in category
  timeToResolution: number;      // 0-1: inverse decay (closer to resolution = higher)
  recencyDecay: number;          // 0-1: 1.0 at publish, -15% per 30 minutes
}

const PIS_WEIGHTS = {
  sourceCredibility: 0.20,
  sentimentStrength: 0.25,
  marketRelevance: 0.25,
  categoryVolatility: 0.15,
  timeToResolution: 0.10,
  recencyDecay: 0.05,
};

function computePIS(components: PISComponents): number {
  const raw = Object.entries(PIS_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + components[key as keyof PISComponents] * weight;
  }, 0);
  return Math.round(raw * 100); // 0-100
}
```

**PIS Decay:** Scheduled job updates PIS every 15 minutes for items < 4 hours old. Items > 4 hours are frozen.

### 4.5 Market Matcher

- Matches enriched items to markets using pre-built inverted keyword index (Elasticsearch)
- Index updated on market creation / edit webhook
- Returns top 3 markets by relevance score
- Items with no market match (< 0.65 for all markets) are routed to category feed only

### 4.6 Overreaction Cooldown Score

Computed on-demand (not streamed) when user opens market detail:

```typescript
interface CooldownScore {
  marketVelocityIndex: number;      // Current 15-min price move / historical baseline
  reversionProbability: number;     // ML estimate of mean reversion within 2h
  triggerEvent: string | null;      // News headline that caused the spike
  dataPoints: number;               // Historical samples used in calculation
}
```

- Uses logistic regression model trained on 18 months of Polymarket price + news data
- Retrained weekly via scheduled MLflow job
- Served via separate `/api/v1/markets/:id/cooldown` endpoint (not streamed)

---

## 5. Data Storage

### 5.1 Storage Architecture

| Store | Technology | Purpose |
|---|---|---|
| Raw article store | S3 + Parquet | Long-term archival, Power Analyst API |
| Enriched items DB | PostgreSQL | Queryable feed, market-item associations |
| Live feed cache | Redis Sorted Set | Per-category and per-market live feeds |
| Search index | Elasticsearch | Market ↔ news matching, full-text search |
| Embeddings | Pinecone | Semantic similarity queries |
| Notification queue | Redis Queue + BullMQ | Push notification dispatch |

### 5.2 PostgreSQL Schema (core tables)

```sql
-- Enriched news items
CREATE TABLE news_items (
  id              TEXT PRIMARY KEY,         -- SHA-256 hash
  source_name     TEXT NOT NULL,
  source_tier     SMALLINT NOT NULL,        -- 1, 2, or 0 for unverified
  source_type     TEXT NOT NULL,
  category        TEXT NOT NULL,
  headline        TEXT NOT NULL,
  summary         TEXT,
  url             TEXT NOT NULL,
  image_url       TEXT,
  sentiment       TEXT,
  sentiment_conf  REAL,
  pis_score       SMALLINT,                 -- 0-100
  published_at    TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL,
  pis_frozen_at   TIMESTAMPTZ,
  duplicate_group TEXT,
  duplicate_count SMALLINT DEFAULT 1
);

CREATE INDEX idx_news_category_published ON news_items (category, published_at DESC);
CREATE INDEX idx_news_pis ON news_items (pis_score DESC) WHERE pis_score >= 60;

-- Market ↔ news associations
CREATE TABLE market_news_links (
  market_id       TEXT NOT NULL,
  news_item_id    TEXT NOT NULL REFERENCES news_items(id),
  relevance_score REAL NOT NULL,
  linked_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (market_id, news_item_id)
);

CREATE INDEX idx_mnl_market ON market_news_links (market_id, linked_at DESC);

-- User feed subscriptions
CREATE TABLE user_feed_subscriptions (
  user_id         TEXT NOT NULL,
  category        TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, category)
);
```

### 5.3 Redis Feed Cache

Per-category and per-market feeds stored as **Redis Sorted Sets** (score = Unix timestamp):

```
news:feed:category:elections    → ZSET {newsItemId: timestamp}
news:feed:market:{marketId}     → ZSET {newsItemId: timestamp}
news:feed:global                → ZSET {newsItemId: timestamp}
```

TTL: 24 hours. Max size: 500 items per set (ZPOPMIN on overflow).

---

## 6. Delivery Layer

### 6.1 WebSocket API (Real-Time Feed)

**Endpoint:** `wss://api.polymarket.com/v1/news/stream`

**Connection Protocol:**

```typescript
// Client subscribe message
{
  "type": "subscribe",
  "channels": ["category:elections", "category:crypto", "market:0x1234..."]
}

// Server push message
{
  "type": "news_item",
  "channel": "category:elections",
  "data": NewsItemEnrichment,
  "timestamp": ISO8601
}

// Server heartbeat (every 30s)
{
  "type": "heartbeat",
  "timestamp": ISO8601
}
```

**Infrastructure:** Socket.io cluster behind Redis pub/sub adapter (horizontal scaling). Max 100,000 concurrent connections per region.

### 6.2 REST API (Historical + Power Analyst)

```
GET /api/v1/news/feed
  ?category=elections,crypto
  &minPIS=60
  &limit=50
  &cursor={pagination_cursor}
  &from={ISO8601}
  &to={ISO8601}

GET /api/v1/news/market/:marketId
  ?limit=25
  &from={ISO8601}

GET /api/v1/news/item/:newsItemId
  (full detail including duplicate group, raw content)

GET /api/v1/markets/:marketId/cooldown
  (Overreaction Cooldown Score, computed on demand)
```

**Rate Limits:**
- Standard users: 60 req/min
- Power Analyst API (token-authenticated): 600 req/min, bulk export endpoint

### 6.3 Push Notification Service

**Stack:** Firebase Cloud Messaging (Android + Web) + APNs (iOS)

**Dispatch Flow:**

```
notifications.triggers (Kafka)
       │
       ▼
 Notification Worker (BullMQ)
       │
       ├─► User preference lookup (PostgreSQL)
       ├─► Frequency cap check (Redis counter, 24h window)
       ├─► Dedup check (prevent duplicate alerts, 15-min window)
       └─► FCM/APNs dispatch
```

**Delivery guarantees:** At-least-once with idempotency key per `(userId, newsItemId)`.

---

## 7. Scalability & Performance

### 7.1 Throughput Estimates

| Metric | Steady State | Peak (breaking news) |
|---|---|---|
| Items ingested/min | 800 | 8,000 |
| AI enrichment calls/min | 400 | 2,000 |
| WebSocket messages/sec | 1,200 | 15,000 |
| Push notifications/min | 50 | 5,000 |

### 7.2 Scaling Strategy

- **Kafka consumer groups:** Auto-scale enrichment workers (k8s HPA on consumer lag metric)
- **AI API calls:** Batched in groups of 20 with 500ms debounce; Claude API rate limit is 4,000 RPM (Tier 3)
- **WebSocket:** Socket.io cluster, 5 nodes minimum, auto-scale on connection count
- **Database:** PostgreSQL read replicas for REST API; primary for writes only

### 7.3 Latency Budget (end-to-end)

```
Source publication
    │  0-5s    Twitter/X connector
    ▼
Kafka ingestion
    │  0-50ms  Deduplication
    ▼
Deduped queue
    │  0-2.5s  AI enrichment (headline + PIS + sentiment)
    ▼
Enriched queue
    │  0-100ms Market matching
    ▼
WebSocket dispatch ──────────────────► Client render
    Total P95: < 8 seconds (Twitter), < 50 seconds (RSS)
```

---

## 8. Security & Privacy

- **Twitter/X Firehose:** No user PII stored; only tweet content, author handle, and public metadata
- **API Authentication:** JWT (standard users) + API key (Power Analyst) with RBAC
- **Data at rest:** PostgreSQL encrypted (AES-256); S3 server-side encryption
- **Data in transit:** TLS 1.3 everywhere
- **GDPR:** User subscription preferences deletable on account deletion; no personal data in news pipeline
- **Source copyright:** Display summary (≤ 2 sentences) + link only; no full article storage for display

---

## 9. Observability

### 9.1 Metrics (Prometheus + Grafana)

```
# Feed pipeline
news_items_ingested_total{source, category}
news_items_deduplicated_total{reason}
news_items_enriched_total{status}          # success / ai_fallback / error
enrichment_latency_seconds{percentile}

# AI pipeline
pis_score_distribution{bucket}
ai_api_latency_seconds{model}
ai_api_errors_total{error_type}

# Delivery
websocket_connections_active
websocket_messages_sent_total{channel_type}
push_notifications_sent_total{platform, status}
```

### 9.2 Alerting (PagerDuty)

| Alert | Threshold | Severity |
|---|---|---|
| Kafka consumer lag | > 10,000 messages | P1 |
| AI enrichment error rate | > 5% over 5 min | P1 |
| Twitter/X connector down | > 60 seconds disconnected | P2 |
| Feed latency (P95) | > 15 seconds | P2 |
| PIS scoring stopped | No items enriched in 5 min | P1 |

### 9.3 AI Model Quality Monitoring

Weekly automated job:
1. Pull all news items with PIS ≥ 60 from the prior week
2. Join with market price time series (±30 min window from publication)
3. Compute: what % of "High Signal" + "Breaking Edge" items were followed by a ≥5% price move?
4. Target accuracy: > 55% (above random baseline of ~30% for this category)
5. Alert if accuracy drops below 45% for 2 consecutive weeks → trigger model review

---

## 10. Infrastructure & Deployment

**Cloud:** AWS (us-east-1 primary, eu-west-1 secondary for EU latency)

```
┌─────────────────────────────────────────┐
│              EKS Cluster                │
│  ┌──────────┐  ┌──────────┐            │
│  │Connectors│  │Enrichment│  Workers   │
│  │ (5 pods) │  │ (10 pods)│            │
│  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐            │
│  │WS Server │  │REST API  │            │
│  │ (5 pods) │  │ (3 pods) │            │
│  └──────────┘  └──────────┘            │
└─────────────────────────────────────────┘
        │              │
        ▼              ▼
   MSK (Kafka)    ElastiCache (Redis)
        │
        ▼
   RDS PostgreSQL (Multi-AZ)
   S3 (raw archive)
   Pinecone (embeddings)
   Elasticsearch (OpenSearch)
```

**CI/CD:** GitHub Actions → ECR → ArgoCD (GitOps)  
**IaC:** Terraform, all infra versioned  
**Environments:** dev / staging / prod with full pipeline in each

---

## 11. Open Technical Questions

1. **Embedding model cost at scale:** At 10K items/hour, `text-embedding-3-small` costs ~$0.002/1K tokens. Estimate: ~$150/month. Acceptable, but consider self-hosted `all-MiniLM-L6-v2` if volume 10x.
2. **PIS model v2:** Move from weighted rules to a supervised ML model (XGBoost) trained on price-reaction labels. Requires 3 months of labeled data from Phase 1.
3. **Twitter/X API cost:** Enterprise Filtered Stream is ~$42,000/month at full volume. Evaluate Mastodon + Bluesky firehose as partial fallbacks.
4. **Elasticsearch vs. pgvector:** If embedding query volume is low (<1K/sec), pgvector extension on PostgreSQL may replace Pinecone to reduce infrastructure surface area.
5. **Multi-region WebSocket:** Should WS connections be terminated at edge (CloudFront + Lambda@Edge) or stay centralized?

---

*End of Technical Design v1.0*
