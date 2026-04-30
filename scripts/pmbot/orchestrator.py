import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from .config import settings
from .models import Market, Signal, ExecutionPlan, ExecutionResult, Position
from .db import PmbotDB
from .bus import EventBus

class RiskGuard:
    def __init__(self, db: PmbotDB, bus=None):
        self.db = db
        self.bus = bus
        self.daily_loss_limit = settings.max_daily_loss
        self.max_open_positions = settings.max_open_positions

    async def can_enter(self, signal: Signal, open_positions: List[Position]) -> bool:
        """Enforces all risk limits."""
        # 1. Daily Loss Check
        daily_pnl = self.db.get_daily_pnl()
        if daily_pnl <= -self.daily_loss_limit:
            if self.bus:
                await self.bus.emit("LOG", {"level": "WARNING", "message": f"RiskGuard: Daily loss limit reached: ${daily_pnl}"})
            return False
            
        # 2. Max Open Positions
        if len(open_positions) >= self.max_open_positions:
            return False
            
        # 3. Duplicate Position Check
        if any(p.market_id == signal.market.id for p in open_positions):
            return False
            
        # 4. Exposure Check
        # ...
            
        return True

class ExecutionOrchestrator:
    def __init__(self, db: PmbotDB, bus: EventBus):
        self.db = db
        self.bus = bus
        self.risk_guard = RiskGuard(db, bus)
        self.open_positions: List[Position] = []
        self._load_positions()

    def _load_positions(self):
        rows = self.db.get_open_positions()
        for row in rows:
            self.open_positions.append(Position(
                market_id=row['market_id'],
                title=row.get('title', 'Unknown Market'),
                side=row['side'],
                size_usd=row['size_usd'],
                entry_price=row['entry_price'],
                opened_at=datetime.fromisoformat(row['opened_at']) if isinstance(row['opened_at'], str) else row['opened_at']
            ))

    async def on_signal(self, signal: Signal):
        if signal.label == "ENTER":
            if await self.risk_guard.can_enter(signal, self.open_positions):
                await self.bus.emit("EXECUTION_PLAN_READY", signal)
        elif signal.label == "KILL":
            # Potentially close existing position if sentiment shifted drastically
            pass

    async def on_order_filled(self, result: ExecutionResult):
        pos = Position(
            market_id=result.market_id,
            title=result.title,
            side=result.side,
            size_usd=result.filled_usd,
            entry_price=result.avg_price,
            opened_at=datetime.utcnow()
        )
        self.open_positions.append(pos)
        self.db.insert_position(pos)
        await self.bus.emit("POSITION_OPENED", pos)
        if self.bus:
            await self.bus.emit("LOG", {
                "level": "SUCCESS",
                "message": f"Order filled: {result.side} {result.market_id[:8]} @{result.avg_price}"
            })

    async def on_position_closed(self, market_id: str, exit_price: float):
        # Find and update position
        for i, pos in enumerate(self.open_positions):
            if pos.market_id == market_id:
                pos.status = "closed"
                pos.exit_price = exit_price
                pos.closed_at = datetime.utcnow()
                pos.pnl_usd = (exit_price - pos.entry_price) * (pos.size_usd / pos.entry_price) if pos.side == "YES" else (pos.entry_price - exit_price) * (pos.size_usd / (1 - pos.entry_price))
                # Update DB and local list
                # ... (DB update logic needed in PmbotDB)
                self.open_positions.pop(i)
                break
