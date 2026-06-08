# 🎉 선행기구개발그룹 GWP 대시보드 (2026. 6. 23)

선행기구개발그룹 GWP 행사를 위한 공유 대시보드입니다. 구성원이 함께 선물 후보와 파트별 식당을
등록하고, **선물 예산 총 276만원(138명 × 2만원)** 을 실시간으로 공유합니다.

**대시보드 주소**: https://yonchelee.github.io/2026_2nd_GWP/

## 구성
- **행사 진행**: 행사 일정/순서 안내 (정적 — `index.html`에서 수정)
- **선물 현황 및 추천**: 예산 현황 + 선물 후보 등록 (입력 가능)
- **파트별 식당 현황**: 파트별 만찬 식당 등록 (입력 가능)

### 특징
- **공유 데이터**: Cloudflare D1(SQLite)에 저장되어 모두가 같은 목록·예산을 봅니다.
- **항목별 비밀번호**: 등록 시 본인이 정한 비밀번호로만 해당 항목을 수정·삭제할 수 있습니다.
  (평문 저장하지 않고 항목별 salt + SHA-256 해시로만 보관)
- **예산 현황**: 사용/잔여 금액과 진행률 바를 표시하며, 초과 시 경고합니다(등록은 차단하지 않음).

## 아키텍처
- **UI**: GitHub Pages가 정적 파일(`index.html`, `app.js`, `styles.css`)을 서빙
- **API**: Cloudflare **Worker**가 `/api/*` (D1 데이터)만 담당 — CORS 허용
- **DB**: Cloudflare **D1**

```
브라우저(github.io) ──CORS──> Cloudflare Worker(/api/*) ──> D1
```

## 프로젝트 구조
```
index.html, app.js, styles.css   # 정적 UI (GitHub Pages가 서빙)
.nojekyll                         # Jekyll 비활성화(정적 파일 그대로 배포)
src/worker.js                     # API 라우터 + 비밀번호 해시/검증 + D1 접근
migrations/0001_init.sql          # gifts 테이블 스키마
migrations/0002_restaurants.sql   # restaurants 테이블 스키마
wrangler.toml                     # Worker/예산/D1 설정
```

## API (Cloudflare Worker)
| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/state` | 예산 요약 + 선물 + 식당 목록 (비밀번호 정보 제외) |
| POST | `/api/gifts` | 선물 등록 `{name,url,price,quantity,registrant,note,password}` |
| PUT/DELETE | `/api/gifts/:id` | 선물 수정/삭제 (비밀번호 검증) |
| POST | `/api/restaurants` | 식당 등록 `{part,restaurant,category,headcount,url,note,password}` |
| PUT/DELETE | `/api/restaurants/:id` | 식당 수정/삭제 (비밀번호 검증) |

## 예산 설정
`wrangler.toml`의 `[vars]`에서 조정합니다.
```toml
TOTAL_BUDGET = "2760000"
HEADCOUNT    = "138"
PER_PERSON   = "20000"
```

## 로컬 실행 (API)
```bash
npm install
npm run db:migrate:local                 # 로컬 D1에 스키마 적용
npx wrangler d1 execute gwp-2026-q2 --local --file=./migrations/0002_restaurants.sql
npm run dev                              # http://localhost:8787 (API)
```

## 배포
### UI (GitHub Pages)
저장소 기본 브랜치에 정적 파일을 푸시하면 GitHub Pages가 자동 배포합니다.
(Settings → Pages → "Deploy from a branch", 루트 `/`)

### API (Cloudflare Worker)
```bash
npx wrangler d1 create gwp-2026-q2       # 최초 1회, database_id를 wrangler.toml에 기입
npm run db:migrate:remote                # 원격 D1 스키마 적용 (0001)
npx wrangler d1 execute gwp-2026-q2 --remote --file=./migrations/0002_restaurants.sql
npx wrangler secret put ADMIN_PASSWORD   # (선택) 주최자용 관리자 비밀번호
npm run deploy
```
> 헤드리스 환경에서는 `CLOUDFLARE_API_TOKEN`(필요 시 `CLOUDFLARE_ACCOUNT_ID`) 환경변수로 인증합니다.

## 보안 메모
- 비밀번호는 항목별 16바이트 salt와 함께 SHA-256으로 해시되어 저장되며, API 응답에 노출되지 않습니다.
- 모든 사용자 입력은 프런트엔드 렌더링 시 HTML escape 처리합니다.
- `ADMIN_PASSWORD`를 설정하면 주최자가 모든 항목을 관리할 수 있습니다(미설정 시 비활성).
