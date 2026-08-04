from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.rate_limit import ChatRateLimitExceeded, ChatRateLimiter


class FakeClocks:
    def __init__(self) -> None:
        self.monotonic_value = 0.0
        self.utc_value = datetime(
            2026,
            8,
            4,
            12,
            0,
            tzinfo=timezone.utc,
        )

    def monotonic(self) -> float:
        return self.monotonic_value

    def utcnow(self) -> datetime:
        return self.utc_value

    def advance(self, seconds: float) -> None:
        self.monotonic_value += seconds
        self.utc_value += timedelta(seconds=seconds)


def test_minute_limit_and_retry_after() -> None:
    clocks = FakeClocks()
    limiter = ChatRateLimiter(
        requests_per_minute=2,
        requests_per_day=10,
        monotonic_clock=clocks.monotonic,
        utcnow=clocks.utcnow,
    )

    limiter.check("client-a")
    limiter.check("client-a")

    with pytest.raises(ChatRateLimitExceeded) as captured:
        limiter.check("client-a")

    assert captured.value.reason == "minute"
    assert captured.value.retry_after_seconds == 60

    clocks.advance(60)
    limiter.check("client-a")


def test_daily_limit_resets_at_utc_midnight() -> None:
    clocks = FakeClocks()
    limiter = ChatRateLimiter(
        requests_per_minute=10,
        requests_per_day=2,
        monotonic_clock=clocks.monotonic,
        utcnow=clocks.utcnow,
    )

    limiter.check("client-a")
    limiter.check("client-a")

    with pytest.raises(ChatRateLimitExceeded) as captured:
        limiter.check("client-a")

    assert captured.value.reason == "daily"
    assert captured.value.retry_after_seconds == 43_200

    clocks.advance(43_200)
    limiter.check("client-a")


def test_clients_have_independent_limits() -> None:
    clocks = FakeClocks()
    limiter = ChatRateLimiter(
        requests_per_minute=1,
        requests_per_day=10,
        monotonic_clock=clocks.monotonic,
        utcnow=clocks.utcnow,
    )

    limiter.check("client-a")
    limiter.check("client-b")

    with pytest.raises(ChatRateLimitExceeded):
        limiter.check("client-a")
