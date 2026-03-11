# 유저 플로우 개선 v3 추가분 — Claude Code 구현 규칙

> 기존 규칙 파일의 확장. Step 14~18 구현 규칙.
> 매 Step 시작 전 관련 파일을 **먼저 읽은 후** 수정한다.

---

## 선행 완료

- Step 1~13 전부 완료
- DB: store_users에 auth_user_id, invited_email 컬럼 존재
- /join: 매장 리스트 + 새 매장 만들기 (매장코드 참여 제거됨)
- /admin: 직원 관리 탭 존재 (invited_email 기반 CRUD)
- Edge Function 인프라: analyze-recipe 존재 (패턴 참조)

---

## Step 14: Edge Function create-staff

### 신규 파일

```
supabase/functions/create-staff/index.ts
```

### 기존 Edge Function 참조

analyze-recipe의 구조를 먼저 읽고 동일 패턴으로 생성.
(CORS 처리, 에러 핸들링, 환경변수 접근 방식 등)

### 핵심 로직

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. service_role 키로 Admin Client 생성
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// 2. 요청자 권한 검증
//    Authorization 헤더의 access_token으로 요청자 확인
//    해당 store_id의 admin인지 store_users에서 확인

// 3-A. Auth 계정 생성 시도
const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
  email: req.email,
  password: req.password,
  email_confirm: true,  // 이메일 인증 스킵
})

// 3-B. 이미 가입된 이메일이면 기존 유저 조회
if (authError && authError.message?.includes('already been registered')) {
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
  const existingUser = users.find(u => u.email?.toLowerCase() === req.email.toLowerCase())
  if (existingUser) {
    // 기존 유저의 id로 store_users INSERT (바로 연결)
    authUserId = existingUser.id
  }
} else if (authData?.user) {
  authUserId = authData.user.id
}

// 4. store_users INSERT
const { data: storeUser, error: insertError } = await supabaseAdmin
  .from('store_users')
  .insert({
    store_id: req.store_id,
    name: req.name,
    role: req.role,
    invited_email: req.email.trim().toLowerCase(),
    auth_user_id: authUserId,
    avatar_key: 'default',
  })
  .select()
  .single()
```

### 응답 형태

```typescript
// 성공
{ success: true, store_user_id: storeUser.id }

// 실패
{ success: false, error: '에러 메시지' }
```

### 배포

```bash
supabase functions deploy create-staff
```

---

## Step 15: StaffManager 수정

### 수정 파일

```
src/components/admin/StaffManager.tsx
src/components/admin/StaffManager.module.css (필요시)
```

### 변경 사항

1. 직원 추가 폼에 **이메일 필수 + 비밀번호 필드 추가**

2. 기존 직접 INSERT를 Edge Function 호출로 교체:

```typescript
const handleAdd = async (data: { name: string; role: 'admin' | 'staff'; email: string; password: string }) => {
  const session = (await supabase.auth.getSession()).data.session;
  
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        store_id: storeId,
        name: data.name,
        role: data.role,
        email: data.email.trim().toLowerCase(),
        password: data.password,
      }),
    }
  );
  
  const result = await response.json();
  if (!result.success) {
    setError(result.error);
    return;
  }
  
  // 성공 → 목록 재조회
  await loadStaff();
};
```

3. 안내문 변경:
   - 기존: "이메일을 입력하면 해당 이메일로 로그인한 유저가 자동으로 연결됩니다."
   - 변경: "직원에게 이 이메일과 비밀번호를 전달하세요."

4. 기존 편집/삭제/연결해제 로직은 **그대로 유지** (Supabase 직접 호출)

---

## Step 16: LoginPage 회원가입 제거

### 수정 파일

```
src/pages/LoginPage.tsx
src/pages/LoginPage.module.css (필요시)
```

### 제거

- 회원가입 모드 토글 (isSignUp 상태 등)
- signUp 관련 함수/핸들러
- "계정이 없으신가요?" / "로그인으로 전환" UI
- supabase.auth.signUp() 호출

### 유지

- 이메일 + 비밀번호 입력
- supabase.auth.signInWithPassword()
- 에러 처리
- 로그인 성공 → /join 리다이렉트
- 밝은 테마

---

## Step 17: 확인 (변경 없음)

- Step 9의 이메일 자동 연결 로직이 정상 동작하는지 확인
- 제거하지 않음 (안전망)

---

## Step 18: 통합 테스트

tsc --noEmit + npm run build 통과 확인.
기존 기능 회귀 없음 확인.

---

## 공통 금지 사항

1. any 타입 금지
2. 파일 읽기 전 수정 금지
3. 게임 로직 수정 금지
4. service_role 키 클라이언트 노출 금지
5. 임시방편 패치 금지
6. 어두운 테마 사용 금지