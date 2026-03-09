# KitchenFlow — 이미지 히트박스 + 바구니 시스템 구현 계획서

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

## 1. 이번 작업의 목표

### A. 이미지 히트박스 시스템

모든 area_type에 범용으로 적용되는 시스템이다.
히트박스에 이미지를 붙이면, 그 이미지 자체가 히트박스 역할을 한다.
이미지가 없으면 기존과 동일한 투명 히트박스다.

- ingredient, container, navigate, equipment, basket 전부 이미지를 붙일 수 있다
- 이미지와 별도의 투명 히트박스를 겹치는 방식이 아니다
- 이미지 하나가 시각 + interaction을 모두 담당한다

### B. 바구니(basket) 시스템

여러 히트박스가 겹쳐있다가 호버 시 Y축(세로)으로 계단식 펼쳐지는 구조다.

- basket(부모) 히트박스와 자식 히트박스의 부모-자식 관계
- 접힌 상태의 모습은 어드민이 배치한 그대로. 시스템이 자동으로 겹침을 만들지 않는다
- 펼쳐진 자식은 드래그 가능해야 한다
- sort_order로 앞뒤 순서 및 펼침 오프셋을 결정한다
- sort_order는 어드민 패널에서 삭제/재배치 없이 편집 가능해야 한다

### C. Equipment 이미지 적용 시 버튼 외부 배치

equipment 히트박스에 이미지를 붙이면, 장비 컴포넌트의 버튼(볶기, 불조절 등)은 이미지 외부에 렌더링된다. 웍만의 예외가 아니라 모든 equipment 타입에 동일 적용되는 규칙이다.

---

## 2. DB 변경 사항

### 추가할 컬럼 (area_definitions)

| 컬럼 | 타입 | 기본값 | 목적 |
|------|------|--------|------|
| overlay_image_url | text | NULL | 이미지 히트박스용 URL |
| parent_area_id | uuid (자기참조 FK) | NULL | 바구니 자식이면 부모 basket의 id |
| sort_order | integer | 0 | 바구니 내 렌더 순서 및 펼침 오프셋 |

모두 nullable이므로 기존 데이터에 영향 없다.

### area_type에 'basket' 추가

현재 CHECK constraint가 4가지만 허용하므로 basket을 추가해야 한다.

### CHECK constraint 수정 필요

현재: 4가지 FK(ingredient_id, container_id, navigate_zone_id, equipment_type) 중 하나는 not null.
basket은 부모 역할만 하므로 4가지 FK 전부 null일 수 있다.
→ basket일 때는 기존 FK not-null 규칙을 면제해야 한다.

### Claude Code 작업 프로세스

```
1. 계획    — 위 3가지 DB 변경 파악
2. 정보 검토 — pg_constraint에서 현재 CHECK constraint 이름과 정의를 정확히 조회.
              추정으로 DROP하지 말 것.
3. 요청    — 실행할 SQL 전문을 사용자에게 보여주고 승인 요청
4. 검토    — 기존 데이터 영향 없는지, 다른 constraint와 충돌 없는지 확인
5. 실행    — 승인 후 Supabase SQL Editor에서 실행
6. 확인    — 기존 area_definitions 데이터가 정상인지 조회로 검증
```

---

## 3. TypeScript 타입 변경

### 변경 내용

- AreaDefinition 인터페이스에 overlay_image_url, parent_area_id, sort_order 추가
- AreaType에 'basket' 추가

### Claude Code 작업 프로세스

```
1. 계획    — 위 변경 내용 파악
2. 정보 검토 — 현재 타입 정의 파일 위치와 AreaDefinition 인터페이스 확인.
              AreaType이 별도 타입인지 인라인인지 확인.
              이 타입을 import하는 파일 목록 확인.
3. 요청    — 변경할 내용을 사용자에게 제시
4. 검토    — import하는 곳에서 타입 에러 발생하지 않는지 확인
5. 실행    — 타입 수정
6. 확인    — tsc로 타입 에러 없는지 확인
```

---

## 4. 렌더링 변경 — 이미지 히트박스

### 규칙

- overlay_image_url이 있으면 이미지가 곧 히트박스. 별도 투명 rect를 위에 덮지 않는다
- overlay_image_url이 없으면 기존과 동일 (투명 rect 또는 polygon)
- 이미지 히트박스에도 기존 히트박스와 동일한 이벤트(클릭, 드래그)가 작동해야 한다
- 어드민 모드에서는 이미지 위에 area_type 색상 테두리를 추가 표시 (편집 가능하도록)
- 게임 모드에서는 이미지만 보인다
- overlay_image_url이 있으면 points(polygon)는 무시하고 x/y/w/h(bounding box)로만 동작한다. 이미지 파일 자체에 원근감이 반영되어 있으므로 polygon으로 자를 필요가 없다

### Claude Code 작업 프로세스

```
1. 계획    — 위 규칙 파악
2. 정보 검토 — 현재 히트박스 렌더링 컴포넌트의 구조, 이벤트 핸들링 방식,
              SVG viewBox 설정, 어드민/게임 모드 분기 방식을 확인
3. 요청    — 변경 계획을 사용자에게 제시
4. 검토    — 기존 투명 히트박스 동작이 깨지지 않는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — overlay_image_url 있는/없는 히트박스 둘 다 정상 동작 검증
```

---

## 5. 바구니 그룹 렌더링

### 규칙

- parent_area_id가 있는 히트박스는 해당 basket의 자식으로 그룹화
- 접힌 상태: 어드민이 배치한 원래 위치 그대로 렌더. sort_order 오름차순 렌더(낮은 것 먼저 = 뒤에 깔림)
- 펼친 상태(호버 시): 자식들이 Y축 아래로 오프셋 이동. 뒤쪽(sort_order 낮은)일수록 더 많이 이동
- 오프셋 단위는 비율값 (원칙 2 준수: px 금지)
- 바구니 + 펼쳐진 자식 전체 영역에서 마우스가 벗어나지 않으면 펼쳐진 상태 유지
- 바구니와 자식 사이 빈 공간에서 호버가 풀리지 않도록 처리 필요
- 바구니 안에 바구니(중첩)는 허용하지 않는다
- parent_area_id가 가리키는 바구니와 자식은 반드시 같은 zone_id여야 한다

### Claude Code 작업 프로세스

```
1. 계획    — 위 규칙 파악
2. 정보 검토 — 현재 히트박스 레이어 컴포넌트 구조, SVG 그룹(<g>) 사용 여부,
              호버 이벤트 처리 방식, CSS transition 사용 패턴 확인
3. 요청    — 그룹화 및 펼침 구현 방식을 사용자에게 제시
4. 검토    — 기존 히트박스 렌더 순서에 영향 없는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — 호버 시 펼침/접힘 동작, 빈 공간 이탈 시 동작 검증
```

---

## 6. 바구니 펼침 + 드래그 연동

### 규칙

- 펼쳐진 자식 히트박스는 펼쳐진 위치 기준으로 드래그 시작 가능해야 한다
- 드래그 중 마우스가 바구니 영역을 벗어나도 바구니가 접히면 안 된다
  → 드래그 시작 시 해당 바구니의 펼침 상태를 고정(lock), 드래그 종료 시 해제
- collision detection이 펼쳐진 위치 기준으로 동작하는지 확인 필요
  → DOM getBoundingClientRect() 기준이면 자동으로 맞을 수 있고,
     DB 원본 좌표 기준이면 오프셋 반영 수정 필요

### Claude Code 작업 프로세스

```
1. 계획    — 위 규칙 파악
2. 정보 검토 — 현재 @dnd-kit DndContext 설정, onDragStart/onDragEnd 핸들러,
              collision detection 함수가 좌표를 어떻게 가져오는지
              (DOM 기준 vs DB 좌표 기준) 확인
3. 요청    — collision 수정 필요 여부 + 드래그 시 바구니 lock 방식을 사용자에게 제시
4. 검토    — 기존 드래그 로직에 영향 없는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — 펼쳐진 자식 드래그 → 목적지 드롭 정상 동작 검증
```

---

## 7. Equipment 버튼 외부 배치

### 규칙

- equipment 히트박스에 overlay_image_url이 있으면, 장비 컴포넌트의 액션 버튼은 이미지 외부에 렌더링
- overlay_image_url이 없는 equipment는 현재 동작 그대로 유지
- 모든 equipment_type(wok, frying_basket, microwave, sink)에 동일 적용

### Claude Code 작업 프로세스

```
1. 계획    — 위 규칙 파악
2. 정보 검토 — 현재 각 장비 컴포넌트의 구조, 버튼 렌더링 위치,
              히트박스 영역(x/y/w/h)과 버튼의 관계 확인
3. 요청    — 버튼 외부 배치 방식을 사용자에게 제시
4. 검토    — overlay_image_url 없는 장비가 기존과 동일하게 동작하는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — 이미지 있는/없는 equipment 둘 다 정상 동작 검증
```

---

## 8. 어드민 에디터 수정

### 규칙

**overlay_image_url 입력 (모든 area_type 공통)**
- 이미지 없음/있음 토글
- 있음 선택 시: 파일 드래그앤드롭 → Supabase Storage assets 버킷 업로드 → public URL 저장
- 미리보기 썸네일 + 삭제 버튼
- 기존 Supabase Storage 업로드 패턴 재사용

**basket 타입 선택 시**
- 기존 4개 FK(ingredient_id 등) 입력 비활성
- 자식 목록 표시: 이 바구니를 parent_area_id로 참조하는 히트박스들
- 각 자식의 sort_order를 삭제/재배치 없이 편집 가능 (숫자 입력 또는 위/아래 화살표)

**일반 히트박스에 parent_area_id 설정**
- 같은 zone 내 basket 타입 히트박스 목록에서 선택 (또는 '없음')
- parent_area_id 설정 시 sort_order 입력 필드 표시

**area_type select에 basket 추가**

### Claude Code 작업 프로세스

```
1. 계획    — 위 규칙 파악
2. 정보 검토 — 현재 어드민 에디터 패널 구조, 필드 렌더링 방식,
              Supabase Storage 업로드 기존 구현 패턴, area_type select 구현 방식 확인
3. 요청    — UI 변경 내용을 사용자에게 제시
4. 검토    — 기존 편집 기능에 영향 없는지 확인
5. 실행    — 승인된 내용 구현
6. 확인    — 이미지 업로드/삭제, basket 생성, 자식 연결, sort_order 편집 모두 검증
```

---

## 9. 구현 순서

```
Step 1: DB 변경 (Section 2)
Step 2: TypeScript 타입 수정 (Section 3)
Step 3: 이미지 히트박스 렌더링 (Section 4)
Step 4: 바구니 그룹 렌더링 (Section 5)
Step 5: 바구니 펼침 + 드래그 연동 (Section 6)
Step 6: Equipment 버튼 외부 배치 (Section 7)
Step 7: 어드민 에디터 수정 (Section 8)
```

각 Step은 이전 Step이 완료되어야 진행한다.
각 Step마다 6단계 프로세스(계획→정보검토→요청→검토→실행→확인)를 반드시 거친다.

---

## 10. 기존 원칙 준수 사항

| 원칙 | 이번 작업에서의 준수 방법 |
|------|------------------------|
| 원칙 1 — 물리엔진 클라이언트 전용 | 변경 없음. 이미지/바구니는 시각 + 배치 데이터 |
| 원칙 2 — 좌표 비율값(0~1) | overlay_image_url 위치도 기존 x/y/w/h 비율값. 펼침 오프셋도 비율값 |
| 원칙 3 — navigate FK 참조 | 변경 없음 |
| 원칙 4 — action_history 판별 | 변경 없음 |
| 원칙 5 — assigned_order_id 묶음 | 변경 없음 |
| 원칙 6 — equipment 컴포넌트 | 유지. 이미지 추가 시 버튼만 외부로 이동 |
| 원칙 7 — 슬라이드 렌더링 크기 기준 | 변경 없음 |

---

## 11. 완료 기준

- [ ] overlay_image_url이 있는 히트박스가 이미지로 렌더링되고 클릭/드래그 가능
- [ ] overlay_image_url이 없는 히트박스는 기존과 동일하게 동작
- [ ] basket 타입 히트박스 생성 가능
- [ ] 자식 히트박스에 parent_area_id 설정 가능
- [ ] 바구니 호버 시 자식들이 Y축으로 계단식 펼쳐짐
- [ ] 펼쳐진 자식을 드래그하여 목적지에 드롭 가능
- [ ] 드래그 중 바구니 접힘 방지
- [ ] sort_order 어드민 패널에서 편집 가능 (삭제/재배치 없이)
- [ ] equipment에 이미지 적용 시 버튼이 이미지 외부에 위치
- [ ] 모든 equipment 타입에 동일 적용
- [ ] 기존 투명 히트박스, 기존 드래그 로직 전부 정상 동작 유지

---

_작성 완료_