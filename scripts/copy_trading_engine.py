import asyncio
import httpx
import uuid
import json
from datetime import datetime, timedelta
from .detector_engine import DetectorDB

DATA_API = "https://data-api.polymarket.com"


class CopyTradingEngine:
    def __init__(self, db: DetectorDB, on_action=None, get_market=None, status_callback=None):
        self.db = db
        self.on_action = on_action
        self.get_market = get_market
        self.status_callback = status_callback
        self.polling_task = None
        self.resolution_task = None
        self.is_running = False

    def _update_status(self, status):
        if self.status_callback:
            self.status_callback(status)

    async def _log(self, level, msg):
        """Helper to print and broadcast logs."""
        print(f"[{level}] [Copy] {msg}")
        if self.on_action:
            asyncio.create_task(self.on_action({"type": "log", "level": level, "message": f"COPY: {msg}"}))

    async def start(self):
        """Start the background loops."""
        if self.is_running:
            return
        self.is_running = True
        self.polling_task = asyncio.create_task(self._poll_loop())
        self.resolution_task = asyncio.create_task(self._resolution_loop())
        await self._log("INFO", "Engine started and loops initialized")

    async def stop(self):
        """Stop all background tasks."""
        self.is_running = False
        if self.polling_task:
            self.polling_task.cancel()
        if self.resolution_task:
            self.resolution_task.cancel()

        try:
            if self.polling_task:
                await self.polling_task
            if self.resolution_task:
                await self.resolution_task
        except asyncio.CancelledError:
            pass
        await self._log("INFO", "Engine stopped")

    async def sync_wallet(self, wallet_address: str):
        """Manually trigger a sync for a specific wallet."""
        await self._sync_wallet_activity(wallet_address)

    async def _resolution_loop(self):
        """Settle PnL for closed markets every 5 minutes."""
        while self.is_running:
            try:
                self._update_status("processing")
                unresolved = self.db.get_unresolved_copy_trades()
                if not unresolved:
                    self._update_status("active")
                    await asyncio.sleep(300)
                    continue

                await self._log("DEBUG", f"Checking resolution for {len(unresolved)} trades...")
                # Group by market_id to minimize API calls
                mids = list(set(t["market_id"] for t in unresolved))
                market_data = {}

                async with httpx.AsyncClient(timeout=10) as client:
                    for mid in mids:
                        try:
                            # Use Gamma API for market status
                            # Note: DATA_API is "https://data-api.polymarket.com" in this file
                            # Gamma is better for resolution status
                            gamma_url = (
                                f"https://gamma-api.polymarket.com/markets/{mid}"
                            )
                            resp = await client.get(gamma_url)
                            if resp.status_code == 200:
                                market_data[mid] = resp.json()
                        except Exception as e:
                            print(f"[Copy] Market status error {mid[:8]}: {e}")

                for trade in unresolved:
                    m = market_data.get(trade["market_id"])
                    if not m or not m.get("closed"):
                        continue

                    outcome = m.get("outcome")
                    status = m.get("status", "").lower()

                    # Canceled / Voided markets: Refund entry cost (PnL = 0)
                    if status == "canceled" or (m.get("closed") and outcome is None):
                        pnl = 0.0
                        self.db.update_copy_trade_pnl(trade["id"], pnl, status="VOIDED")
                        print(f"[Copy] VOIDED {trade['id'][:8]}: Market canceled")
                    else:
                        # Resolution Logic:
                        # outcome is the winning index (e.g. "0", "1", "2")
                        # executed_side stores the index the user bought (from _sync_wallet_activity)
                        user_won = str(outcome) == str(trade["executed_side"])

                        # Calculate PnL
                        # Win: PnL = (size / entry_price) - size
                        # Loss: PnL = -size
                        size = float(trade["executed_size_usdc"])
                        price = float(trade["executed_price"])

                        if user_won:
                            shares = size / price if price > 0 else 0
                            pnl = shares - size
                        else:
                            pnl = -size

                        self.db.update_copy_trade_pnl(
                            trade["id"], pnl, status="RESOLVED"
                        )
                        print(
                            f"[Copy] SETTLED {trade['id'][:8]}: {'WIN' if user_won else 'LOSS'} (${pnl:.2f})"
                        )

                    # Notify frontend
                    if self.on_action:
                        asyncio.create_task(
                            self.on_action(
                                {
                                    "type": "copy_settled",
                                    "session_id": trade["session_id"],
                                    "trade_id": trade["id"],
                                    "pnl": pnl if "pnl" in locals() else 0.0,
                                    "market_id": trade["market_id"],
                                }
                            )
                        )

                await asyncio.sleep(300)
            except Exception as e:
                print(f"[Copy] Resolution loop error: {e}")
                await asyncio.sleep(60)

    async def _poll_loop(self):
        while self.is_running:
            try:
                self._update_status("processing")
                # 1. Get all unique followed wallets across all sessions
                # For v1 simplicity, we'll fetch from the DB directly
                with self.db._get_conn() as conn:
                    rows = conn.execute(
                        "SELECT DISTINCT wallet_address FROM tracked_wallets"
                    ).fetchall()
                    wallets = [r[0] for r in rows]

                if wallets:
                    await self._log("DEBUG", f"Polling activity for {len(wallets)} wallets...")
                    for wallet in wallets:
                        await self._sync_wallet_activity(wallet)

                self._update_status("active")
                # Poll every 60 seconds
                await asyncio.sleep(60)
            except Exception as e:
                print(f"[Copy] Loop error: {e}")
                await asyncio.sleep(10)

    async def _sync_wallet_activity(self, wallet_address: str):
        """Fetch public positions for a wallet and ingest into tracked_trades."""
        url = f"{DATA_API}/positions?user={wallet_address}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    return

                data = resp.json()
                for pos in data:
                    # Use explicit None checks to avoid skipping 0.0 prices
                    p_val = pos.get("curPrice")
                    if p_val is None:
                        p_val = pos.get("avgPrice")
                    if p_val is None:
                        p_val = 0.5

                    price = float(p_val)

                    # Generate stable ID using condition + asset
                    outcome_idx = int(pos.get("outcomeIndex", 0))
                    trade_id = f"{wallet_address}_{pos['conditionId']}_{pos['asset']}"
                    trade = {
                        "id": trade_id,
                        "source_wallet": wallet_address.lower(),
                        "market_id": pos["conditionId"].lower(),
                        "side": str(
                            outcome_idx
                        ),  # Store index as side for multi-outcome support
                        "price": price,
                        "size_usdc": float(
                            pos.get("currentValue") or pos.get("initialValue") or 0
                        ),
                        "ts": datetime.utcnow().isoformat(),
                        "raw_json": pos,
                    }
                    self.db.insert_tracked_trade(trade)

                    # 2. Trigger auto-copy logic
                    await self._evaluate_copy(trade)

        except Exception as e:
            print(f"[Copy] Sync error for {wallet_address[:8]}: {e}")

    async def _evaluate_copy(self, source_trade: dict):
        """Check configs and execute paper copy if criteria met."""
        # Get all enabled configs for this source wallet
        with self.db._get_conn() as conn:
            curr = conn.execute(
                "SELECT * FROM copy_configs WHERE source_wallet = ? AND enabled = 1",
                (source_trade["source_wallet"].lower(),),
            )
            configs = [dict(row) for row in curr.fetchall()]

        for config in configs:
            # 1. Prevent double-copying same source trade for same session
            with self.db._get_conn() as conn:
                exists = conn.execute(
                    "SELECT 1 FROM copied_trades WHERE config_id = ? AND source_trade_id = ?",
                    (config["id"], source_trade["id"]),
                ).fetchone()
                if exists:
                    continue

            # 2. Daily Loss Limit Check
            # Sum PnL of all copied trades for this config in last 24h
            with self.db._get_conn() as conn:
                day_ago = (datetime.utcnow() - timedelta(hours=24)).isoformat()
                row = conn.execute(
                    "SELECT SUM(pnl) FROM copied_trades WHERE config_id = ? AND created_at > ?",
                    (config["id"], day_ago),
                ).fetchone()
                daily_pnl = float(row[0] or 0.0)

                if config.get("daily_loss_limit_usdc") and daily_pnl <= -float(
                    config["daily_loss_limit_usdc"]
                ):
                    print(
                        f"[Copy] SKIP: Daily loss limit reached for {config['id'][:8]} (${daily_pnl})"
                    )
                    continue

            # 3. Market Category Filter
            filters = json.loads(config.get("market_filter_json") or "[]")
            if filters and self.get_market:
                market = self.get_market(source_trade["market_id"])
                if market:
                    cat = (market.get("category") or "").lower()
                    if not any(f.lower() in cat for f in filters):
                        print(f"[Copy] SKIP: Category '{cat}' not in filters {filters}")
                        continue

            # 4. Position Sizing
            copy_size = float(config.get("fixed_amount_usdc") or 10.0)
            if config["allocation_mode"] == "proportional":
                # Simplified: use proportional bps of source size
                copy_size = (
                    source_trade["size_usdc"] * config.get("proportional_bps", 0)
                ) / 10000.0

            # Clamp to max_trade
            if config.get("max_trade_usdc"):
                copy_size = min(copy_size, float(config["max_trade_usdc"]))

            # 5. Execute Paper Trade
            copy_id = str(uuid.uuid4())[:8]
            record = {
                "id": copy_id,
                "config_id": config["id"],
                "session_id": config["session_id"],
                "source_trade_id": source_trade["id"],
                "paper_mode": 1,
                "executed_side": source_trade["side"],
                "executed_price": source_trade["price"],
                "executed_size_usdc": copy_size,
                "status": "EXECUTED",
                "pnl": 0.0,
                "created_at": datetime.utcnow().isoformat(),
            }

            # Persist
            with self.db._get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO copied_trades 
                    (id, config_id, session_id, source_trade_id, paper_mode, executed_side, executed_price, executed_size_usdc, status, pnl, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        record["id"],
                        record["config_id"],
                        record["session_id"],
                        record["source_trade_id"],
                        record["paper_mode"],
                        record["executed_side"],
                        record["executed_price"],
                        record["executed_size_usdc"],
                        record["status"],
                        record["pnl"],
                        record["created_at"],
                    ),
                )

            # Notify via callback
            if self.on_action:
                asyncio.create_task(
                    self.on_action(
                        {
                            "type": "copy_executed",
                            "session_id": record["session_id"],
                            "wallet_address": source_trade["source_wallet"],
                            "market_id": source_trade["market_id"],
                            "side": record["executed_side"],
                            "price": record["executed_price"],
                            "size": record["executed_size_usdc"],
                        }
                    )
                )

            await self._log("INFO", f"EXECUTED: Mirroring {source_trade['source_wallet'][:8]} -> {copy_size} USDC on {source_trade['market_id'][:8]}")
