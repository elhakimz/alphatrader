import asyncio
from typing import Dict, List, Any, Callable

class EventBus:
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = {}

    def subscribe(self, event_type: str, callback: Callable):
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(callback)

    async def emit(self, event_type: str, data: Any):
        if event_type in self.subscribers:
            tasks = [cb(data) if asyncio.iscoroutinefunction(cb) else self._run_sync(cb, data) 
                     for cb in self.subscribers[event_type]]
            if tasks:
                await asyncio.gather(*tasks)

    async def _run_sync(self, cb, data):
        return cb(data)
