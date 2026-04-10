# 프로젝트 구조 + 기술 스택

> 이 파일은 "빠른 참조용 스냅샷"이다. **Ground truth는 코드** (package.json, src/ 구조).
> 작성 기준: 2026-04-10, package.json 직접 읽기

---

## 기술 스택 (package.json 기준)

| 항목 | 값 | 출처 |
|------|-----|------|
| React | ^19.2.0 | dependencies |
| React DOM | ^19.2.0 | dependencies |
| React Router DOM | ^7.13.1 | dependencies |
| Zustand | ^5.0.11 | dependencies |
| Supabase JS | ^2.98.0 | dependencies |
| TypeScript | ~5.9.3 | devDependencies |
| Vite | ^7.3.1 | devDependencies |
| ESLint | ^9.39.1 | devDependencies |

- **build 스크립트**: `tsc -b && vite build` (package.json scripts.build)
- **패키지 매니저**: npm (package-lock.json 존재로 판별)

## 참고 (package.json 외 출처)

| 항목 | 값 | 출처 |
|------|-----|------|
| Supabase ref | nunrougezfkuknxuqsdg | `supabase/.temp/project-ref` |

---

## 디렉토리 구조 (실제 src/ 기준)

```
src/
├── App.tsx, main.tsx, router.tsx
├── components/
│   ├── admin/                # 어드민 전용 (게임과 import 공유 금지)
│   │   ├── layout-editor/    # 주방 레이아웃 편집기 (GridEditor, PanelScene 등)
│   │   ├── AdminHeader.tsx
│   │   ├── ContainersManager.tsx
│   │   ├── KitchenLayoutEditor.tsx
│   │   ├── RecipeManager.tsx
│   │   ├── StaffManager.tsx
│   │   └── StoreIngredientsManager.tsx
│   ├── equipment/            # 장비 컴포넌트 (게임/어드민 공용)
│   │   ├── FryingBasketComponent.tsx
│   │   ├── MicrowaveComponent.tsx
│   │   ├── SinkComponent.tsx
│   │   └── WokComponent.tsx
│   ├── game/                 # 게임 화면 전용 (어드민과 import 공유 금지)
│   │   ├── GameHeader.tsx
│   │   ├── GameKitchenView.tsx
│   │   ├── RecipeErrorPopup.tsx
│   │   ├── RejectionPopup.tsx
│   │   ├── SelectionDisplay.tsx
│   │   ├── SessionResultOverlay.tsx
│   │   └── WokBlockedPopup.tsx
│   ├── layout/               # 공용 레이아웃 (BillQueue, Handbar, Route guards)
│   └── ui/                   # 공용 UI (OrderSelectModal, QuantityInputModal)
├── hooks/                    # useClickInteraction, useGameTick, useOrderGenerator 등
├── lib/
│   ├── interaction/          # 인터랙션 로직 (constants, generatePresets, resolveAction)
│   ├── physics/              # 물리 시뮬레이션 (wok, fryingBasket, microwave)
│   ├── recipe/               # 레시피 분석/평가
│   ├── scoring/              # 채점 상수
│   ├── storage.ts            # 로컬 스토리지
│   └── supabase.ts           # Supabase 클라이언트
├── pages/                    # 페이지 컴포넌트 (Admin, Game, Login, Join 등)
├── stores/                   # Zustand 스토어
│   ├── authStore.ts
│   ├── equipmentStore.ts
│   ├── gameStore.ts
│   ├── scoringStore.ts
│   ├── selectionStore.ts
│   └── uiStore.ts
├── styles/
│   └── gameVariables.css     # CSS 변수 정의 (반응형 3단계: default/tablet/mobile)
└── types/
    ├── db.ts                 # DB 스키마 타입
    └── game.ts               # 런타임 전용 타입
```

---

## 핵심 파일 위치

| 역할 | 파일 |
|------|------|
| CSS 변수 | src/styles/gameVariables.css |
| DB 타입 | src/types/db.ts |
| 게임 타입 | src/types/game.ts |
| Supabase 클라이언트 | src/lib/supabase.ts |
| 라우터 | src/router.tsx |
| 물리엔진 | src/lib/physics/ |
| 인터랙션 | src/lib/interaction/ + src/hooks/useClickInteraction.ts |
