from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.knowledge_base import KnowledgeBaseValidationError
from app.services.rag_service import RAGService, RAGServiceError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="tax_faq.json을 임베딩해 ChromaDB에 저장합니다.",
    )
    parser.add_argument(
        "--data",
        type=Path,
        help="기본값 대신 사용할 지식베이스 JSON 경로",
    )
    parser.add_argument(
        "--strict-provenance",
        action="store_true",
        help="출처·기준일 메타데이터가 없는 문서가 있으면 적재를 중단합니다.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        result = RAGService().index_knowledge_base(
            path=args.data.resolve() if args.data else None,
            strict_provenance=args.strict_provenance,
        )
    except (KnowledgeBaseValidationError, RAGServiceError, ValueError) as exc:
        print(f"지식베이스 적재 실패: {exc}", file=sys.stderr)
        return 1

    print(
        f"{result.indexed_count}개 문서를 "
        f"'{result.collection_name}' 컬렉션에 저장했습니다."
    )
    for warning in result.warnings:
        print(f"경고: {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
