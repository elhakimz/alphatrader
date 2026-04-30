import math
from typing import List, Dict, Any, Optional, Tuple
from .config import settings
from .models import Market, Signal

class MarketScanner:
    def __init__(self, db, bus=None):
        self.db = db
        self.bus = bus
        self.penalties = {} # market_id -> multiplier

    def hard_filter(self, market: Market) -> bool:
        """Applies basic cutoffs for gap, depth, and time-to-resolution."""
        # Gap filter
        gap = abs(market.YES_price - market.fair_value)
        if gap < settings.gap_min or gap > settings.gap_max:
            return False
            
        # Depth filter
        if market.depth_USD < settings.depth_min_usd:
            return False
            
        # TTR filter
        if market.ttr_hours < settings.ttr_min_hours or market.ttr_hours > settings.ttr_max_hours:
            return False
            
        return True

    def extract_features(self, market: Market, whale_tracker) -> Dict[str, Any]:
        """Extracts technical and social features for scoring."""
        gap = market.YES_price - market.fair_value
        side = "YES" if gap < 0 else "NO" # Simplified: if fair value > market price, buy YES
        
        whale_count = whale_tracker.get_market_whale_count(market.id, side)
        
        # Simulated volume spike detection
        vol_spike = market.volume_1h > (market.volume_24h / 12)
        
        return {
            "gap": abs(gap),
            "edge": abs(gap) / market.YES_price if side == "YES" else abs(gap) / market.NO_price,
            "side": side,
            "whale_count": whale_count,
            "vol_spike": vol_spike,
            "depth_USD": market.depth_USD
        }

    def score_and_size(self, market: Market, features: dict[str, Any], bankroll: float) -> tuple[float, float]:
        """Calculates a composite score and Kelly-sized bet amount."""
        # Weighted score
        score = (
            features['edge'] * 0.4 +
            (features['whale_count'] / 5.0) * 0.3 + # Max 5 whales for scaling
            (1.0 if features['vol_spike'] else 0.0) * 0.2 +
            (min(features['depth_USD'], 5000) / 5000.0) * 0.1
        )
        
        # Apply penalties from feedback loop
        penalty = self.penalties.get(market.id, 1.0)
        score *= penalty
        
        # Kelly Sizing
        # Kelly % = (p * b - q) / b where b is odds-1, p is win prob, q is loss prob
        # For simplicity, using a simplified Kelly-like sizing based on edge and score
        win_prob = 0.5 + (features['edge'] * 2) # Crude estimate
        win_prob = min(max(win_prob, 0.51), 0.95)
        
        odds = 1.0 / (market.YES_price if features['side'] == "YES" else market.NO_price)
        b = odds - 1
        q = 1 - win_prob
        
        kelly_pct = (win_prob * b - q) / b if b > 0 else 0
        kelly_pct = max(0, kelly_pct)
        
        # Apply caps
        bet_size = bankroll * kelly_pct * settings.kelly_cap
        bet_size = min(bet_size, settings.max_bet_usd)
        
        return score, bet_size

    async def label_market(self, score: float, features: Dict[str, Any], market: Market) -> str:
        """Labels a market based on its score and additional confirmation needs."""
        label = "KILL"
        if score >= settings.enter_threshold:
            if features['whale_count'] >= 1 or features['edge'] > 0.15:
                label = "ENTER"
            else:
                label = "QUEUE"
        elif score > 0.02:
            label = "KEEP"
        
        if label in ["ENTER", "QUEUE"] and self.bus:
            await self.bus.emit("LOG", {
                "level": "INFO",
                "message": f"Signal generated: {label} {market.title[:30]} (Score: {score:.2f})"
            })
            
        return label

    def decay_penalties(self):
        """Gradually decays penalties from the feedback loop."""
        for m_id in list(self.penalties.keys()):
            self.penalties[m_id] = min(1.0, self.penalties[m_id] + settings.penalty_decay_per_scan)
            if self.penalties[m_id] >= 1.0:
                del self.penalties[m_id]
