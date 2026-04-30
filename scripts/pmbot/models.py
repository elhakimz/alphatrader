from dataclasses import dataclass, field
from typing import Literal, Dict, Any, List, Optional
from datetime import datetime

@dataclass
class Market:
    id:          str
    title:       str
    YES_price:   float
    NO_price:    float
    fair_value:  float          # derived from Groq agent or external model
    best_ask:    float
    best_bid:    float
    depth_USD:   float
    ttr_hours:   float
    volume_1h:   float
    volume_24h:  float
    category:    str            # e.g. "crypto", "politics", "sports"

@dataclass
class Signal:
    market:      Market
    features:    Dict[str, Any]
    score:       float
    bet_usd:     float
    label:       Literal["ENTER", "KILL", "QUEUE", "KEEP", "STALE_THESIS", "SKIP"]
    created_at:  datetime = field(default_factory=datetime.utcnow)

@dataclass
class ExecutionPlan:
    market_id:        str
    side:             Literal["YES", "NO"]
    edge:             float
    target_size_usd:  float
    limit_price:      float
    order_type:       str  = "limit"
    max_slippage_bps: int  = 50
    expire_seconds:   int  = 300

@dataclass
class ExecutionResult:
    market_id:    str
    title:        str
    side:         Literal["YES", "NO"]
    status:       Literal["filled", "partial", "failed", "timeout"]
    filled_usd:   float
    fill_rate:    float
    avg_price:    float
    slippage_bps: int
    latency_ms:   int

@dataclass
class Position:
    market_id:   str
    title:       str
    side:        Literal["YES", "NO"]
    size_usd:    float
    entry_price: float
    opened_at:   datetime = field(default_factory=datetime.utcnow)
    status:      Literal["open", "closed"] = "open"
    exit_price:  Optional[float] = None
    closed_at:   Optional[datetime] = None
    pnl_usd:     float = 0.0
    pnl_pct:     float = 0.0
