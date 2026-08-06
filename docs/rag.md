# ChromaDB 및 RAG 엔진

이 문서는 FAQ·PDF 임베딩, ChromaDB Vector 검색과 BM25 키워드 검색을 결합한
하이브리드 검색과 OpenAI 답변 생성 기능의 로컬 실행 방법을 설명합니다.

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
| `RAG_TOP_K` | `4` | 답변에 전달할 최대 문서 수 |
| `RAG_CANDIDATE_K` | `12` | Vector·BM25 검색별 최대 후보 수 |
| `RAG_MIN_RELEVANCE_SCORE` | `0.35` | 리랭킹 후 답변 생성에 필요한 최소 검색 점수 |
| `RAG_MAX_INDEX_DOCUMENTS` | `100` | 한 번에 임베딩할 수 있는 문서 수 |
| `RAG_CONTEXT_DOCUMENT_LIMIT` | `6` | 답변 컨텍스트에 포함할 최대 문서 수 |
| `RAG_LINKED_EVIDENCE_PER_FAQ` | `2` | 선택된 FAQ당 직접 보강할 공식 PDF 청크 수 |
| `RAG_MAX_PDF_DOCUMENTS` | `1200` | PDF 인덱서가 한 번에 임베딩할 수 있는 최대 청크 수 |
| `RAG_MAX_PDF_EMBEDDING_REQUESTS` | `50` | PDF 인덱서의 최대 임베딩 API 요청 수 |

## API 과사용 절대 금지

OpenAI API는 호출할 때마다 비용과 사용량이 발생하므로 다음 규칙을 반드시
지킵니다.

- `index_tax_faq.py`는 FAQ 원문이 변경된 경우에만 수동 실행합니다.
- `index_pdf.py`는 승인된 PDF 원문을 확인한 뒤에만 수동 실행합니다. 기본 PDF의 SHA-256이
  등록된 국세청 원문과 일치할 때만 검증된 출처로 표시합니다.
- FastAPI 시작, 개발 서버 `--reload`, 페이지 새로고침 과정에서 인덱싱 스크립트를
  자동 실행하지 않습니다.
- 반복문·무제한 재시도·실제 API 키를 사용한 부하 테스트를 절대 실행하지 않습니다.
- 테스트와 CI에서는 가짜 OpenAI 클라이언트를 사용합니다.
- 챗봇 API 엔드포인트를 추가할 때는 사용자별 속도 제한과 일일 호출량 제한을
  함께 구현한 뒤 공개합니다.

코드에서는 답변 컨텍스트 문서를 최대 6개로 제한하고, 선택된 FAQ마다 연결된 공식 PDF 청크를 최대 2개 보강합니다.
PDF 인덱싱 문서는 최대 1,200개, 임베딩 요청은 최대 50회,
자동 재시도 횟수는 최대 1회로 제한합니다.

임베딩 모델을 변경하면 기존 컬렉션과 벡터 차원이 달라질 수 있습니다. 이 경우
새 `CHROMA_COLLECTION_NAME`을 사용하거나 생성된 `.chroma` 디렉터리를 다시
구축해야 합니다.

## 2. 지식베이스 적재

```powershell
python scripts/index_tax_faq.py
```

스크립트는 다음 항목을 검사한 뒤 FAQ 가이드 1개와 FAQ 60개를 저장합니다.

- 필수 필드와 날짜 형식
- 문서 ID 및 질문 중복
- `source_title`, `source_url`, `effective_date`, `last_verified` 출처 메타데이터

`tax_faq.json`의 문서에는 공식 출처 URL, 적용 기준일, 검증일을 포함합니다. CI와 배포 전에는
아래 엄격 모드로 출처 메타데이터 누락을 차단합니다.

```powershell
python scripts/index_tax_faq.py --strict-provenance
```

현재 데이터는 이 명령을 통과해야 합니다. 새 FAQ를 추가할 때도 모든 출처 메타데이터를
함께 기록해야 합니다.

## 3. PDF 지식베이스 적재

```powershell
python scripts/index_pdf.py
```

전체 FAQ의 연결 근거를 사용하려면 아래 공식 PDF도 같은 청크 설정으로 인덱싱합니다.

```powershell
python scripts/index_pdf.py --pdf app/data/pdfs/income_tax_act_20260701.pdf
python scripts/index_pdf.py --pdf app/data/pdfs/income_tax_decree_20260701.pdf
python scripts/index_pdf.py --pdf app/data/pdfs/special_tax_treatment_act_20260701.pdf
python scripts/index_pdf.py --pdf app/data/pdfs/retirement_benefits_act_20260701.pdf
python scripts/index_pdf.py --pdf app/data/pdfs/fsc_2025_pension_savings_white_paper.pdf
python scripts/index_pdf.py --pdf app/data/pdfs/fsc_2018_retirement_pension_risk_assets.pdf
python scripts/validate_faq_pdf_links.py
```

인덱서는 청크 크기와 오버랩, 배치 크기를 검증하고 전체 청크 수와 임베딩 요청 수를 먼저
제한합니다. 임베딩이 모두 성공한 뒤에만 새 버전을 적재하고, 기존 같은 원문의 오래된 청크를
삭제합니다. 기본 청크 크기는 600자이고 인접 청크의 오버랩은 정확히 100자입니다.
임의 `--pdf` 파일은 출처를 검증된 공식 자료로 표시하지 않습니다.

```powershell
python scripts/index_pdf.py --pdf .\other.pdf --chunk-size 600 --overlap 100 --batch-size 40
```

청크 크기나 오버랩을 변경하면 기존 ChromaDB 문서는 자동으로 바뀌지 않습니다.
공식 원문을 다시 확인한 뒤 `index_pdf.py`를 재실행해 해당 원문의 청크를 교체해야 합니다.

## 4. 질문과 답변

```python
from app.services.rag_service import answer_question

result = answer_question("연금저축과 IRP의 세액공제 한도는 어떻게 다른가요?")

print(result.answer)
for source in result.sources:
    print(source.title, source.source_url, source.effective_date)
```

검색은 다음 순서로 진행됩니다.

1. ChromaDB Vector 검색과 BM25 키워드 검색에서 각각 후보를 수집합니다.
2. 중복 문서를 제거하고 RRF(Reciprocal Rank Fusion)와 조문·수치 일치 신호로
   후보를 결정론적으로 재정렬합니다.
3. 최종 문서에 FAQ가 포함되면 `source_chunk_ids`에 선언된 공식 PDF 청크를 다시 검색하지 않고 ID로 조회해 컨텍스트 뒤에 보강합니다. FAQ당 최대 2개, 전체 최대 6개 문서로 제한하며, 청크가 아직 인덱싱되지 않았거나 조회에 실패하면 FAQ 검색 결과만 사용합니다.

조문 번호, 금액과 비율은 BM25 토큰에서 보존됩니다. 최종 검색 점수가
`RAG_MIN_RELEVANCE_SCORE`보다 낮으면 OpenAI 답변 생성을 호출하지 않고 근거 부족
안내를 반환합니다. 검색된 문서의 출처 메타데이터가 불완전하면
`needs_source_verification`이 `true`가 됩니다.

시스템 프롬프트는 문서에 적힌 금액·비율·한도·조문 번호·기준연도만 사용하도록
제한합니다. 문서 간 수치가 다르면 기준일과 차이를 밝히고, 근거만으로 계산 기준을
확정할 수 없으면 임의 계산 대신 추가 확인을 안내합니다.

반환되는 금액은 예상 세액공제 효과를 설명하기 위한 참고값이며 최종 환급액을
보장하지 않습니다. 실제 결과는 결정세액과 다른 공제 항목에 따라 달라질 수
있습니다.

### 개인별 계산 요청 차단

개인별 공제액·환급액·한도 충족 여부를 묻는 채팅 질문은 검색 유사도나 LLM 판단에
맡기지 않습니다. `app/services/chat_calculation_guard.py`가 RAG 이전 단계에서
문자열 패턴을 결정론적으로 검사하고, 계산 요청이면 다음을 수행합니다.

1. 임베딩·Vector·BM25 검색과 LLM 호출을 모두 건너뜁니다.
2. 출처가 없는 고정 안내문을 반환합니다.
3. 연금저축·IRP 계산은 진단 화면으로, 진단 범위 밖 항목은 국세청 확인 경로로 안내합니다.

예를 들어 `계산해 줘`, `얼마 공제받아?`, `환급액`, `한도 채웠나요?`와 개인 급여·납입
조건을 결합한 표현을 차단합니다. 반대로 `연금계좌 세액공제 한도는 얼마인가요?`처럼
개인 조건 없이 제도 자체를 묻는 질문은 기존 RAG 흐름으로 처리합니다.

문자열 패턴은 모든 자연어 표현을 완벽히 분류하는 수단이 아니므로, 운영 중 발견한
우회 표현은 단위 테스트와 `app/data/answer_quality_eval.json`에 함께 추가합니다.

## 5. 출처 응답과 화면 표시

채팅 API의 `sources`에는 검색 및 FAQ 연결로 사용한 출처명·URL·기준일과 함께
`source_chunk_ids`, 최대 280자의 공백 정리된 `excerpt`를 반환하고 대화 이력에도
같은 항목을 보존합니다. 검색 점수(`relevance_score`)는 내부 재정렬에만 사용하며
API 응답, 저장 이력, 화면에는 포함하지 않습니다.

채팅 화면은 같은 공식 출처 URL(없으면 출처명)의 근거를 한 카드로 묶습니다. 카드를
가리키거나 키보드로 포커스하면, 모바일에서는 탭하면 각 검색 근거의 청크 식별자와
발췌를 확인할 수 있습니다.

## 참고한 공식 개발 문서

- [OpenAI Responses API 텍스트 생성](https://developers.openai.com/api/docs/guides/text)
- [OpenAI 임베딩 가이드](https://developers.openai.com/api/docs/guides/embeddings)
- [GPT-4o mini 모델](https://developers.openai.com/api/docs/models/gpt-4o-mini)
- [Chroma 컬렉션 API](https://docs.trychroma.com/reference/python/collection)
