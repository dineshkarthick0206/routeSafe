"""
Shared HTTP client.

BUG THIS FIXES: every external call (AQI, weather, routing) used to open
its own `async with httpx.AsyncClient() as client:` block. Route scoring
calls the AQI service concurrently for every sampled point along up to 3
candidate routes — so a single "Find Safe Route" search could open dozens
of brand-new client instances (each with its own connection pool/sockets)
in a few seconds. On Windows, asyncio's default SelectorEventLoop passes
every open socket to `select()`, which has a hard OS-level cap of 512 file
descriptors — enough concurrent clients blow past that limit and crash the
whole server with `ValueError: too many file descriptors in select()`.

Fix: one shared, reused AsyncClient for the lifetime of the app (created
on first use, closed on shutdown via the lifespan handler in main.py).
This is also simply better practice — connection pooling/reuse is faster
than opening a fresh TCP+TLS handshake per request.
"""

import httpx

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=15,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
