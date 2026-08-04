from __future__ import annotations

import math
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time as datetime_time, timedelta, timezone
from threading import Lock


MINUTE_WINDOW_SECONDS = 60
MAX_TRACKED_CLIENTS = 10_000


class ChatRateLimitExceeded(RuntimeError):
    """클라이언트가 분당 또는 일일 호출 한도를 초과했을 때 발생한다."""

    def __init__(self, *, reason: str, retry_after_seconds: int) -> None:
        super().__init__("챗봇 호출 한도를 초과했습니다.")
        self.reason = reason
        self.retry_after_seconds = max(1, retry_after_seconds)


@dataclass
class _ClientUsage:
    minute_started_at: float
    minute_count: int
    day: date
    day_count: int


class ChatRateLimiter:
    """단일 프로세스 MVP를 위한 클라이언트별 고정 구간 호출 제한."""

    def __init__(
        self,
        *,
        requests_per_minute: int,
        requests_per_day: int,
        monotonic_clock: Callable[[], float] = time.monotonic,
        utcnow: Callable[[], datetime] | None = None,
    ) -> None:
        if requests_per_minute <= 0:
            raise ValueError("분당 호출 한도는 0보다 커야 합니다.")
        if requests_per_day <= 0:
            raise ValueError("일일 호출 한도는 0보다 커야 합니다.")

        self.requests_per_minute = requests_per_minute
        self.requests_per_day = requests_per_day
        self._monotonic_clock = monotonic_clock
        self._utcnow = utcnow or (lambda: datetime.now(timezone.utc))
        self._usage_by_client: OrderedDict[str, _ClientUsage] = OrderedDict()
        self._lock = Lock()

    def check(self, client_key: str) -> None:
        """호출 가능 여부를 확인하고 성공한 검사 한 건을 사용량에 반영한다."""

        normalized_key = client_key.strip() or "unknown"
        now_monotonic = self._monotonic_clock()
        now_utc = self._utcnow()
        if now_utc.tzinfo is None or now_utc.utcoffset() is None:
            raise ValueError("utcnow는 시간대 정보가 있는 datetime을 반환해야 합니다.")
        now_utc = now_utc.astimezone(timezone.utc)
        today = now_utc.date()

        with self._lock:
            usage = self._usage_by_client.get(normalized_key)
            if usage is None:
                self._ensure_capacity()
                usage = _ClientUsage(
                    minute_started_at=now_monotonic,
                    minute_count=0,
                    day=today,
                    day_count=0,
                )
                self._usage_by_client[normalized_key] = usage
            else:
                self._usage_by_client.move_to_end(normalized_key)

            if usage.day != today:
                usage.day = today
                usage.day_count = 0

            minute_elapsed = now_monotonic - usage.minute_started_at
            if minute_elapsed >= MINUTE_WINDOW_SECONDS or minute_elapsed < 0:
                usage.minute_started_at = now_monotonic
                usage.minute_count = 0
                minute_elapsed = 0

            if usage.day_count >= self.requests_per_day:
                raise ChatRateLimitExceeded(
                    reason="daily",
                    retry_after_seconds=self._seconds_until_next_utc_day(
                        now_utc
                    ),
                )

            if usage.minute_count >= self.requests_per_minute:
                raise ChatRateLimitExceeded(
                    reason="minute",
                    retry_after_seconds=math.ceil(
                        MINUTE_WINDOW_SECONDS - minute_elapsed
                    ),
                )

            usage.minute_count += 1
            usage.day_count += 1

    def _ensure_capacity(self) -> None:
        if len(self._usage_by_client) < MAX_TRACKED_CLIENTS:
            return
        self._usage_by_client.popitem(last=False)

    @staticmethod
    def _seconds_until_next_utc_day(now_utc: datetime) -> int:
        next_day = datetime.combine(
            now_utc.date() + timedelta(days=1),
            datetime_time.min,
            tzinfo=timezone.utc,
        )
        return max(1, math.ceil((next_day - now_utc).total_seconds()))
