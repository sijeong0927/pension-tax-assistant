from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import fitz  # PyMuPDF
from app.services.rag_service import RAGService, RAGServiceError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="PDF 파일을 파싱하여 ChromaDB에 인덱싱합니다.",
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        default=PROJECT_ROOT / "app/data/pdfs/2025_year_end_tax_guide.pdf",
        help="인덱싱할 PDF 파일 경로 (기본값: app/data/pdfs/2025_year_end_tax_guide.pdf)",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=600,
        help="텍스트 분할 크기 (글자 수, 기본값: 600)",
    )
    parser.add_argument(
        "--overlap",
        type=int,
        default=100,
        help="분할 중첩 크기 (글자 수, 기본값: 100)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=40,
        help="한 번에 임베딩할 배치 크기 (기본값: 40)",
    )
    return parser


def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    """텍스트를 지정된 크기와 오버랩으로 분할합니다."""
    text = text.strip()
    if not text:
        return []
    
    # 공백 줄바꿈 정돈
    text = " ".join(text.split())
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        # 더 이상 나눌 텍스트가 없으면 종료
        if end >= len(text):
            break
        start += (chunk_size - overlap)
    return chunks


def main() -> int:
    args = build_parser().parse_args()
    pdf_path: Path = args.pdf
    
    if not pdf_path.exists():
        print(f"오류: PDF 파일을 찾을 수 없습니다: {pdf_path}", file=sys.stderr)
        return 1

    print(f"PDF 파일 분석 시작: {pdf_path.name}")
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        print(f"PDF 로드 실패: {exc}", file=sys.stderr)
        return 1

    total_pages = len(doc)
    print(f"총 페이지 수: {total_pages}장")

    # 1. 텍스트 추출 및 청크 생성
    all_documents = []
    all_metadatas = []
    all_ids = []

    for page_idx in range(total_pages):
        page = doc[page_idx]
        page_num = page_idx + 1
        page_text = page.get_text("text")
        
        chunks = chunk_text(page_text, args.chunk_size, args.overlap)
        for chunk_idx, chunk_content in enumerate(chunks):
            doc_id = f"pdf_page_{page_num:03d}_chunk_{chunk_idx:02d}"
            
            # 검색 문서 형식화
            formatted_text = f"[2025년 연말정산 신고안내 - {page_num}페이지]\n{chunk_content}"
            
            metadata = {
                "title": f"2025년 연말정산 신고안내 {page_num}페이지 (조각 {chunk_idx + 1})",
                "category": "연말정산 신고안내",
                "dataset_updated_at": "2026-08-04",
                "source_title": "2025년 원천징수의무자를 위한 연말정산 신고안내",
                "source_url": "https://www.nts.go.kr",
                "effective_date": "2025-01-01",
                "last_verified": "2026-08-04",
                "provenance_verified": True
            }
            
            all_ids.append(doc_id)
            all_documents.append(formatted_text)
            all_metadatas.append(metadata)

    total_chunks = len(all_ids)
    print(f"총 {total_chunks}개의 청크가 분할되었습니다.")

    # 2. RAG 서비스 초기화
    rag_service = RAGService()
    collection = rag_service._get_collection()

    # 3. 배치 단위로 임베딩 및 업서트
    batch_size = args.batch_size
    print(f"ChromaDB 적재 시작 (배치 크기: {batch_size})")

    success_count = 0
    for idx in range(0, total_chunks, batch_size):
        batch_ids = all_ids[idx:idx + batch_size]
        batch_docs = all_documents[idx:idx + batch_size]
        batch_meta = all_metadatas[idx:idx + batch_size]

        try:
            # 임베딩 생성 (RAGService의 _embed 활용)
            batch_embeddings = rag_service._embed(batch_docs)
            
            # ChromaDB에 적재
            collection.upsert(
                ids=batch_ids,
                documents=batch_docs,
                metadatas=batch_meta,
                embeddings=batch_embeddings
            )
            success_count += len(batch_ids)
            print(f"진행 상황: {success_count}/{total_chunks} 청크 완료...")
        except Exception as exc:
            print(f"배치 적재 중 오류 발생 ({idx} ~ {idx + len(batch_ids)}): {exc}", file=sys.stderr)
            # 계속 진행할지 여부 결정 가능하나, 오류가 발생하면 전반적인 흐름 확인 필요
            return 1

    print(f"성공: {success_count}개 청크가 '{rag_service.settings.chroma_collection_name}' 컬렉션에 적재되었습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
