import json
import os
from pydantic_settings import BaseSettings
from typing import Optional

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "pmbot_config.json")

class PmbotSettings(BaseSettings):
    # API keys (Keep in .env)
    groq_api_key:           str
    polymarket_api_key:     Optional[str] = None
    polygon_rpc_url:        Optional[str] = None
    telegram_bot_token:     Optional[str] = None
    telegram_chat_id:       Optional[str] = None

    # Groq model
    groq_model:             str   = "llama-3.3-70b-versatile"

    # Scanner
    scan_interval_seconds:  int   = 30
    market_fetch_limit:     int   = 500
    gap_min:                float = 0.025
    gap_max:                float = 0.50
    depth_min_usd:          float = 500.0
    ttr_min_hours:          float = 4.0
    ttr_max_hours:          float = 48.0
    enter_threshold:        float = 0.07
    exit_threshold:         float = 0.03

    # Kelly
    kelly_cap:              float = 0.25
    max_bet_usd:            float = 500.0
    min_order_usd:          float = 10.0

    # Risk
    max_open_positions:     int   = 10
    max_single_exposure:    float = 500.0
    max_portfolio_pct:      float = 0.60
    max_daily_loss:         float = 200.0
    max_correlated:         int   = 3

    # Execution
    max_slippage_bps:       int   = 50
    order_expire_seconds:   int   = 300

    # Feedback EMA
    feedback_alpha:         float = 0.10
    penalty_decay_per_scan: float = 0.25

    # Groq consensus
    consensus_timeout_sec:  int   = 8
    consensus_required:     int   = 2   # of 3 agents
    consensus_jitter_ms:    int   = 50  # stagger on rate limit

    class Config:
        env_file = ".env"
        extra = "ignore"

    def save(self):
        with open(CONFIG_PATH, "w") as f:
            json.dump(self.dict(), f, indent=4)

    @classmethod
    def load_custom(cls):
        # Load env first
        obj = cls()
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r") as f:
                    custom = json.load(f)
                    for k, v in custom.items():
                        if hasattr(obj, k) and v is not None:
                            setattr(obj, k, v)
            except Exception as e:
                print(f"[Config] Error loading pmbot_config.json: {e}")
        return obj

settings = PmbotSettings.load_custom()
