# KitchenFlow — 바구니 작동 방식

## 편집 모드

- N×M 그리드 설정 (행/열 수 조절)
- 셀 합치기: 인접 직사각형 영역 선택 후 병합
- 셀 나누기: 병합된 셀을 원래 1×1로 분리
- 그리드 크기 변경 시 기존 병합 초기화

## 미리보기 모드

### 패널별 수평 보정

바구니는 어떤 패널에 설치하든 미리보기 시 패널 2와 수평이 된다. 부모 누적 회전을 계산하여 역회전으로 상쇄하는 함수(getBasketCorrection)로 보정한다.

- 패널 2: 보정 없음
- 패널 1, 3: `translateZ(1px) rotateX(보정각도)`. translateZ(1px)로 패널 표면에서 띄움.

### 셀 세우기

각 셀: `transformOrigin: bottom center` + `rotateX(-90deg)`.

회전 후 행 간 관계:
- row 0 (바구니 상단) = 뷰어에서 가장 먼 행
- maxRow (바구니 하단) = 뷰어에서 가장 가까운 행

### 셀 간격

- 패널 2: 자연 간격. 수동 간격 불필요.
- 패널 1, 3: `translateZ(row × 0.1px)` 수동 추가.

### 펼치기

- maxRow (뷰어 쪽): 위치 고정
- row N: `translateZ((maxRow - N) × cellHeight)` 추가 → Z축 상승
- row가 작을수록 더 많이 올라감

### 펼치기 버튼

- 위치: 바구니 하단 바깥 (top = 바구니 height)
- 방향: 셀과 동일하게 세워짐 (`transformOrigin: bottom center`, `rotateX(-90deg)`)

## 이벤트 처리

서랍과 동일. scene 레벨에서 `getBoundingClientRect()` 좌표 비교로 감지.

## 현재 상태

프로토타입. 셀은 배경색 + 테두리로 표시.