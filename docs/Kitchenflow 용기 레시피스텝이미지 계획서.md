# KitchenFlow — 용기 관리 + 레시피 스텝 이미지 구현 계획서

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.

---

## 0. 작업 프로세스 (모든 Step에 적용)

모든 Step은 아래 6단계 프로세스를 반드시 거친다.

```
1. 계획    — 이 문서의 해당 Step을 읽고 무엇을 할지 파악
2. 정보 검토 — 관련 최신 코드, DB 스키마, 타입 정의를 직접 확인
3. 요청    — 변경 내용을 사용자에게 제시하고 승인 요청
4. 검토    — 사용자 피드백 반영, 기존 원칙과 충돌 여부 재확인
5. 실행    — 승인된 내용만 구현
6. 확인    — 변경 후 기존 기능이 깨지지 않았는지 검증
```

**절대 금지**: 최신 코드를 확인하지 않고 추정으로 파일을 수정하는 것.

---

## 1. 배경

### 현재 상태

| 항목 | DB 테이블 | 타입 정의 | 게임 소비 로직 | 어드민 관리 UI | 데이터 |
|------|----------|----------|--------------|-------------|--------|
| 용기 (containers) | ✅ 존재 | ✅ Container 타입 | ✅ ContainerCard에서 image_url 사용 | ❌ 없음 | 일부 (SQL 직접 입력) |
| 레시피 스텝 (recipe_steps) | ✅ 존재 | ✅ RecipeStep 타입 | ✅ RightSidebar에서 step_order 기반 이미지 교체 | ❌ 없음 | ❌ 없음 |

### 문제

- 용기 이미지가 대부분 없어서 게임에서 그릇이 텍스트 placeholder로 표시됨
- 레시피 스텝 이미지가 없어서 조리 과정이 시각적으로 표현되지 않음
- 어드민에서 관리할 수 없어 Supabase 대시보드에서 SQL로만 데이터 입력 가능

### 목표

1. 어드민에 "용기 관리" 탭을 추가하여 용기 CRUD + 이미지 업로드 가능하게 함
2. 기존 "레시피 관리" 탭에 recipe_steps 이미지 업로드 UI를 추가함
3. 게임 렌더링은 이미 구현되어 있으므로, 이미지 데이터만 채우면 동작함

---

## 2. DB 현황 (변경 없음)

### containers 테이블

```
id              uuid (PK)
store_id        uuid (FK → stores)
name            text
container_type  text ('bowl' | 'plate' | 'pot' | 'box')
image_url       text (nullable)
```

### recipe_steps 테이블

```
id              uuid (PK)
recipe_id       uuid (FK → recipes)
store_id        uuid (FK → stores)
step_order      integer
image_url       text
```

DB 스키마 변경 불필요. 두 테이블 모두 이미 존재한다.

---

## 3. 게임 렌더링 (이미 구현된 부분)

### 그릇 이미지 표시

ContainerCard에서 `Container.image_url`이 있으면 이미지를 표시하고, 없으면 텍스트 placeholder.

### 스텝 이미지 교체 방식

RightSidebar의 `getContainerImageUrl` 함수가 처리:
1. 주문 미배정 → Container.image_url (빈 그릇)
2. 주문 배정 → recipe_steps에서 `(recipe_id, 현재 plate_order)` 기준 이미지 조회
3. 재료가 추가될 때마다 plate_order가 증가 → 해당 step_order의 이미지로 **교체** (누적 아님)
4. fallback: RecipeStep 이미지 → Container 기본 이미지 → 텍스트 placeholder

---

## 4. Step 1 — 용기 관리 탭 신설

### 무엇을 해야 하는지

어드민 페이지에 4번째 탭 "용기 관리"를 추가한다.

### 변경 대상

| 파일 | 변경 |
|------|------|
| AdminPage.tsx | AdminTab union에 'containers' 추가, 탭 버튼 추가, 조건부 렌더링 |
| ContainersManager.tsx (신규) | containers CRUD + 이미지 업로드 컴포넌트 |

### ContainersManager 기능

- **목록 조회**: 해당 store_id의 containers 전체 표시 (이름, 타입, 이미지 프리뷰)
- **추가**: name, container_type 입력 + 이미지 파일 업로드
- **수정**: 기존 항목의 name, container_type 변경 + 이미지 교체
- **삭제**: 항목 삭제 (해당 container를 참조하는 레시피/그릇 인스턴스가 있으면 주의 필요)
- **이미지 업로드**: Supabase Storage 'assets' 버킷, 경로 `containers/{timestamp}_{name}.{ext}`

### 지켜야 할 원칙

- StoreIngredientsManager의 기존 패턴(Supabase 쿼리, uploadToStorage, UI 구조)을 따른다
- container_type은 db.ts의 Container 타입에 정의된 값을 선택 드롭다운으로 제공
- store_id는 현재 매장 ID를 사용

### 확인할 것 (정보 검토 단계)

- StoreIngredientsManager의 CRUD 패턴 (쿼리, 상태 관리, 에러 처리)
- uploadToStorage 함수의 사용법
- containers 테이블의 RLS 정책 (store_id 기반 접근 허용되어 있는지)

---

## 5. Step 2 — 레시피 관리 탭에 recipe_steps UI 추가

### 무엇을 해야 하는지

RecipeManager에서 레시피 편집 시, recipe_ingredients 아래에 recipe_steps 이미지 편집 영역을 추가한다.

### 변경 대상

| 파일 | 변경 |
|------|------|
| RecipeManager.tsx | recipe_steps 편집 UI 추가, 저장 시 recipe_steps도 함께 처리 |

### recipe_steps 편집 UI 동작

- 레시피의 recipe_ingredients가 plate_order로 정렬되어 있음
- step_order 0 = 빈 그릇 상태 이미지 (재료 투입 전)
- step_order N = plate_order N까지의 재료가 담긴 후 이미지
- 각 step_order별로 이미지 업로드 가능
- 레시피 저장 시 recipe_steps도 delete-then-insert (recipe_ingredients와 동일 패턴)

### step_order 매핑 규칙

```
step_order 0 → 빈 그릇 이미지 (optional)
step_order 1 → plate_order 1 재료까지 담긴 이미지
step_order 2 → plate_order 2 재료까지 담긴 이미지
...
```

### 확인할 것 (정보 검토 단계)

- RightSidebar의 getContainerImageUrl에서 step_order를 정확히 어떻게 매핑하는지 (plate_order와 1:1인지)
- RecipeManager의 현재 저장 흐름 (recipe_ingredients delete-then-insert 패턴)
- recipe_steps.store_id를 저장 시 현재 store_id로 넣어야 하는지 확인
- recipe_steps 테이블의 RLS 정책

### 이미지 업로드

- Supabase Storage 'assets' 버킷
- 경로: `recipe-steps/{recipe_id}_{step_order}_{timestamp}.{ext}`
- 기존 uploadToStorage 유틸 사용

---

## 6. Step 3 — 정리

### 무엇을 해야 하는지

이번 섞기 작업에서 남긴 디버그 코드와 테스트 하드코딩을 정리한다.

### 변경 대상

| 파일 | 변경 |
|------|------|
| evaluate.ts | `[evaluateContainer]` 디버그 console.log 전부 제거 |
| GamePage.tsx | `// TODO: 테스트용 하드코딩 — 제거 필요` 블록 제거, 원래 주문 로직 주석 해제 |

---

## 7. 검증 시나리오

### Step 1 검증

- 어드민 "용기 관리" 탭에서 용기 추가 (이름 + 타입 + 이미지)
- 이미지 프리뷰 표시 확인
- 수정/삭제 동작 확인
- 게임에서 해당 용기를 사이드바에 드롭했을 때 업로드한 이미지 표시

### Step 2 검증

- 레시피 편집에서 step별 이미지 업로드
- 게임에서 재료를 그릇에 담을 때마다 스텝 이미지가 교체되는지 확인
- fallback 동작: 스텝 이미지 없는 step → 그릇 기본 이미지

### Step 3 검증

- 콘솔에 디버그 로그 없음
- 게임 시작 시 정상 주문 생성 (하드코딩 제거)

---

_작성 완료_