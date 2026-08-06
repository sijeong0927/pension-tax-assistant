# 개발·검증 가이드

> 코드 기준: 2026-08-05 `main` 커밋 `9593a03`
> GitHub 조회 기준: 2026-08-05

## 구현 현황

| 영역 | 상태 | 현재 구현 |
| --- | --- | --- |
| 연금계좌 진단 | ✅ | 총급여, 연금저축, IRP 납입액 기반 결정론적 계산 |
| 진단 UI | ✅ | 총급여·계좌 선택, 납입액 시뮬레이터, 계좌별 한도 안내 |
| RAG 검색 | ✅ | ChromaDB Vector + 한국어 BM25 + 로컬 RRF 재정렬 |
| 챗봇 | ✅ | 일반 응답, SSE 스트리밍, 추천 질문 3개 |
| 대화 이력 | ✅ | SQLite 저장, 세션 목록·조회·삭제, 최근 6개 메시지 문맥 |
| 출처 표시 | ✅ | `[문서 n]` 인용, 공식 출처·기준일, 이력 출처 복원 |
| 인증 | ✅ | 이메일 회원가입·로그인, JWT 발급, 현재 사용자 조회 |
| 절세 정보 저장 | ✅ | 로그인 사용자별 최신 진단 결과 저장·조회 |
| 오프라인 평가 | ✅ | 검색 평가 9건, 답변 품질 평가 20건 |
| 운영 안전장치 | 🚧 | 호출 제한, 오류 응답 정규화, 운영 DB·마이그레이션 보강 필요 |

현재 진단 화면은 총급여 구간과 연금저축·IRP 보유 여부를 입력받습니다. ISA는 RAG
지식과 상담 범위에는 포함되어 있지만 결정론적 진단 API 입력에는 아직 연결되지
않았습니다.

## 로컬 검증 결과

| 검증 | 2026-08-05 결과 |
| --- | --- |
| Python 컴파일·JSON 3종·`git diff --check` | 통과 |
| `pytest` | 79개 통과, 경고 3건 |
| 프론트엔드 `test:ui` | 3개 통과 |

## 백엔드 준비

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

`.env`에는 실제 OpenAI API 키와 개발용 JWT 비밀키를 설정합니다.

```dotenv
OPENAI_API_KEY=...
SECRET_KEY=충분히_긴_무작위_개발용_비밀키
```

`SECRET_KEY` 예시 기본값은 실제 배포에 사용하면 안 됩니다. 최신 코드는 SQLAlchemy
기반 SQLite 영속화를 직접 사용합니다. 새 환경에서 `sqlalchemy` import가 실패하면
임시로 `SQLAlchemy>=2,<3`을 설치하고 저장소 의존성 파일을 별도 작업으로 정리해야
합니다.

## RAG 인덱스 생성

FAQ 원문이 바뀌었거나 새 개발 환경을 준비할 때 수동으로 실행합니다. OpenAI 임베딩
API 비용이 발생합니다.

```powershell
python scripts/index_tax_faq.py --strict-provenance
python scripts/index_pdf.py
```

세부 환경변수와 비용 제한은 [RAG 운영 문서](rag.md)를 참고하세요.

## 애플리케이션 실행

백엔드:

```powershell
python -m uvicorn app.main:app --reload
```

- API 상태: <http://127.0.0.1:8000/>
- Swagger UI: <http://127.0.0.1:8000/docs>

새 PowerShell 터미널에서 프론트엔드를 실행합니다.

```powershell
Set-Location frontend
npm ci
$env:NEXT_PUBLIC_API_URL="https://tax-i-ef90.onrender.com"
npm run dev
```

- 웹 UI: <http://localhost:3000/>
- 로그인: <http://localhost:3000/login>
- 진단: <http://localhost:3000/diagnose>
- 챗봇: <http://localhost:3000/chat>

## 테스트와 평가

기본 검증:

```powershell
python -m compileall app scripts tests
python -m json.tool app/data/tax_faq.json > $null
python -m json.tool app/data/answer_quality_eval.json > $null
python -m json.tool app/data/retrieval_eval.json > $null
pytest
git diff --check
```

프론트엔드 검증:

```powershell
Set-Location frontend
npm run test:ui
npm run lint
npm run build
```

검색·답변 품질 평가는 실제 OpenAI API를 사용하므로 비용이 발생합니다.

```powershell
python scripts/evaluate_hybrid_search.py --top-k 4
python scripts/evaluate_answer_quality.py --output .\tmp\answer_quality_report.json
```

자세한 기준과 결과는 [검색 평가](retrieval-evaluation.md)와
[답변 품질 평가](answer-quality-evaluation.md)를 참고하세요.

## 프로젝트 구조

```text
pension-tax-assistant/
├── app/
│   ├── api/v1/               # 인증·진단·챗봇·절세 저장 API
│   ├── core/                 # 설정·보안·프롬프트·Vector DB
│   ├── data/                 # FAQ·평가셋·공식 PDF
│   ├── db/                   # SQLite 세션
│   ├── models/               # Pydantic·SQLAlchemy 모델
│   ├── services/             # 계산·RAG·대화 이력·평가
│   └── main.py
├── docs/
├── frontend/
│   └── src/
│       ├── app/              # 랜딩·로그인·진단·챗봇
│       ├── components/
│       └── lib/
├── scripts/                  # 인덱싱·평가 도구
├── tests/
├── .env.example
├── AGENTS.md
├── README.md
└── requirements.txt
```

## 최근 GitHub 반영

2026-08-05 조회 시 열린 이슈와 PR은 없습니다.

| PR | 반영 내용 |
| --- | --- |
| [#62](https://github.com/sijeong0927/pension-tax-assistant/pull/62) | 메인 호칭과 연금저축·IRP 한도 안내 개선 |
| [#60](https://github.com/sijeong0927/pension-tax-assistant/pull/60) | RAG 출처 메타데이터 기본키 수정 |
| [#58](https://github.com/sijeong0927/pension-tax-assistant/pull/58) | JWT 인증과 사용자별 절세 진단 저장 |
| [#57](https://github.com/sijeong0927/pension-tax-assistant/pull/57) | 대화 이력의 RAG 출처 보존 |
| [#56](https://github.com/sijeong0927/pension-tax-assistant/pull/56) | 로컬 채팅 DB Git 추적 해제 |
| [#51](https://github.com/sijeong0927/pension-tax-assistant/pull/51) | 인용 UI에 공식 출처와 기준일만 표시 |
| [#49](https://github.com/sijeong0927/pension-tax-assistant/pull/49) | SSE 스트리밍, 추천 질문, 절세 대시보드 |
| [#46](https://github.com/sijeong0927/pension-tax-assistant/pull/46) | 답변 품질 오프라인 평가 |
| [#43](https://github.com/sijeong0927/pension-tax-assistant/pull/43) | RAG 대화 문맥과 서버 기반 세션 관리 |
| [#40](https://github.com/sijeong0927/pension-tax-assistant/pull/40) | 연금·일반 연말정산 FAQ 18개 확장 |
| [#39](https://github.com/sijeong0927/pension-tax-assistant/pull/39) | 결정세액 한도를 반영한 계산 엔진 |
| [#38](https://github.com/sijeong0927/pension-tax-assistant/pull/38) | 외부 리랭커 제거와 로컬 RRF 재정렬 |

## 운영 전 보강 항목

- 챗봇·인증 API 호출 제한과 안전한 공통 오류 응답
- 운영 환경용 CORS 허용 목록과 HTTPS
- JWT 비밀키 회전, 토큰 저장 방식과 만료 정책 보강
- Alembic 등 DB 마이그레이션과 운영용 데이터베이스
- 인증·절세 저장 API의 통합 테스트
- 이메일·계좌번호 등 추가 PII 탐지
- ISA 만기자금 전환을 결정론적 진단 흐름에 연결
- Python 의존성 목록에 SQLAlchemy를 명시적으로 고정

## 관련 문서

- [프로젝트 README](../README.md)
- [API 가이드](api.md)
- [RAG 운영 문서](rag.md)
