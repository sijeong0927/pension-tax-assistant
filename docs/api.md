# API 가이드

> 기준: 2026-08-05 `main` 커밋 `9593a03`

FastAPI의 공개 API는 `/api/v1` 아래에 유지합니다. 로컬 실행 시 Swagger UI는
<http://127.0.0.1:8000/docs>에서 확인할 수 있습니다.

## 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| `GET` | `/` | 없음 | 애플리케이션 상태 메시지 |
| `POST` | `/api/v1/tax/diagnose` | 없음 | 연금계좌 세액공제 진단 |
| `POST` | `/api/v1/auth/signup` | 없음 | 회원가입 후 JWT 발급 |
| `POST` | `/api/v1/auth/login` | 없음 | OAuth2 폼 로그인 후 JWT 발급 |
| `GET` | `/api/v1/auth/me` | 필수 | 현재 사용자 조회 |
| `POST` | `/api/v1/tax-savings` | 필수 | 사용자별 진단 결과 저장·갱신 |
| `GET` | `/api/v1/tax-savings/{session_id}` | 선택 | 사용자 또는 세션 진단 결과 조회 |
| `POST` | `/api/v1/chat/query` | 선택 | 동기식 RAG 답변 및 이력 저장 |
| `POST` | `/api/v1/chat/query/stream` | 선택 | SSE 답변·출처·추천 질문 |
| `GET` | `/api/v1/chat/history/{session_id}` | 선택 | 세션 대화와 저장된 출처 조회 |
| `GET` | `/api/v1/chat/sessions` | 선택 | 최근 세션 최대 50개 조회 |
| `DELETE` | `/api/v1/chat/history/{session_id}` | 선택 | 세션 대화와 출처 삭제 |

## 인증

회원가입은 JSON 본문으로 `name`, `email`, `password`를 받습니다.

```json
{
  "name": "홍길동",
  "email": "user@example.com",
  "password": "example-password"
}
```

로그인은 `application/x-www-form-urlencoded` 형식의 `username`(이메일)과
`password`를 받습니다. 성공 시 반환된 토큰을 보호된 API에 전달합니다.

```http
Authorization: Bearer <TOKEN>
```

챗봇·대화 이력 API는 인증 없이도 사용할 수 있습니다. 로그인한 경우 `user_id`와
세션 ID를 함께 사용해 사용자별 데이터를 조회합니다. 진단 결과 저장 API는 로그인이
필수입니다.

## 진단 API

요청:

```json
{
  "total_salary": 50000000,
  "pension_savings": 4000000,
  "irp": 3000000
}
```

응답의 `data`에는 다음 주요 값이 포함됩니다.

- 소득 구간과 예상 공제 효과율
- 연금저축·IRP 공제대상 납입액
- 총 공제대상 납입액과 예상 세액공제액
- 내부 추정 결정세액과 예상 환급액
- 남은 한도와 추천 추가 납입 배분

계산식과 한도는 LLM이 아니라 `app/services/tax_credit_service.py`에서
결정론적으로 처리합니다.

## 챗봇 API

요청:

```json
{
  "session_id": "session_20260805",
  "question": "연금저축과 IRP의 차이가 뭐야?"
}
```

동기식 응답은 `success`, `answer`, `sources`를 반환합니다. 답변과 출처
메타데이터는 SQLite 대화 이력에 저장됩니다.

스트리밍 API는 다음 SSE 이벤트를 보냅니다.

| 이벤트 | 내용 |
| --- | --- |
| `sources` | 검색에 사용한 공식 출처 메타데이터 |
| `message` | 답변 텍스트 조각 |
| `quick_replies` | 후속 추천 질문 3개 |
| `error` | 스트리밍 중 발생한 오류 |

답변의 `[문서 n]` 표시는 같은 순번의 출처와 연결됩니다. UI에는 FAQ 질문이나 내부
문서 ID 대신 공식 출처명과 기준일을 표시합니다.

## 데이터 저장과 개인정보

- 로컬 SQLite 파일은 `app/data/chat_history.db`에 생성됩니다.
- DB 파일은 `.gitignore`에 포함되어 Git으로 추적하지 않습니다.
- 사용자 비밀번호는 bcrypt 해시로 저장합니다.
- 채팅 저장 전 주민등록번호와 휴대전화번호 패턴을 마스킹합니다.
- AI 답변 출처는 `chat_history_sources` 보조 테이블에 저장합니다.
- JWT는 현재 프론트엔드 `localStorage`에 저장합니다.

마스킹은 주민등록번호와 휴대전화번호 패턴에 한정됩니다. 이메일, 계좌번호 등 모든
개인정보를 탐지하는 범용 DLP 기능은 아니므로 실제 민감정보를 입력하지 않아야 합니다.

## 관련 문서

- [프로젝트 README](../README.md)
- [개발·검증 가이드](development.md)
- [RAG 운영 문서](rag.md)
