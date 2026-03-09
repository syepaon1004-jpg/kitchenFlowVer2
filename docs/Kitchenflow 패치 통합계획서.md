# KitchenFlow — 패치 통합 계획서 (Zone 등록 / 재료·레시피 / 투입량 / 웍 볶기)

> **이 문서는 지휘 문서다.** 구현 코드를 지시하지 않는다.
> "무엇을 해야 하는지"와 "어떤 원칙을 지켜야 하는지"만 정의한다.
> "어떻게 구현하는지"는 Claude Code가 최신 코드를 확인한 후 판단한다.

---

## 0. 작업 프로세스 (모든 Step에 적용)

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

## 패치 1: 주방 구역 추가 시스템

### 목표

어드민 페이지에서 새 kitchen_zone을 등록하고, 이미지를 업로드하고, 
바로 히트박스 배치를 시작할 수 있는 플로우를 만든다.

### 사용자 플로우

```
1. 어드민 페이지 좌측 zone 목록 하단의 "주방 구역 추가" 버튼 클릭
2. 입력 폼 표시:
   - zone_key (영문 소문자 + 언더스코어, 고유값)
   - label (한글 표시명, 예: "1번 서랍냉장고 좌상")
   - 이미지 파일 선택 (필수)
3. 이미지 선택 시:
   - 브라우저에서 Image 객체로 naturalWidth/naturalHeight 캡처
   - Supabase Storage assets 버킷에 업로드
   - public URL 획득
4. 저장 클릭 시:
   - kitchen_zones INSERT (store_id, zone_key, label, image_url, 
     image_width, image_height)
   - image_width/height는 캡처한 natural 크기로 자동 저장
5. 저장 완료 → zone 목록 갱신 → 새 zone 자동 선택 → 히트박스 배치 시작
```

### DB 변경

없음. kitchen_zones 테이블 구조 그대로 사용.

### 규칙

- image_width/image_height는 업로드 시 자동 캡처. 수동 입력 금지.
- zone_key는 영문 소문자 + 언더스코어만 허용 (Storage 파일명 규칙과 동일)
- zone_key 중복 검사 필요 (같은 store_id 내)
- store_id는 현재 로그인한 매장의 id (현재 하드코딩된 TEST01 매장)

### Claude Code 작업 프로세스

```
1. 계획    — 위 플로우 파악
2. 정보 검토 — AdminPage.tsx의 zone 목록 렌더링 구조, 
              zone 선택 로직, 기존 Storage 업로드 유틸(storage.ts) 확인
3. 요청    — UI 변경 계획을 사용자에게 제시
4. 검토    — 기존 zone 선택/히트박스 편집 플로우에 영향 없는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — zone 추가 → 이미지 업로드 → 히트박스 배치 전체 플로우 검증
```

---

## 패치 2: 재료 + 레시피 등록

### 2-A: 원재료 등록 (개발자 전용 페이지)

#### 목표

ingredients_master 테이블에 원재료를 등록하는 페이지. 
개발자(본인)만 접근 가능. 일반 사용자(점장, 알바)는 접근 불가.

#### 사용자 플로우

```
1. 별도 라우트로 접근 (예: /dev/ingredients)
2. 현재 등록된 원재료 목록 표시 (ingredients_master 전체)
3. 새 원재료 추가: name 입력 → INSERT
4. 기존 원재료 수정/삭제 가능
```

#### 접근 제한

- 간단한 방법: URL에 쿼리 파라미터로 비밀 키 확인 (예: ?key=xxx)
- 또는 라우트 자체를 추측하기 어려운 경로로 설정
- RLS는 현재 미적용 상태이므로 클라이언트 레벨 제한으로 충분
- 추후 인증 시스템 구축 시 role 기반 접근 제어로 전환

#### DB 변경

없음. ingredients_master 테이블 구조 그대로 사용.

---

### 2-B: 매장 재료 등록 (어드민 페이지)

#### 목표

store_ingredients 테이블에 매장 재료를 등록하는 페이지.
점장이 어드민에서 사용.

#### 사용자 플로우

```
1. 별도 어드민 페이지 또는 탭 (예: /admin/ingredients)
2. 현재 매장에 등록된 store_ingredients 목록 표시
3. 새 재료 추가:
   a. ingredients_master에서 원재료 선택 (검색/드롭다운)
   b. display_name 입력 (기본값: 원재료 name)
   c. state_label 입력 (선택, 예: "다이스", "채썰기")
   d. unit 선택 (g/ml/ea/spoon/portion/pinch)
   e. default_quantity 입력
   f. image_url 업로드 (선택)
4. 저장 → store_ingredients INSERT
5. 기존 재료 수정/삭제 가능
```

#### DB 변경

없음. store_ingredients 테이블 구조 그대로 사용.

#### 규칙

- master_id는 반드시 ingredients_master의 유효한 id여야 함
- 같은 store_id + master_id 조합이 중복될 수 있음 
  (같은 원재료를 다른 state_label로 등록 가능: "양파 다이스", "양파 채")
- store_id는 현재 매장 id

---

### 2-C: 레시피 등록 (어드민 페이지)

#### 목표

recipes + recipe_ingredients 테이블에 레시피를 등록하는 페이지.
자연어 입력 → AI 분석 → 데이터화 → 수동 보정 플로우.

#### 선결 조건

- store_ingredients 데이터가 있어야 AI가 재료명을 매칭 가능
- containers 데이터가 있어야 AI가 그릇을 매칭 가능

#### 사용자 플로우

```
1. 별도 어드민 페이지 또는 탭 (예: /admin/recipes)
2. 현재 매장에 등록된 recipes 목록 표시
3. 새 레시피 추가:
   a. 레시피명 입력
   b. 자연어 조리법 입력 (textarea)
      예: "양파 50g을 넣고 10초 볶고 양배추 100g을 넣고 
           10초를 볶고 사각 그릇에 옮겨서 그 위에 숙주 한주먹을 올린다"
   c. "AI 분석" 버튼 클릭
   d. AI가 파싱한 결과를 테이블 형태로 표시:
      
      | 재료 | 수량 | 단위 | 액션 | 시간(초) | plate_order | 상태 |
      |------|------|------|------|----------|-------------|------|
      | 양파 | 50   | g    | stir | 10       | 1           | ✅ 매칭 |
      | 양배추| 100  | g    | stir | 10       | 1           | ✅ 매칭 |
      | 숙주 | 1    | portion | -  | -        | 2           | ⚠️ 확인필요 |
      
   e. 각 행을 수동으로 편집 가능:
      - 재료: store_ingredients에서 select로 변경
      - 수량/단위/액션/시간/plate_order 직접 수정
      - 매칭 실패한 재료는 빨간색 표시
   f. target_container 선택 (containers 목록에서)
   g. 저장 → recipes INSERT + recipe_ingredients 일괄 INSERT
```

#### AI 분석 구현

- Anthropic API 호출 (Claude Sonnet)
- system prompt에 현재 매장의 store_ingredients 목록과 containers 목록을 포함
- 자연어 입력을 JSON 형식으로 파싱하도록 지시
- 응답 형식:
  ```json
  {
    "ingredients": [
      {
        "matched_ingredient_id": "uuid 또는 null",
        "raw_name": "양파",
        "quantity": 50,
        "unit": "g",
        "action_type": "stir",
        "duration_sec": 10,
        "plate_order": 1,
        "confidence": "high"
      }
    ],
    "target_container": {
      "matched_container_id": "uuid 또는 null",
      "raw_name": "사각 그릇"
    }
  }
  ```

#### AI 도입을 위해 필요한 것

- Anthropic API 키: 환경변수로 관리 (VITE_ANTHROPIC_API_KEY)
  → 단, 프론트엔드에서 직접 호출하면 API 키가 노출됨
  → Supabase Edge Function 또는 별도 서버리스 함수로 프록시 필요
  → 또는 개발 단계에서는 프론트엔드 직접 호출 후, 프로덕션에서 프록시 전환
- store_ingredients, containers 데이터가 선행 등록되어야 함

#### DB 변경

없음. recipes, recipe_ingredients 테이블 구조 그대로 사용.
단, recipe_ingredients의 required_duration_min/max 중 
AI가 파싱한 duration은 min에 넣고 max는 null(허용 상한 없음)로 설정하는 것을 기본으로 하되, 
수동 편집에서 max도 설정 가능하게.

---

## 패치 3: 투입량 결정 프로세스

### 목표

재료를 장비/그릇에 드롭할 때, 단위(unit)에 따라 수량 결정 방식을 분기한다.

### 단위별 분기

| unit 분류 | unit 값 | 드롭 시 동작 |
|-----------|---------|-------------|
| 계량 단위 | g, ml, ea | 수량 입력 팝업 표시. default_quantity가 기본값 |
| 동작 단위 | spoon, portion, pinch | 1회 드롭 = 1단위. 여러 번 드래그앤드롭으로 누적 |

### 계량 단위 팝업

```
드롭 성공 시:
1. 재료 인스턴스를 quantity=0으로 임시 생성하지 않음
2. 팝업 표시: "{재료명} 수량 입력" 
   - 숫자 input (default_quantity가 기본값)
   - 단위 표시 (g/ml/ea)
   - 확인/취소 버튼
3. 확인 → 입력된 quantity로 재료 인스턴스 생성
4. 취소 → 재료 인스턴스 생성하지 않음 (드롭 무효)
```

### 동작 단위

```
드롭 성공 시:
1. 즉시 quantity=1로 재료 인스턴스 생성
2. 같은 재료를 같은 목적지에 또 드롭하면:
   - 새 인스턴스 생성이 아니라 기존 인스턴스의 quantity +1
   - 또는 새 인스턴스를 생성 (레시피 판별 방식에 따라 결정 필요)
```

### 동작 단위 누적 방식 결정 필요

기존 레시피 판별은 recipe_ingredients와 1:1 비교입니다.
"한주먹 3번 = quantity 3" 으로 처리하려면 두 가지 방식이 있습니다:

- A: 기존 인스턴스 quantity +1 (인스턴스 1개, quantity=3)
- B: 매번 새 인스턴스 (인스턴스 3개, 각 quantity=1)

레시피 판별이 ingredient_id 기준 1:1 매칭이므로 **A 방식(기존 인스턴스 누적)**이 맞습니다.
B 방식이면 recipe_ingredients에 같은 재료가 3줄 있어야 하는데 그건 비현실적입니다.

### 규칙

- store_ingredients.unit을 확인하여 분기
- 팝업은 모달 또는 인라인 UI (기존 OrderSelectModal 패턴 참고)
- 팝업이 열려있는 동안 다른 드래그 불가 처리 필요
- 기존 원칙 유지: 재료 인스턴스는 드롭 성공 후에만 생성. 드래그 시작 시 생성 금지.

### Claude Code 작업 프로세스

```
1. 계획    — 위 규칙 파악
2. 정보 검토 — GamePage.tsx의 handleDragEnd에서 재료 인스턴스 생성 로직,
              store_ingredients 데이터 로딩 위치,
              기존 OrderSelectModal 구현 패턴 확인
3. 요청    — 팝업 UI + 분기 로직 계획을 사용자에게 제시
4. 검토    — 기존 드롭 로직에 영향 없는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — g/ml 재료 드롭 시 팝업, spoon 재료 드롭 시 즉시 생성 검증
```

---

## 패치 4: 웍 볶기 버튼 홀드 수정

### 현재 동작 (버그)

웍에 재료가 있고 burner_level > 0이면, 매초 자동으로 action_history에 
stir가 누적됨. 버튼 조작 없이 자동 누적.

### 올바른 동작

**볶기 버튼을 홀드(누르고 있는 동안)하고 있을 때만** stir가 누적되어야 함.
버튼에서 손을 떼면 누적 중지. 불이 켜져 있어도 볶기 버튼을 누르지 않으면 
stir는 누적되지 않음.

### 변경 개념

현재 물리엔진 tick 조건: `wok_status === 'clean' && burner_level > 0`
변경 후 tick 조건: `wok_status === 'clean' && burner_level > 0 && isStirring === true`

isStirring은 볶기 버튼을 누르고 있는 동안만 true.
onMouseDown/onTouchStart → isStirring = true
onMouseUp/onTouchEnd/onMouseLeave → isStirring = false

### 규칙

- isStirring 상태는 Zustand equipment store 또는 컴포넌트 로컬 state
- 물리엔진 tick이 isStirring을 참조해야 하므로 store가 적절할 수 있음
- 웍 온도 상승은 볶기 버튼과 무관하게 burner_level > 0이면 계속 올라가야 함
  (불은 켜져있지만 볶지 않는 상태 = 온도만 올라감)
- 볶기 버튼 홀드 중에만 stir 누적. 온도 로직은 변경하지 않음

### Claude Code 작업 프로세스

```
1. 계획    — 위 규칙 파악
2. 정보 검토 — WokComponent의 볶기 버튼 현재 구현,
              물리엔진 tick에서 stir 누적 조건,
              equipment store 구조 확인
3. 요청    — isStirring 상태 관리 방식 + tick 조건 변경을 사용자에게 제시
4. 검토    — 온도 로직이 영향받지 않는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — 볶기 홀드 시에만 stir 누적, 떼면 중지, 온도는 독립 동작 검증
```

---

## 구현 순서

```
패치 1: 주방 구역 추가 시스템
  ↓
패치 2-A: 원재료 등록 (개발자 전용)
  ↓
패치 2-B: 매장 재료 등록 (어드민)
  ↓
패치 2-C: 레시피 등록 + AI 분석 (어드민)
  ↓
패치 3: 투입량 결정 프로세스
  ↓
패치 4: 웍 볶기 버튼 홀드 수정
```

패치 2-A → 2-B → 2-C는 데이터 의존 관계상 순서가 고정.
패치 3, 4는 독립적이지만 패치 2 이후에 진행하는 게 테스트 데이터가 풍부해서 유리.

---

## 기존 원칙 준수 사항

| 원칙 | 이번 작업에서의 준수 방법 |
|------|------------------------|
| 원칙 1 — 물리엔진 클라이언트 전용 | 패치 4에서 isStirring도 Zustand에서 관리 |
| 원칙 2 — 좌표 비율값(0~1) | 패치 1에서 image_width/height는 참조용, 좌표는 비율 |
| 원칙 3 — navigate FK 참조 | 패치 1에서 새 zone의 id는 UUID |
| 원칙 4 — action_history 판별 | 패치 4에서 stir 누적 조건만 변경, 구조는 동일 |
| 원칙 5 — assigned_order_id 묶음 | 변경 없음 |
| 원칙 6 — equipment 컴포넌트 | 패치 4에서 버튼 동작만 변경 |
| 원칙 7 — 슬라이드 렌더링 크기 기준 | 변경 없음 |

---

## 완료 기준

### 패치 1
- [ ] 어드민에서 "주방 구역 추가" 버튼으로 새 zone 생성 가능
- [ ] 이미지 업로드 시 image_width/height 자동 저장
- [ ] 새 zone 생성 후 바로 히트박스 배치 가능

### 패치 2-A
- [ ] 개발자 전용 페이지에서 원재료 추가/수정/삭제 가능
- [ ] 일반 사용자가 접근 불가

### 패치 2-B
- [ ] 어드민에서 매장 재료 등록 (원재료 선택 → 매장 설정)
- [ ] 기존 매장 재료 수정/삭제 가능

### 패치 2-C
- [ ] 자연어 입력 → AI 분석 → 테이블 형태로 결과 표시
- [ ] 매칭 실패 재료 시각적 표시
- [ ] 각 행 수동 편집 가능
- [ ] 저장 시 recipes + recipe_ingredients 일괄 INSERT

### 패치 3
- [ ] g/ml/ea 재료 드롭 시 수량 입력 팝업 표시
- [ ] spoon/portion/pinch 재료 드롭 시 즉시 생성 (quantity=1)
- [ ] 동작 단위 재료 동일 목적지 재투입 시 기존 인스턴스 quantity 누적

### 패치 4
- [ ] 볶기 버튼 홀드 시에만 stir 누적
- [ ] 버튼 떼면 누적 중지
- [ ] 웍 온도는 볶기 버튼과 무관하게 burner_level 기반으로 동작

---

_작성 완료_