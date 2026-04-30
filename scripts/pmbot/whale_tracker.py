import asyncio
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
from .config import settings
from .db import PmbotDB

# Example curated wallets from PRD/Design docs
WALLET_REGISTRY = [
    {"address": "0x7e7a7d5f00000000000000000000000000000000", "win_rate": 0.81, "trades": 234, "weight": 1.2, "alias": "Whale_Alpha"},
    {"address": "0xb91e2c0000000000000000000000000000000000", "win_rate": 0.74, "trades": 412, "weight": 1.0, "alias": "Whale_Beta"},
    # ... placeholders for the rest of the 47 wallets
]

class WhaleTracker:
    def __init__(self, db: PmbotDB, bus=None):
        self.db = db
        self.bus = bus
        self.rpc_url = settings.polygon_rpc_url
        self.market_wallet_counts = {} # market_id -> {side -> count}

    async def poll_wallets(self):
        """
        Polls tracked wallets for recent Polymarket activity.
        """
        if not self.rpc_url:
            return

        # Simulate polling logic
        tasks = [self._poll_single_wallet(w) for w in WALLET_REGISTRY]
        results = await asyncio.gather(*tasks)
        
        # Flatten and process
        for activities in results:
            for act in activities:
                self.db.update_wallet_activity(
                    address=act['address'],
                    market_id=act['market_id'],
                    side=act['side'],
                    amount_usd=act['amount_usd'],
                    tx_hash=act['tx_hash']
                )
                self._update_local_counts(act)
                # Dispatch log via event bus if engine is listening
                if self.bus:
                    await self.bus.emit("LOG", {
                        "level": "INFO",
                        "message": f"Whale activity: {act['address'][:8]} → {act['market_id'][:8]} ({act['side']} ${act['amount_usd']})"
                    })

    async def _poll_single_wallet(self, wallet: Dict[str, Any]) -> List[Dict[str, Any]]:
        # This would be the real on-chain scanning logic
        # For now, returning empty to avoid errors without a real RPC
        return []

    def _update_local_counts(self, activity: Dict[str, Any]):
        m_id = activity['market_id']
        side = activity['side']
        if m_id not in self.market_wallet_counts:
            self.market_wallet_counts[m_id] = {"YES": 0, "NO": 0}
        self.market_wallet_counts[m_id][side] += 1

    def get_market_whale_count(self, market_id: str, side: str) -> int:
        return self.market_wallet_counts.get(market_id, {}).get(side, 0)

    async def run(self, interval: int = 60):
        while True:
            try:
                await self.poll_wallets()
            except Exception as e:
                print(f"[WhaleTracker] Error: {e}")
            await asyncio.sleep(interval)
