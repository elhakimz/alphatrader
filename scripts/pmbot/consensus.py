import asyncio
import json
import random
from typing import List, Dict, Any, Tuple
from groq import AsyncGroq
from .config import settings
from .models import Market

class GroqConsensus:
    def __init__(self, bus=None):
        self.client = AsyncGroq(api_key=settings.groq_api_key)
        self.model = settings.groq_model
        self.bus = bus
        self.system_prompt = """
        You are an expert prediction market analyst. Your goal is to vote on whether to enter a trade on Polymarket.
        You will receive market metadata, whale activity, and technical features.
        Analyze the edge, risk, and consensus signals.
        Respond ONLY with a JSON object:
        {"vote": "YES_ENTER" | "NO_ENTER" | "SKIP", "reason": "<one sentence reasoning>"}
        """

    async def get_consensus(self, market: Market, features: Dict[str, Any]) -> Tuple[bool, List[str]]:
        prompt = self._build_prompt(market, features)
        
        if self.bus:
            await self.bus.emit("LOG", {"level": "INFO", "message": f"Consensus: Initiating vote for {market.title[:30]}"})
        
        # Parallel agent calls with slight jitter to handle rate limits
        tasks = []
        for i in range(3):
            tasks.append(self._agent_vote(prompt, agent_id=i+1))
            if i < 2:
                await asyncio.sleep(settings.consensus_jitter_ms / 1000.0)
        
        results = await asyncio.gather(*tasks)
        
        votes = [r["vote"] for r in results]
        reasons = [r["reason"] for r in results]
        
        # 2-of-3 consensus (either YES_ENTER or NO_ENTER counts as an 'ENTER' action if they agree on side)
        # Actually, the logic should be: if 2 or more agree to ENTER (on the side recommended by features)
        enter_votes = [v for v in votes if "ENTER" in v]
        consensus_reached = len(enter_votes) >= settings.consensus_required
        
        if self.bus:
            level = "SUCCESS" if consensus_reached else "INFO"
            msg = f"Consensus {'REACHED' if consensus_reached else 'FAILED'} for {market.title[:30]} ({len(enter_votes)}/3)"
            await self.bus.emit("LOG", {"level": level, "message": msg})
            
        return consensus_reached, reasons

    async def _agent_vote(self, prompt: str, agent_id: int) -> Dict[str, Any]:
        try:
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=300,
                    response_format={"type": "json_object"}
                ),
                timeout=settings.consensus_timeout_sec
            )
            content = response.choices[0].message.content
            return json.loads(content)
        except asyncio.TimeoutError:
            return {"vote": "SKIP", "reason": f"Agent {agent_id} timed out"}
        except Exception as e:
            return {"vote": "SKIP", "reason": f"Agent {agent_id} error: {str(e)}"}

    def _build_prompt(self, market: Market, features: Dict[str, Any]) -> str:
        return f"""
        Market: {market.title}
        YES Price: {market.YES_price:.3f} | NO Price: {market.NO_price:.3f}
        Fair Value Estimate: {market.fair_value:.3f}
        
        Technical Features:
        - Gap: {features.get('gap', 0):.4f}
        - Edge: {features.get('edge', 0):.4f}
        - Depth (USD): ${features.get('depth_USD', 0):.0f}
        - Time to Resolution: {market.ttr_hours:.1f} hours
        - Volume (1h): ${market.volume_1h:.0f}
        - Volume (24h): ${market.volume_24h:.0f}
        
        Signals:
        - Arb Signal: {features.get('arb_signal', 'N/A')}
        - Whale Count (Aligned): {features.get('whale_count', 0)} / 47
        - Volume Spike: {features.get('vol_spike', False)}
        
        Recommended Bet Sizing:
        - Kelly Bet: ${features.get('kelly_usd', 0):.2f}
        
        Should we enter this trade?
        """
