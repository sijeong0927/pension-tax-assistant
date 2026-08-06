from app.services.chat_history_service import ChatHistoryService

def test_mask_pii():
    text = "제 전화번호는 010-1234-5678 이고 주민번호는 990101-1234567 입니다."
    masked = ChatHistoryService.mask_pii(text)
    assert "010-****-5678" in masked
    assert "990101-*******" in masked

def test_normalize_sources():
    sources = [
        {
            "document_id": "faq-1",
            "source_title": "국세청 연말정산 안내",
            "effective_date": "2025-01-01",
            "source_url": "https://example.invalid/source",
            "source_chunk_ids": ["faq_01"],
            "excerpt": "연금계좌 세액공제 안내입니다.",
            "relevance_score": 0.92,
            "unexpected": "do not persist",
        }
    ]
    normalized = ChatHistoryService._normalize_sources(sources)
    assert normalized == [
        {
            "document_id": "faq-1",
            "source_title": "국세청 연말정산 안내",
            "effective_date": "2025-01-01",
            "source_url": "https://example.invalid/source",
            "source_chunk_ids": ["faq_01"],
            "excerpt": "연금계좌 세액공제 안내입니다.",
        }
    ]
