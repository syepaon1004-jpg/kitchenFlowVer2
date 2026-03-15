import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { store_id, name, role, email, password } = await req.json();

    // 입력 검증
    if (!store_id || !name || !role || !email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "store_id, name, role, email, password 필수" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (role !== "admin" && role !== "staff") {
      return new Response(
        JSON.stringify({ success: false, error: "role은 admin 또는 staff만 가능" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin Client 생성 (service_role 키)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 요청자 권한 검증
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "인증이 필요합니다" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: "유효하지 않은 인증 토큰" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 요청자가 해당 store_id의 admin인지 확인
    const { data: callerRecord, error: callerError } = await supabaseAdmin
      .from("store_users")
      .select("id, role")
      .eq("store_id", store_id)
      .eq("auth_user_id", caller.id)
      .eq("role", "admin")
      .is("deleted_at", null)
      .limit(1)
      .single();

    if (callerError || !callerRecord) {
      return new Response(
        JSON.stringify({ success: false, error: "이 매장의 관리자 권한이 없습니다" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth 계정 생성 시도
    const normalizedEmail = email.trim().toLowerCase();
    let authUserId: string | null = null;

    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (createError && createError.message?.includes("already been registered")) {
      // 이미 가입된 이메일 → 기존 유저 찾기
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = users.find(
        (u: { email?: string }) => u.email?.toLowerCase() === normalizedEmail
      );
      if (existingUser) {
        authUserId = existingUser.id;
      }
    } else if (createError) {
      return new Response(
        JSON.stringify({ success: false, error: `계정 생성 실패: ${createError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (authData?.user) {
      authUserId = authData.user.id;
    }

    // store_users INSERT
    const { data: storeUser, error: insertError } = await supabaseAdmin
      .from("store_users")
      .insert({
        store_id,
        name: name.trim(),
        role,
        invited_email: normalizedEmail,
        auth_user_id: authUserId,
        avatar_key: "default",
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: `직원 등록 실패: ${insertError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, store_user_id: storeUser.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "서버 내부 오류",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
