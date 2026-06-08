# 🎁 2026 2분기 GWP 선물 대시보드

138명이 함께 2분기(4~6월) GWP 선물 후보를 등록하고 **총 276만원(138명 × 2만원)** 예산을
실시간으로 공유하는 대시보드입니다.

- **공유 데이터**: Cloudflare D1(SQLite)에 저장되어 모두가 같은 목록·예산을 봅니다.
- **항목별 비밀번호**: 등록 시 본인이 정한 비밀번호로만 해당 항목을 수정·삭제할 수 있습니다.
  (비밀번호는 평문 저장하지 않고 항목별 salt + SHA-256 해시로만 보관)
- **예산 현황**: 사용/잔여 금액과 진행률 바를 표시하며, 초과 시 경고합니다(등록은 차단하지 않음).

## 기술 스택
- Cloudflare **Workers** (API + 정적 자산 서빙)
- Cloudflare **D1** (데이터베이스)
- 프런트엔드: 바닐라 JS/CSS (빌드 단계 없음)

## 프로젝트 구조
```
src/worker.js           # API 라우터 + 비밀번호 해시/검증 + D1 접근
public/                 # 정적 SPA (index.html, styles.css, app.js)
migrations/0001_init.sql# gifts 테이블 스키마
wrangler.toml           # Worker/자산/예산/D1 설정
```

## API
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/state` | 예산 요약 + 선물 목록 (비밀번호 정보 제외) |
| POST | `/api/gifts` | 선물 등록 `{name,url,price,quantity,registrant,note,password}` |
| PUT | `/api/gifts/:id` | 수정 (비밀번호 검증) |
| DELETE | `/api/gifts/:id` | 삭제 (비밀번호 검증) |

## 예산 설정
`wrangler.toml`의 `[vars]`에서 조정합니다.
```toml
TOTAL_BUDGET = "2760000"
HEADCOUNT    = "138"
PER_PERSON   = "20000"
```

## 로컬 실행
```bash
npm install
npm run db:migrate:local   # 로컬 D1에 스키마 적용
npm run dev                # http://localhost:8787
```

## 배포 (Cloudflare)
1. D1 데이터베이스 생성 후 `wrangler.toml`의 `database_id` 채우기
   ```bash
   npx wrangler d1 create gwp-2026-q2
   ```
2. 원격 DB에 스키마 적용
   ```bash
   npm run db:migrate:remote
   ```
3. (선택) 주최자용 관리자 비밀번호 설정 — 모든 항목 수정·삭제 가능
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   ```
4. 배포
   ```bash
   npm run deploy
   ```
   배포 후 출력되는 `*.workers.dev` 주소가 공유 URL입니다.

> CI/헤드리스 환경에서는 `CLOUDFLARE_API_TOKEN`(필요 시 `CLOUDFLARE_ACCOUNT_ID`)
> 환경변수로 인증한 뒤 `npm run deploy`를 실행합니다.

## 보안 메모
- 비밀번호는 항목별 16바이트 salt와 함께 SHA-256으로 해시되어 저장되며, API 응답에 노출되지 않습니다.
- 모든 사용자 입력은 프런트엔드 렌더링 시 HTML escape 처리합니다.
- `ADMIN_PASSWORD`를 설정하면 주최자가 모든 항목을 관리할 수 있습니다(미설정 시 비활성).
