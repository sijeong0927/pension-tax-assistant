from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models.chat_history import ChatHistory, ChatHistorySource
from app.models.user import User
from app.services.chat_history_service import ChatHistoryService


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_chat_history_source_has_a_primary_key():
    assert [column.name for column in ChatHistorySource.__table__.primary_key.columns] == [
        "id"
    ]


def test_assistant_sources_are_preserved_in_chat_history():
    db = _session()
    sources = [
        {
            "document_id": "faq-1",
            "source_title": "국세청 연말정산 안내",
            "effective_date": "2025-01-01",
            "source_url": "https://example.invalid/source",
            "unexpected": "do not persist",
        }
    ]

    ChatHistoryService.save_message(
        db,
        "source-history-test",
        "assistant",
        "답변입니다.",
        sources=sources,
    )

    history = ChatHistoryService.get_history(db, "source-history-test")

    assert ChatHistoryService.get_sources(history[0]) == [
        {
            "document_id": "faq-1",
            "source_title": "국세청 연말정산 안내",
            "effective_date": "2025-01-01",
            "source_url": "https://example.invalid/source",
        }
    ]


def test_deleting_a_session_deletes_its_source_metadata():
    db = _session()
    entry = ChatHistoryService.save_message(
        db,
        "delete-source-test",
        "assistant",
        "답변입니다.",
        sources=[{"document_id": "faq-1"}],
    )
    entry_id = entry.id

    assert ChatHistoryService.delete_session(db, "delete-source-test") is True
    assert db.query(ChatHistory).filter_by(id=entry_id).count() == 0
    assert db.query(ChatHistorySource).filter_by(chat_history_id=entry_id).count() == 0
