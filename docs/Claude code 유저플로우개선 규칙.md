# 유저 플로우 개선 v3 — Claude Code 구현 규칙

> 지휘관 계획서의 Step 7~13 구현 규칙.
> 매 Step 시작 전 관련 파일을 **먼저 읽은 후** 수정한다.

---

## 선행 완료

- Step 1~6 구현 완료
- DB: store_users.auth_user_id, recipes.category 추가 완료
- 타입: StoreUser.auth_user_id, Recipe.category 추가 완료
- /join: 매장 리스트 + 참여 + 생성 구현 완료 (참여는 Step 10에서 제거)
- /join/avatar: 권한별 가시성 + auth_user_id 저장 완료
- /game/setup: UX 전면 개선 완료
- /admin: AdminHeader 추가 완료

---

## Step 7: DB 변경

```sql
ALTER TABLE store_users ADD COLUMN invited_email text DEFAULT NULL;
```

사용자가 Supabase에서 직접 실행.

---

## Step 8: 타입 수정

**파일:** `src/types/db.ts`

```
StoreUser에 추가:
  invited_email: string | null
```

검증: tsc --noEmit

---

## Step 9: 이메일 자동 연결 로직

**수정 대상:** JoinPage (먼저 읽고 파악)

### 실행 시점

/join 페이지 로드 시 1회, 매장 리스트 조회 전에 실행.

### 로직

```typescript
// 1. 매칭되는 초대 조회 + 자동 연결
const { data: pendingInvites } = await supabase
  .from('store_users')
  .select('id')
  .ilike('invited_email', user.email)  // 대소문자 무시
  .is('auth_user_id', null);

// 2. 매칭 레코드가 있으면 auth_user_id 업데이트
if (pendingInvites && pendingInvites.length > 0) {
  const ids = pendingInvites.map(r => r.id);
  await supabase
    .from('store_users')
    .update({ auth_user_id: user.id })
    .in('id', ids);
}

// 3. 이후 정상적으로 매장 리스트 조회
```

### 주의

- 이미 auth_user_id가 있는 레코드는 .is('auth_user_id', null)로 걸러짐
- ilike로 대소문자 무시
- 조용히 실행 (성공/실패 토스트 없음)
- 여러 매장에서 초대받을 수 있으므로 여러 레코드 업데이트 가능

---

## Step 10: /join 수정 — 매장코드 참여 제거

**수정 대상:** JoinPage (먼저 읽고 파악)

### 제거

- "기존 매장 참여" 버튼/폼/상태/핸들러 전체 제거
- 매장코드 입력 관련 UI 모두 제거

### 유지

- 내 매장 리스트
- "새 매장 만들기"
- 로그아웃
- 매장 0개 시 안내 문구: "연결된 매장이 없습니다. 관리자에게 문의하거나 새 매장을 만드세요."

---

## Step 11: 직원 관리 컴포넌트 (StaffManager)

**신규:** `src/components/admin/StaffManager.tsx`, `StaffManager.module.css`

### 데이터 조회

```typescript
// 현재 매장의 전체 직원 목록
const { data } = await supabase
  .from('store_users')
  .select('*')
  .eq('store_id', selectedStore.id)
  .order('role', { ascending: true })  // admin 먼저
  .order('name', { ascending: true });
```

### 직원 카드 상태

```typescript
const getStatus = (user: StoreUser) => {
  if (user.auth_user_id) return 'connected';     // ✅ 연결됨
  if (user.invited_email) return 'pending';       // ⏳ 대기 중
  return 'no-email';                              // ⬜ 이메일 없음
};
```

### 직원 추가

```typescript
const handleAdd = async (data: { name: string; role: 'admin' | 'staff'; invited_email?: string }) => {
  await supabase.from('store_users').insert({
    store_id: selectedStore.id,
    name: data.name,
    role: data.role,
    invited_email: data.invited_email?.trim().toLowerCase() || null,
    avatar_key: 'default',
    auth_user_id: null,  // 자동 연결 대기
  });
  // 목록 재조회
};
```

### 직원 편집

```typescript
const handleEdit = async (id: string, updates: Partial<StoreUser>) => {
  // 자기 자신 role 변경 차단
  if (id === currentStoreUser.id && updates.role && updates.role !== currentStoreUser.role) {
    alert('자기 자신의 역할은 변경할 수 없습니다.');
    return;
  }

  // invited_email 변경 시 소문자 변환
  if (updates.invited_email) {
    updates.invited_email = updates.invited_email.trim().toLowerCase();
  }

  await supabase.from('store_users').update(updates).eq('id', id);
  // 목록 재조회
};
```

### 연결 해제

```typescript
// admin이 강제로 연결을 끊을 수 있음
const handleDisconnect = async (id: string) => {
  await supabase.from('store_users')
    .update({ auth_user_id: null })
    .eq('id', id);
};
```

### 직원 삭제

```typescript
const handleDelete = async (user: StoreUser) => {
  // 자기 자신 삭제 불가
  if (user.id === currentStoreUser.id) {
    alert('자기 자신은 삭제할 수 없습니다.');
    return;
  }

  // 확인 모달
  if (!confirm(`"${user.name}" 직원을 삭제하시겠습니까?`)) return;

  // game_sessions FK 체크 — 연결된 세션이 있으면 경고
  const { count } = await supabase
    .from('game_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (count && count > 0) {
    if (!confirm(`이 직원에게 ${count}개의 게임 기록이 있습니다. 정말 삭제하시겠습니까?`)) return;
  }

  await supabase.from('store_users').delete().eq('id', user.id);
};
```

### UI 규칙

- 밝은 테마 (어드민 기존 스타일과 일관)
- 추가/편집: 인라인 폼 또는 모달 (기존 어드민 패턴 확인 후 결정)
- 이메일 입력 시 안내: "이메일을 입력하면 해당 이메일로 로그인한 유저가 자동으로 연결됩니다."

---

## Step 12: AdminPage에 탭 추가

**수정 대상:** `src/pages/AdminPage.tsx`

- 기존 4탭에 "직원 관리" 탭 추가
- activeTab에 새 값 추가
- StaffManager 컴포넌트 import + 조건부 렌더

### "현재 로그인한 admin의 store_user" 전달

StaffManager에서 "자기 자신" 판별이 필요하다.
방법: authStore.selectedUser.id를 StaffManager에 prop으로 전달하거나, StaffManager 내부에서 authStore 직접 참조.

---

## 공통 금지 사항

1. any 타입 금지
2. 파일 읽기 전 수정 금지
3. 게임 로직 수정 금지
4. ProtectedRoute/라우팅 경로 변경 금지
5. 임시방편 패치 금지
6. GameHeader/게임 컴포넌트 재사용 금지

---

## 검증

매 Step 완료 시:
- [ ] tsc --noEmit 오류 없음
- [ ] npm run build 오류 없음
- [ ] 기존 기능 회귀 없음