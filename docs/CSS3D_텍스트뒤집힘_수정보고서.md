# CSS 3D 텍스트 뒤집힘 수정 보고서

> **작성일**: 2026-04-03
> **대상**: 서랍 내부 판 그리드 텍스트 상하 반전 버그

---

## 1. 문제

서랍 장비를 열었을 때, 내부 판(drawerInner)에 렌더링된 그리드 셀의 재료명 텍스트가 **상하 반전(X축 뒤집힘)**되어 보임.

---

## 2. 원인

서랍 내부 판에 `rotateX(-90deg)` + `transformOrigin: top center`가 적용됨.

- top edge가 회전 축(고정)
- bottom edge가 뷰어 방향(Z+)으로 90도 올라감
- 결과: 내부 판이 수직으로 세워지지만, **뒷면(backface)**이 뷰어를 향함
- CSS `backface-visibility: visible`(기본값)이므로 뒷면이 보이긴 하지만, 콘텐츠가 거울 반사처럼 상하 반전

---

## 3. 해결 방법: 래퍼 div 180도 역회전

### 핵심 제약

CSS transform 속성 내의 모든 함수는 **하나의 transformOrigin을 공유**한다.
"첫 번째 회전은 top center 기준, 두 번째 회전은 요소 중앙 기준"처럼 **회전마다 다른 origin을 지정하는 것이 불가능**하다.

단일 transform에 `rotateX(-90deg) rotateX(180deg)`를 적용하면, 180도 회전도 top center를 축으로 돌기 때문에 위치가 틀어진다.

### 해결: div 중첩으로 origin 분리

```
drawerInner (transform: translateZ + rotateX(-90deg), origin: top center)
  └── 래퍼 div (transform: rotateX(180deg), origin: center center)
       └── 그리드 셀들
```

1. **외부 div (drawerInner)**: `top center` 기준 `rotateX(-90deg)` → 기존 동작 그대로 세워짐
2. **내부 래퍼 div**: `center center` 기준 `rotateX(180deg)` → 위치 변화 없이 앞/뒷면만 뒤집힘

내부 래퍼의 `transformOrigin: center center`는 자기 자신의 중앙이므로, 제자리에서 뒤집기만 수행. 위치값 변화 없음.

---

## 4. 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/components/admin/layout-editor/PreviewEquipment.tsx` | 서랍 내부 판(drawerInner) 내에 `rotateX(180deg)` 래퍼 div 추가 |
| `src/components/game/GameKitchenView.tsx` | 동일 |

### 변경 전

```tsx
<div className={styles.drawerInner} style={{
  transform: `translateZ(${openZ}px) rotateX(-90deg)`,
  transformOrigin: 'top center',
}}>
  {그리드 셀들}
</div>
```

### 변경 후

```tsx
<div className={styles.drawerInner} style={{
  transform: `translateZ(${openZ}px) rotateX(-90deg)`,
  transformOrigin: 'top center',
}}>
  <div style={{
    position: 'absolute', inset: 0,
    transform: 'rotateX(180deg)',
    transformOrigin: 'center center',
  }}>
    {그리드 셀들}
  </div>
</div>
```

---

## 5. 원칙 준수 확인

| 원칙 | 준수 여부 |
|------|----------|
| 원칙서 3.5: `rotateX(-90deg)` 고정 | O — rotateX 값 변경 없음 |
| transform 순서: `translateZ → rotateX` | O — 변경 없음 |
| 서랍 열림/닫힘 동작 (translateZ + opacity) | O — 영향 없음 |
| 서랍 face와의 위치 관계 | O — 영향 없음 |

---

## 6. 적용 범위

- **서랍 내부 판**: 적용 완료
- **바구니 셀**: 미적용 (별도 검토 필요)

---

## 7. 일반 원칙 (향후 참조)

CSS 3D에서 `rotateX(-90deg)`로 세운 요소 내부에 텍스트를 표시할 때, 뒷면이 뷰어를 향하는 경우가 발생한다.
이때 **래퍼 div로 `rotateX(180deg)` + `transformOrigin: center center`**를 적용하면, 위치 변화 없이 앞면을 뷰어 방향으로 뒤집을 수 있다.
단일 transform에 여러 rotateX를 넣으면 origin을 공유하여 위치가 틀어지므로, **반드시 div를 분리**해야 한다.
