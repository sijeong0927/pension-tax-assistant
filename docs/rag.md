# ChromaDB 및 RAG 엔진

이 문서는 이슈 #4에서 추가한 FAQ 임베딩, ChromaDB 검색, OpenAI 답변 생성
기능의 로컬 실행 방법을 설명합니다.

## 1. 환경 설정

프로젝트 루트에서 패키지를 설치하고 환경변수 파일을 준비합니다.

```powershell
pip install -r requirements.txt
Copy-Item .env.example .env
```

`.env`의 `OPENAI_API_KEY`에 로컬 개발용 키를 설정합니다.

```dotenv
OPENAI_API_KEY=발급받은_키
```

실제 키는 `.env.example`, Python 코드, Git 커밋, 로그, 메신저에 적지 않습니다.
`.env`는 `.gitignore`에 포함되어 있습니다.

주요 환경변수는 다음과 같습니다.

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | 답변 생성 모델 |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 문서·질문 임베딩 모델 |
| `OPENAI_TIMEOUT_SECONDS` | `30` | OpenAI API 호출 제한 시간 |
| `OPENAI_MAX_RETRIES` | `1` | 실패 시 자동 재시도 상한(최대 1회) |
| `CHROMA_PERSIST_DIR` | `.chroma` | 로컬 Vector DB 경로 |
| `CHROMA_COLLECTION_NAME` | `pension_tax_faq` | ChromaDB 컬렉션 이름 |
| `KNOWLEDGE_BASE_PATH` | `app/data/tax_faq.json` | FAQ 원문 경로 |
| `RAG_TOP_K` | `4` | 검색할 최대 문서 수 |
| `RAG_MIN_RELEVANCE_SCORE` | `0.35` | 답변 생성에 필요한 최소 검색 점수 |
| `RAG_MAX_INDEX_DOCUMENTS` | `50` | 한 번에 임베딩할 수 있는 문서 수 |

## API 과사용 절대 금지

OpenAI API는 호출할 때마다 비용과 사용량이 발생하므로 다음 규칙을 반드시
지킵니다.

- `index_tax_faq.py`는 FAQ 원문이 변경된 경우에만 수동 실행합니다.
- FastAPI 시작, 개발 서버 `--reload`, 페이지 새로고침 과정에서 인덱싱 스크립트를
  자동 실행하지 않습니다.
- 반복문·무제한 재시도·실제 API 키를 사용한 부하 테스트를 절대 실행하지 않습니다.
- 테스트와 CI에서는 현재 테스트처럼 가짜 OpenAI 클라이언트를 사용합니다.
- 챗봇 API 엔드포인트를 추가할 때는 사용자별 속도 제한과 일일 호출량 제한을
  함께 구현한 뒤 공개합니다.

코드에서도 검색 문서를 최대 8개, 1회 인덱싱 문서를 최대 100개, 자동 재시도를
최대 1회로 제한합니다. 기본값은 각각 4개, 50개, 1회입니다.

임베딩 모델을 변경하면 기존 컬렉션과 벡터 차원이 달라질 수 있습니다. 이 경우
새 `CHROMA_COLLECTION_NAME`을 사용하거나 생성된 `.chroma` 디렉터리를 다시
구축해야 합니다.

## 2. 지식베이스 적재

```powershell
python scripts/index_tax_faq.py
```

스크립트는 다음 항목을 검사한 뒤 FAQ 가이드 1개와 FAQ 20개를 저장합니다.

- 필수 필드와 날짜 형식
- 문서 ID 및 질문 중복
- `source_title`, `source_url`, `effective_date`, `last_verified` 출처 메타데이터

현재 `tax_faq.json`은 출처 메타데이터가 없는 초안이므로 기본 실행에서는 경고를
표시하고 적재합니다. 출처가 완전히 검증된 데이터만 허용하려면 아래 옵션을
사용합니다.

```powershell
python scripts/index_tax_faq.py --strict-provenance
```

현재 초안 데이터에서는 이 명령이 의도적으로 실패합니다. 각 문서에 공식 1차
출처와 기준일을 추가한 뒤 엄격 모드로 다시 검증해야 합니다.

## 3. 질문과 답변

```python
from app.services.rag_service import answer_question

result = answer_question("연금저축과 IRP의 세액공제 한도는 어떻게 다른가요?")

print(result.answer)
for source in result.sources:
    print(source.title, source.source_url, source.effective_date)
```

검색 점수가 `RAG_MIN_RELEVANCE_SCORE`보다 낮으면 OpenAI 답변 생성을 호출하지
않고 근거 부족 안내를 반환합니다. 검색된 문서의 출처 메타데이터가 불완전하면
`needs_source_verification`이 `true`가 됩니다.

반환되는 금액은 예상 세액공제 효과를 설명하기 위한 참고값이며 최종 환급액을
보장하지 않습니다. 실제 결과는 결정세액과 다른 공제 항목에 따라 달라질 수
있습니다.

## 참고한 공식 개발 문서

- [OpenAI Responses API 텍스트 생성](https://developers.openai.com/api/docs/guides/text)
- [OpenAI 임베딩 가이드](https://developers.openai.com/api/docs/guides/embeddings)
- [GPT-4o mini 모델](https://developers.openai.com/api/docs/models/gpt-4o-mini)
- [Chroma 컬렉션 API](https://docs.trychroma.com/reference/python/collection)
