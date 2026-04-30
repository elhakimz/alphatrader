import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from .models import Signal, Position, ExecutionResult

class PmbotDB:
    def __init__(self, db_path: str = None):
        if db_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            db_path = os.path.join(base_dir, "pmbot.db")
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            # Wallet activity log
            conn.execute("""
                CREATE TABLE IF NOT EXISTS wallet_activity (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    address     TEXT NOT NULL,
                    market_id   TEXT NOT NULL,
                    side        TEXT NOT NULL,
                    amount_usd  REAL,
                    tx_hash     TEXT UNIQUE,
                    created_at  DATETIME DEFAULT (datetime('now'))
                )
            """)

            # Groq consensus votes
            conn.execute("""
                CREATE TABLE IF NOT EXISTS consensus_votes (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id   TEXT NOT NULL,
                    agent_id    INTEGER,
                    vote        TEXT,           -- YES_ENTER / NO_ENTER / SKIP
                    reason      TEXT,
                    latency_ms  INTEGER,
                    model       TEXT DEFAULT 'llama-3.3-70b-versatile',
                    created_at  DATETIME DEFAULT (datetime('now'))
                )
            """)

            # Feedback weight history
            conn.execute("""
                CREATE TABLE IF NOT EXISTS feedback_history (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    feature     TEXT,
                    adjustment  REAL,
                    trigger     TEXT,           -- what caused the adjustment
                    created_at  DATETIME DEFAULT (datetime('now'))
                )
            """)

            # PMBot Signals
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pmbot_signals (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id   TEXT NOT NULL,
                    label       TEXT,
                    score       REAL,
                    bet_usd     REAL,
                    features    TEXT,           -- JSON
                    created_at  DATETIME DEFAULT (datetime('now'))
                )
            """)

            # PMBot Trades/Positions
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pmbot_positions (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id   TEXT NOT NULL,
                    title       TEXT,
                    side        TEXT NOT NULL,
                    size_usd    REAL,
                    entry_price REAL,
                    status      TEXT DEFAULT 'open', -- open, closed
                    exit_price  REAL,
                    pnl_usd     REAL,
                    pnl_pct     REAL,
                    opened_at   DATETIME DEFAULT (datetime('now')),
                    closed_at   DATETIME
                )
            """)
            # Migration: Ensure title column exists
            try:
                conn.execute("ALTER TABLE pmbot_positions ADD COLUMN title TEXT")
            except sqlite3.OperationalError:
                pass # Already exists
            conn.commit()

    def insert_signal(self, signal: Signal):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO pmbot_signals (market_id, label, score, bet_usd, features)
                VALUES (?, ?, ?, ?, ?)
            """, (
                signal.market.id,
                signal.label,
                signal.score,
                signal.bet_usd,
                json.dumps(signal.features)
            ))

    def insert_vote(self, market_id: str, agent_id: int, vote: str, reason: str, latency_ms: int):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO consensus_votes (market_id, agent_id, vote, reason, latency_ms)
                VALUES (?, ?, ?, ?, ?)
            """, (market_id, agent_id, vote, reason, latency_ms))

    def get_open_positions(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.execute("SELECT * FROM pmbot_positions WHERE status = 'open'")
            return [dict(row) for row in cursor.fetchall()]

    def get_daily_pnl(self, date_str: str = None) -> float:
        if not date_str:
            date_str = datetime.now().strftime('%Y-%m-%d')
        with self._get_conn() as conn:
            cursor = conn.execute("""
                SELECT SUM(pnl_usd) as total_pnl 
                FROM pmbot_positions 
                WHERE status = 'closed' AND date(closed_at) = ?
            """, (date_str,))
            row = cursor.fetchone()
            return row['total_pnl'] or 0.0

    def get_total_stats(self) -> Dict[str, Any]:
        with self._get_conn() as conn:
            cursor = conn.execute("""
                SELECT 
                    COUNT(*) as total, 
                    SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as wins 
                FROM pmbot_positions 
                WHERE status = 'closed'
            """)
            row = cursor.fetchone()
            total = row['total'] or 0
            wins = row['wins'] or 0
            win_rate = (wins / total * 100) if total > 0 else 0.0
            return {
                "total_trades": total,
                "win_rate": round(win_rate, 1)
            }

    def insert_position(self, pos: Position):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO pmbot_positions (market_id, title, side, size_usd, entry_price, status, opened_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                pos.market_id,
                pos.title,
                pos.side,
                pos.size_usd,
                pos.entry_price,
                pos.status,
                pos.opened_at.isoformat()
            ))

    def get_closed_trades(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.execute("""
                SELECT * FROM pmbot_positions 
                WHERE status = 'closed' 
                ORDER BY closed_at ASC 
                LIMIT ?
            """, (limit,))
            return [dict(row) for row in cursor.fetchall()]

    def get_pnl_history(self, days: int = 10) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            # Get P&L grouped by date for the last X days
            cursor = conn.execute("""
                SELECT date(closed_at) as date, SUM(pnl_usd) as pnl
                FROM pmbot_positions
                WHERE status = 'closed'
                GROUP BY date(closed_at)
                ORDER BY date(closed_at) DESC
                LIMIT ?
            """, (days,))
            # Reverse to get chronological order for the bars
            rows = [dict(row) for row in cursor.fetchall()]
            return rows[::-1]

    def update_wallet_activity(self, address: str, market_id: str, side: str, amount_usd: float, tx_hash: str):
        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR IGNORE INTO wallet_activity (address, market_id, side, amount_usd, tx_hash)
                VALUES (?, ?, ?, ?, ?)
            """, (address, market_id, side, amount_usd, tx_hash))
