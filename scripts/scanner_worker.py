import asyncio
import httpx
import os
from datetime import datetime
from dotenv import load_dotenv
from .detector_engine import (
    DetectorDB,
    ArbScanner,
    GroqEstimator,
    AlertEngine,
    CrossScanner,
)

load_dotenv()

GAMMA_API = "https://gamma-api.polymarket.com"


async def fetch_markets():
    """Fetch active markets from Gamma API."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{GAMMA_API}/markets",
                params={
                    "active": "true",
                    "closed": "false",
                    "limit": 100,
                    "order": "volume24hr",
                    "ascending": "false",
                },
            )
            if resp.status_code == 200:
                return resp.json()
            return []
    except Exception as e:
        print(f"[Worker] Market fetch error: {e}")
        return []


async def notify_heartbeat(status="active"):
    """Ping the main app to show we are alive."""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "http://localhost:8888/notify/heartbeat",
                json={"engine": "scanner", "status": status},
                timeout=5.0,
            )
    except Exception as e:
        print(f"[Worker] Heartbeat error: {e}")


async def notify_main_app(alert):
    """Notify the main API server about a new alert."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "http://localhost:8888/notify/new_alert", json=alert, timeout=5.0
            )
            if resp.status_code == 200:
                print(f"[Worker] Notification sent successfully for {alert['id']}")
            else:
                print(
                    f"[Worker] Notification failed with status {resp.status_code}: {resp.text}"
                )
    except Exception as e:
        print(f"[Worker] Notification connection error: {e}")


def safe_float(val, default=0.0):
    try:
        if val is None or val == "":
            return default
        return float(val)
    except (ValueError, TypeError):
        return default


async def run_worker():
    print(
        "  █████╗ ██╗     ██████╗ ██╗  ██╗ █████╗     ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗███████╗██████╗ "
    )
    print(
        " ██╔══██╗██║     ██╔══██╗██║  ██║██╔══██╗    ██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝██╔════╝██╔══██╗"
    )
    print(
        " ███████║██║     ██████╔╝███████║███████║    ██║ █╗ ██║██║   ██║██████╔╝█████╔╝ █████╗  ██████╔╝"
    )
    print(
        " ██╔══██║██║     ██╔═══╝ ██╔══██║██╔══██║    ██║███╗██║██║   ██║██╔══██╗██╔═██╗ ██╔══╝  ██╔══██╗"
    )
    print(
        " ██║  ██║███████╗██║     ██║  ██║██║  ██║    ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗███████╗██║  ██║"
    )
    print(
        " ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝     ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
    )
    print("\n[Worker] Alpha Scanner Worker Started")

    db = DetectorDB()
    arb_scanner = ArbScanner()
    cross_scanner = CrossScanner()
    groq_estimator = GroqEstimator(os.getenv("GROQ_API_KEY"))
    alert_engine = AlertEngine(db)

    while True:
        try:
            await notify_heartbeat("processing")
            print(
                f"\n[Worker] [{datetime.now().strftime('%H:%M:%S')}] Starting full market scan..."
            )
            markets = await fetch_markets()
            if not markets:
                await notify_heartbeat("active")
                print("[Worker] No active markets found. Retrying in 60s...")
                await asyncio.sleep(60)
                continue

            print(f"[Worker] Scanning {len(markets)} markets...")

            # Normalize markets for the engine
            normalized_markets = []
            for m in markets:
                nm = m.copy()

                # CRITICAL: Use conditionId as the primary ID to match main app
                cid = m.get("conditionId") or m.get("condition_id")
                if not cid:
                    continue
                nm["id"] = cid

                # Ensure outcome_prices is always a list of floats
                raw_prices = (
                    m.get("outcomePrices") or m.get("outcome_prices") or ["0.5", "0.5"]
                )
                nm["outcome_prices"] = [safe_float(p) for p in raw_prices]
                nm["volume"] = safe_float(m.get("volume24hr") or m.get("volume"))
                normalized_markets.append(nm)

            # 1. Arbitrage
            for m in normalized_markets:
                opp = arb_scanner.scan(m)
                if opp:
                    db.insert_raw_inefficiency(
                        market_id=m["id"],
                        type="ARBITRAGE",
                        gap=opp["details"]["gap"],
                        yes=opp["details"]["yes"],
                        no=opp["details"]["no"],
                    )
                    alert = alert_engine.process_opportunity(m, opp)
                    if alert:
                        print(f"[Worker] ALERT: Arbitrage in {m['question'][:40]}")
                        await notify_main_app(alert)

            # 2. Cross-Market
            cross_opps = cross_scanner.scan(normalized_markets)
            for opp in cross_opps:
                db.insert_raw_inefficiency(
                    market_id=opp["market_id"],
                    type="CROSS_MARKET",
                    gap=opp["edge_pct"] / 100.0,
                    yes=opp["details"].get("p1", 0),
                    no=opp["details"].get("p2", 0),
                )
                alert = alert_engine.process_opportunity(
                    {"id": opp["market_id"], "question": opp["market_question"]}, opp
                )
                if alert:
                    print(
                        f"[Worker] ALERT: Cross-Market logic in {opp['market_question']}"
                    )
                    await notify_main_app(alert)

            # 3. AI Edge (Top 10 by volume)
            top_ms = sorted(
                normalized_markets, key=lambda x: x.get("volume", 0), reverse=True
            )[:10]
            for m in top_ms:
                if alert_engine.is_cooling_down(m["id"], "AI_EDGE"):
                    continue

                print(f"[Worker] AI research: {m['question'][:50]}...")
                opp = await groq_estimator.estimate(m)
                if opp:
                    db.insert_ai_estimate(
                        market_id=m["id"],
                        question=m["question"],
                        fair_prob=opp["details"]["fair_prob"],
                        market_price=opp["details"]["market_price"],
                        confidence=opp["details"]["confidence"],
                        reasoning=opp["details"]["reasoning"],
                    )
                    alert = alert_engine.process_opportunity(m, opp)
                    if alert:
                        print(f"[Worker] ALERT: AI ALPHA in {m['question'][:40]}")
                        await notify_main_app(alert)

            await notify_heartbeat("active")
            print("[Worker] Scan complete. Next run in 5 minutes.")
            await asyncio.sleep(300)

        except Exception as e:
            print(f"[Worker] Critical Error: {e}")
            await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(run_worker())
