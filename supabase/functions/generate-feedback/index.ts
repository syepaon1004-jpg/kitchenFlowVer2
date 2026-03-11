import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ScoreEvent {
  event_type: string;
  points: number;
  timestamp_ms: number;
  metadata: Record<string, unknown>;
}

interface RecipeError {
  recipe_id: string;
  error_type: string;
  details: Record<string, unknown>;
}

interface ActionLogSummary {
  total_actions: number;
  idle_count_5s: number;
  idle_count_10s: number;
  redundant_nav_count: number;
  avg_serve_time_ms: number;
  recipes_completed: string[];
  recipes_failed: string[];
}

interface ServingTime {
  recipe_name: string;
  time_ms: number;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  fast_serve: "빠른 서빙",
  slow_serve: "느린 서빙",
  very_slow_serve: "매우 느린 서빙",
  dispose: "재료 폐기",
  wok_burned: "웍 태움",
  short_idle: "5초 이상 공백",
  long_idle: "10초 이상 공백",
  redundant_nav: "불필요한 반복 이동",
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  missing_ingredient: "재료 누락",
  unexpected_ingredient: "불필요한 재료",
  quantity_error: "수량 오류",
  action_insufficient: "조리 부족",
  action_excessive: "과도한 조리",
  plate_order_mismatch: "담는 순서 오류",
  wrong_container: "잘못된 용기",
};

function formatMs(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}분 ${sec}초` : `${sec}초`;
}

function buildUserPrompt(
  score: number,
  scoreEvents: ScoreEvent[],
  recipeErrors: RecipeError[],
  summary: ActionLogSummary,
  servingTimes: ServingTime[],
): string {
  // 점수 이벤트를 유형별로 집계
  const eventCounts = new Map<string, { count: number; points: number }>();
  for (const e of scoreEvents) {
    const existing = eventCounts.get(e.event_type);
    if (existing) {
      existing.count++;
      existing.points += e.points;
    } else {
      eventCounts.set(e.event_type, { count: 1, points: e.points });
    }
  }

  const eventLines = Array.from(eventCounts.entries())
    .map(([type, { count, points }]) => {
      const label = EVENT_TYPE_LABELS[type] ?? type;
      const sign = points > 0 ? "+" : "";
      return `- ${label} (${sign}${points}점): ${count}회`;
    })
    .join("\n");

  // 레시피 오류 정리 — [레시피명] 오류유형: 재료명 형식
  const errorLines = recipeErrors.length > 0
    ? recipeErrors
        .map((e) => {
          const errorLabel = ERROR_TYPE_LABELS[e.error_type] ?? e.error_type;
          const recipeName = (e.details?.recipe_name as string) ?? "";
          const ingName = (e.details?.ingredient_name as string) ?? "";
          const prefix = recipeName ? `[${recipeName}] ` : "";
          const suffix = ingName ? `: ${ingName}` : "";
          return `- ${prefix}${errorLabel}${suffix}`;
        })
        .join("\n")
    : "- 없음";

  // 서빙 시간
  const serveLines = servingTimes.length > 0
    ? servingTimes
        .map((s) => `- ${s.recipe_name}: ${formatMs(s.time_ms)}`)
        .join("\n")
    : "- 기록 없음";

  return `## 게임 결과
총점: ${score}점

## 점수 이벤트
${eventLines || "- 없음"}

## 레시피 오류
${errorLines}

## 서빙 시간
${serveLines}

## 효율성
- 5초 이상 공백: ${summary.idle_count_5s}회
- 10초 이상 공백: ${summary.idle_count_10s}회
- 불필요한 반복 이동: ${summary.redundant_nav_count}회

위 데이터를 기반으로 종합 피드백을 작성해 주세요.`;
}

const systemPrompt = `당신은 주방 시뮬레이터 훈련 코치입니다.
직원의 게임 플레이 데이터를 분석하여 한국어로 피드백을 제공합니다.
잘한 점과 개선할 점을 구분하여 구체적으로 설명합니다.
격려하는 톤을 유지합니다.

피드백 형식:
## 잘한 점
- (구체적 메뉴명과 함께)

## 개선할 점
- (구체적 오류 내용과 함께)

## 종합 코멘트
(격려와 함께 핵심 개선 포인트 1-2개)`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      session_id,
      score,
      score_events,
      recipe_errors,
      action_log_summary,
      serving_times,
    } = await req.json();

    // 입력 검증
    if (!session_id || score === undefined) {
      return new Response(
        JSON.stringify({ error: "session_id, score 필수" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userPrompt = buildUserPrompt(
      score,
      score_events ?? [],
      recipe_errors ?? [],
      action_log_summary ?? {
        total_actions: 0,
        idle_count_5s: 0,
        idle_count_10s: 0,
        redundant_nav_count: 0,
        avg_serve_time_ms: 0,
        recipes_completed: [],
        recipes_failed: [],
      },
      serving_times ?? [],
    );

    // Anthropic API 호출
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Anthropic API error:", response.status, errorBody);
      return new Response(
        JSON.stringify({
          error: "Anthropic API 호출 실패",
          status: response.status,
          detail: errorBody,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();

    const textContent = data.content?.find(
      (block: { type: string }) => block.type === "text",
    );

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: "AI 응답에 텍스트가 없습니다" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const feedbackText = textContent.text.trim();

    // game_ai_feedbacks INSERT
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: insertError } = await supabaseAdmin
      .from("game_ai_feedbacks")
      .insert({
        session_id,
        feedback_text: feedbackText,
      });

    if (insertError) {
      console.error("game_ai_feedbacks INSERT error:", insertError);
    }

    return new Response(JSON.stringify({ feedback: feedbackText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({
        error: "서버 내부 오류",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
