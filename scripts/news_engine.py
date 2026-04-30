import asyncio
import httpx
import xml.etree.ElementTree as ET
import hashlib
from datetime import datetime
from typing import List, Optional
from groq import Groq
import os
import json
import urllib.parse


class NewsEngine:
    def __init__(self, db, api_key: Optional[str] = None):
        self.db = db
        self.feeds = [
            {
                "name": "Reuters World",
                "url": "https://www.reutersagency.com/feed/?best-types=world-news&post_type=best",
            },
            {
                "name": "CoinDesk",
                "url": "https://www.coindesk.com/arc/outboundfeeds/rss/",
            },
            {"name": "CryptoPanic", "url": "https://cryptopanic.com/news/rss/"},
        ]
        self.api_key = api_key
        self.client = None
        if api_key:
            self.client = Groq(api_key=api_key)

    async def fetch_all(self):
        """Fetch all RSS feeds and return normalized news items."""
        tasks = [self.fetch_feed(f) for f in self.feeds]
        results = await asyncio.gather(*tasks)
        # Flatten list of lists
        return [item for sublist in results for item in sublist]

    async def fetch_feed(self, feed_config: dict) -> List[dict]:
        """Fetch and parse a single RSS feed."""
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            try:
                resp = await client.get(feed_config["url"])
                if resp.status_code != 200:
                    return []

                root = ET.fromstring(resp.text)
                items = []
                for entry in root.findall(".//item")[:10]:  # Top 10 per feed
                    title = (
                        entry.find("title").text
                        if entry.find("title") is not None
                        else "No Title"
                    )
                    link = (
                        entry.find("link").text
                        if entry.find("link") is not None
                        else ""
                    )
                    pub_date = (
                        entry.find("pubDate").text
                        if entry.find("pubDate") is not None
                        else datetime.utcnow().isoformat()
                    )

                    # Generate a stable ID based on URL
                    item_id = hashlib.sha256(link.encode()).hexdigest()[:16]

                    items.append(
                        {
                            "id": item_id,
                            "headline": title,
                            "source": feed_config["name"],
                            "url": link,
                            "ts": pub_date,
                            "summary": "",  # To be filled by AI
                            "pis": 0,  # To be filled by AI
                            "sentiment": "NEUTRAL",
                        }
                    )
                return items
            except Exception as e:
                print(f"[News] Error fetching {feed_config['name']}: {e}")
                return []

    async def search_google_news(self, query: str) -> List[dict]:
        """Search Google News RSS for a specific query."""
        encoded_query = urllib.parse.quote(query)
        url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    return []

                root = ET.fromstring(resp.text)
                items = []
                for entry in root.findall(".//item")[:5]:  # Top 5 for specific search
                    title = (
                        entry.find("title").text
                        if entry.find("title") is not None
                        else ""
                    )
                    link = (
                        entry.find("link").text
                        if entry.find("link") is not None
                        else ""
                    )
                    pub_date = (
                        entry.find("pubDate").text
                        if entry.find("pubDate") is not None
                        else datetime.utcnow().isoformat()
                    )

                    item_id = hashlib.sha256(link.encode()).hexdigest()[:16]

                    items.append(
                        {
                            "id": item_id,
                            "headline": title,
                            "source": "Google News Search",
                            "url": link,
                            "ts": pub_date,
                            "summary": "",
                            "pis": 0,
                            "sentiment": "NEUTRAL",
                        }
                    )
                return items
            except Exception as e:
                print(f"[News] Search error for '{query}': {e}")
                return []

    async def enrich_item(self, item: dict, markets: List[dict]):
        """Use Groq to summarize, score, and match news to markets."""
        if not self.client:
            # Mock enrichment if no API key
            item["summary"] = "AI Enrichment unavailable (Missing API Key)."
            item["pis"] = 10
            return item

        market_context = "\n".join(
            [f"- {m['id']}: {m['question']}" for m in markets[:20]]
        )
        prompt = f"""
        Analyze this news headline for a prediction market platform:
        Headline: {item["headline"]}
        Source: {item["source"]}

        Available Markets:
        {market_context}

        Task:
        1. Summarize in 1-2 plain English sentences.
        2. Identify if it directly impacts any of the markets above. If so, provide the market_id.
        3. Assign a Probability Impact Score (PIS) from 0-100.
        4. Sentiment for the 'YES' position (BULLISH, BEARISH, NEUTRAL).

        Return strictly as JSON:
        {{
            "summary": "...",
            "market_id": "...",
            "pis": 85,
            "sentiment": "BULLISH"
        }}
        """
        try:
            # Use Llama 3 for fast, high-quality analysis
            model = os.getenv("GROQ_ANALYSIS_MODEL", "llama-3.3-70b-versatile")
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content)

            mid = data.get("market_id")
            if mid == "None" or mid == "null" or mid == "":
                mid = None

            item.update(
                {
                    "summary": data.get("summary", ""),
                    "market_id": mid,
                    "pis": data.get("pis", 0),
                    "sentiment": data.get("sentiment", "NEUTRAL"),
                }
            )
        except Exception as e:
            print(f"[News] Enrichment error for {item['id']}: {e}")
            item["summary"] = "Enrichment failed."

        return item
