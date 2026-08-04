from __future__ import annotations

from pydantic import BaseModel, Field


class RAGSource(BaseModel):
    citation_number: int = Field(ge=1)
    document_id: str
    title: str
    category: str
    source_title: str | None = None
    source_url: str | None = None
    effective_date: str | None = None
    last_verified: str | None = None
    provenance_verified: bool = False
    relevance_score: float = Field(ge=0, le=1)


class RAGAnswer(BaseModel):
    answer: str
    grounded: bool
    needs_source_verification: bool
    sources: list[RAGSource] = Field(default_factory=list)
    model: str | None = None
    disclaimer: str
