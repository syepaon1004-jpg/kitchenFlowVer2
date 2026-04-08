# CLAUDE.md - KitchenFlow 패널 시스템 작업 규칙

> Claude Code(VS Code 확장프로그램)가 반드시 따라야 할 규칙.  
> 현재 임무: 종이접기 패널 주방 시스템 구현 (기존 파노라마+히트박스 전면 교체)

---

## 🚨 절대 규칙 (모든 작업 전 반드시 준수)

### 1. 작업 전 프로젝트 파악 필수
- 어떤 작업이든 시작하기 전에 관련 파일과 디렉토리 구조를 먼저 확인한다
- `find`, `ls`, `cat` 등으로 실제 파일 내용을 직접 읽는다
- **절대 파일 경로, 함수명, 변수명을 추측하지 않는다**
- 기존 코드의 패턴(네이밍, import 방식, 상태관리 패턴)을 파악하고 동일하게 따른다

### 2. 모르면 멈춘다
- 확실하지 않은 정보는 "확인이 필요합니다"라고 말한다
- 에러 원인을 추측하지 않는다 — 로그, 에러 메시지, 실제 코드를 근거로 판단한다
- 외부 API, 라이브러리 사양이 불확실하면 공식 문서를 확인하거나 사용자에게 묻는다

### 3. 근본 원인 해결
- 에러 발생 시 증상이 아닌 원인을 찾는다
- 임시 우회(try-catch로 무시, any 타입 강제, eslint-disable 등)는 사용자가 명시적으로 요청한 경우에만 사용한다
- 수정 전 "왜 이 에러가 발생하는지"를 먼저 설명한다

### 4. 지시받은 문서를 반드시 먼저 읽는다
- 지휘관이 "이 문서를 읽어라"라고 지시한 파일은 작업 시작 전 반드시 전문을 읽는다
- 문서를 읽지 않고 작업을 시작하지 않는다
- 문서 내용과 현재 코드가 다른 경우, 현재 코드를 기준으로 하되 차이점을 보고한다

---

## 🛠 기술 스택

- **프레임워크**: React 18 + TypeScript + Vite
- **상태관리**: Zustand
- **드래그앤드롭**: @dnd-kit/core + @dnd-kit/utilities
- **DB**: Supabase (PostgreSQL + RLS + Storage + Edge Functions)
- **배포**: Netlify
- **패키지 매니저**: npm
- **Supabase ref**: nunrougezfkuknxuqsdg

---

## 📁 프로젝트 구조 (작업 전 반드시 실제 구조 확인)

```
src/
├── components/
│   ├── admin/          # 어드민 전용 (게임과 import 공유 금지)
│   ├── equipment/      # 장비 컴포넌트 (WokComponent 등)
│   ├── game/           # 게임 화면 전용 (어드민과 import 공유 금지)
│   ├── layout/         # 레이아웃 (MainViewport, Sidebar 등)
│   └── ui/             # 공용 UI (shared)
├── hooks/
├── lib/
├── stores/             # Zustand 스토어
├── pages/
├── types/
│   ├── db.ts           # DB 스키마 타입
│   └── game.ts         # 런타임 전용 타입
└── styles/
    └── gameVariables.css  # CSS 변수 정의
```

**주의: 이 구조는 문서 작성 시점 기준. 반드시 실제 파일 시스템을 확인할 것.**

---

## ⚠️ 금지 사항

### 코드 품질
- `// @ts-ignore`, `as any`, `eslint-disable` 임의 사용 금지
- 기존 코드 스타일과 다른 패턴 도입 금지
- 사용자가 요청하지 않은 리팩토링 금지
- 확인 없이 패키지 설치/삭제 금지

### CSS 3D 전용
- Three.js 등 3D 라이브러리 사용 금지
- `pointer-events` CSS로 3D 공간 클릭 감지 시도 금지 (getBoundingClientRect 사용)
- 서랍 내부 판의 `rotateX(-90deg)` 애니메이션 금지 (고정값)

### 게임 인터랙션
- 장비 컴포넌트에 @dnd-kit `useDroppable`/`useDraggable`을 미리 설정하지 않는다
- 게임 인터랙션 방식은 2차에서 결정된다 (클릭/터치 선택 방식으로 전환 예정)

---

## 📌 패널 시스템 전용 규칙

### 패널 구조
- 패널 수: 3장 고정. 추가/삭제 코드 작성 금지.
- 화구: 패널 2에만 배치 가능. 다른 패널 배치 허용 코드 금지.
- 패널 접기: CSS `perspective` + `rotateX`만. div 부모-자식 구조, 하단 기준 회전.
- 애니메이션: 0.6초 CSS transition.

### 패널 가시성
- 편집 모드: 패널 보임
- 미리보기/인게임: 패널 DOM 유지 + 시각적 투명 (display:none 사용 금지, opacity/visibility로 처리)
- 폴드 냉장고 내부 패널 2장: 모든 모드에서 보임 (흰색)

### 장비 규칙
- 장비는 패널 위의 2D 면. 독립 3D 오브젝트가 아님.
- 서랍: 3레이어(컨테이너 > 내부 판 + face). 열림은 translateZ만 변화.
- 폴드 냉장고 내부: 2패널, 가운데 기준 rotateX(90deg), 재료는 bottom 기준 rotateX(-90deg) 역회전.
- 바구니: 패널 2 수평 보정 필수. getBasketCorrection 함수 참조.
- UI상 웍 그래픽 없음. 화구 자체가 장비.
- 홀로그램: 편집 모드에서 생성 금지. 미리보기/인게임에서만 자동 생성.

### 외형
- 서랍, 폴드 냉장고: 은색 철판 + 까만색 손잡이
- 폴드 냉장고 내부 패널: 흰색 판
- 홀로그램: 흰색 반투명 사각형

---

## 💬 소통 규칙

- 작업 시작 전 Investigate/Plan의 결과를 먼저 보여주고 진행 여부를 확인받는다
- "~인 것 같습니다" 대신 "~입니다 (근거: ...)" 형태로 말한다
- 모르는 것은 "확인이 필요합니다: [구체적 질문]"으로 명시한다
- 변경 후 반드시 Verify 결과를 보고한다
- 계획 보고는 **단일 복사 가능 블록**으로 제출한다
- CSS 3D 작업 시 transform 순서와 preserve-3d 체인을 계획에 명시한다

---

## 🎯 작업 구조 — 강화된 단일 에이전트

### 워크플로우 (모든 작업에 적용)

모든 작업은 아래 순서를 따른다. 단계를 건너뛰지 마라.

1. **Investigate** — 관련 파일 + docs/LEARNINGS.md + docs/MISTAKES.md 읽기
2. **Plan** — 계획 작성 + 아래 원칙 체크리스트 자가 검증 + 사용자 승인 대기
3. **Execute** — 승인된 계획만 실행. 에러 발생 시 즉시 docs/MISTAKES.md 기록
4. **Verify** — tsc --noEmit + npm run build + 원칙 체크리스트 재검증 + 기록 확인

### 원칙 체크리스트 (Plan과 Verify에서 2회 검증)

계획 작성 후, 그리고 구현 완료 후 아래를 반드시 확인하라.
하나라도 위반 시 실행/완료 보고하지 말고 수정하라.

- [ ] CSS 3D transform 순서: translateZ → rotateX
- [ ] preserve-3d 체인이 모든 조상에서 유지되는가
- [ ] 어드민/게임 컴포넌트 간 import 분리
- [ ] any 타입 사용 없음 (unknown + 타입 가드)
- [ ] Zustand 셀렉터에 인라인 filter/map 없음
- [ ] 물리엔진(Zustand)에서 DB write 없음
- [ ] display:none 사용 없음 (opacity/visibility 사용)
- [ ] CSS 변수 인라인 하드코딩 없음 (gameVariables.css에 정의)
- [ ] 재료 인스턴스 드래그 시작 시 생성하지 않음 (드롭 성공 후에만)
- [ ] 수정한 파일이 영향을 주는 다른 파일 목록 확인 (2차 효과)

### 고위험 작업 표시

아래에 해당하는 작업은 계획에 ⚠️ 표시하고 사용자에게 별도 주의를 요청하라:
- CSS 3D 관련 수정 (transform, perspective, preserve-3d)
- 3개 이상 파일에 걸친 수정
- Zustand 스토어 구조 변경
- DB 스키마 변경
- 기존 인터랙션 로직 수정 (클릭, 선택, 열림/닫힘)

---

## 🧠 자기학습 규칙

> 상세 원칙: `docs/클로드코드_하네스_엔지니어링_가이드.md` 참조

### 세션 시작 시
1. `docs/LAST_SESSION.md`를 읽고 이전 진행상황 파악
2. `docs/LEARNINGS.md`를 읽고 **3~5줄로 요약**한 뒤 작업 시작
3. `docs/MISTAKES.md`를 읽고 동일 실수 반복 금지

### 작업 중
- 에러 발생 시 **즉시** `docs/MISTAKES.md`에 기록 (세션 끝이 아니라 그 즉시)
- 새 발견/패턴은 **즉시** `docs/LEARNINGS.md`에 기록
- 계획과 달라진 결정은 `docs/DECISIONS.md`에 이유와 함께 기록

### 세션 종료 시 (또는 /compact 전)
1. `docs/LAST_SESSION.md` 갱신 (완료된 것, 다음 할 일, 블로킹 이슈)
2. `docs/LEARNINGS.md`에 미기록 항목 추가
3. **아무 발견이 없어도 "특이사항 없음"으로 기록**. 건너뛰기 금지

---

## ♻️ 가비지 컬렉션 규칙

- `docs/LEARNINGS.md` 50줄 초과 시 세션 시작 때 정리 (중복 병합, 항목 이동, 오래된 항목 압축)
- **정리는 밀도를 높일 뿐, 지식을 삭제하지 않는다** (압축/이동/승격만, 완전 삭제 금지)
- `docs/MISTAKES.md`에서 3회 이상 반복 패턴은 CLAUDE.md 승격 후보로 표시
- CLAUDE.md 220줄 초과 시 압축 검토

---

## 📐 META — CLAUDE.md 유지 규칙

- 새 규칙은 **구체적·검증 가능**하게 (나쁜 예: "조심해라" / 좋은 예: "X에서 Y 패턴 금지")
- 1규칙 = 1행동. `docs/MISTAKES.md`에서 3회 이상 반복된 항목만 승격
- 새 규칙 추가 시 기존 규칙과 모순 없는지 확인. 코드 스타일은 린터 영역(이 파일 금지)