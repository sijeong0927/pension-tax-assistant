from __future__ import annotations

import re


CALCULATION_HANDOFF_MESSAGE = (
    "손님, 정확한 금액은 개인 상황마다 달라 채팅으로 바로 짚어드리긴 어려워요. "
    "간단하게 계산해 보실 수 있는 연말정산 계산기가 준비되어 있으니 이를 참고해 주세요!"
)


_CALCULATION_PATTERNS = (
    re.compile(r"(?:계산|산출|시뮬레이션)\s*(?:해|하|해줘|해주세요|해 봐|해봐)"),
    re.compile(
        r"(?:얼마|몇\s*원|금액)\s*(?:를|을|이나|받|공제|환급|돌려받|절세|세금)"
    ),
    re.compile(
        r"(?:공제|환급|돌려받|절세|세금)\S{0,20}(?:얼마|몇\s*원|계산|산출)"
    ),
    re.compile(r"(?:한도|공제)\s*(?:를\s*)?(?:채웠|남았|넘었|초과했|가능해)"),
    re.compile(
        r"(?:나|내|저|제|제가|저는|나는|내가|나의)\S{0,24}"
        r"(?:얼마|몇|한도|공제|환급|돌려받|세금|절세|더\s*넣|추천|가능)"
    ),
    re.compile(
        r"(?:나|내|저|제)(?:\s|의)*(?:월급|연봉|총급여|소득|납입액|사용액|조건).{0,36}?"
        r"(?:얼마|몇|한도|공제|환급|돌려받|세금|절세|더\s*넣|추천|가능)"
    ),
)

_PERSONAL_NUMERIC_CONDITION = re.compile(
    r"(?:\d[\d,]*(?:\.\d+)?\s*(?:만원|만\s*원|원|%|천만|억)|"
    r"[일이삼사오육칠팔구십]+천?만\s*원?)"
    r"\S{0,24}(?:쓰|사용|넣|납입|받|연봉|급여|월급|총급여|소득)"
)


def is_personal_calculation_request(question: str) -> bool:
    """Return whether a question asks the chat to calculate an individual result.

    General policy questions such as "연금계좌 한도는 얼마인가요?" must remain
    available to RAG. The guard therefore requires a calculation expression or
    a money/salary condition paired with an individual result request.
    """
    if not isinstance(question, str):
        return False

    normalized = " ".join(question.lower().split())
    if not normalized:
        return False

    has_calculation_expression = any(
        pattern.search(normalized) for pattern in _CALCULATION_PATTERNS
    )
    if has_calculation_expression:
        return True

    has_personal_numeric_condition = bool(
        _PERSONAL_NUMERIC_CONDITION.search(normalized)
    )
    asks_for_individual_result = bool(
        re.search(r"(?:얼마|몇\s*원|공제받|환급받|돌려받|혜택받)", normalized)
    )
    return has_personal_numeric_condition and asks_for_individual_result
