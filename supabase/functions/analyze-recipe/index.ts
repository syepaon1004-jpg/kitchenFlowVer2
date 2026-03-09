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
    const { natural_text, store_ingredients, containers } = await req.json();

    // 입력 검증
    if (!natural_text || !store_ingredients || !containers) {
      return new Response(
        JSON.stringify({ error: "natural_text, store_ingredients, containers 필수" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // system prompt 구성
    const systemPrompt = `당신은 한국어 레시피 텍스트를 분석하는 AI입니다.
사용자가 자연어로 작성한 조리 과정을 분석하여 구조화된 JSON으로 변환하세요.

매칭할 재료 목록:
${JSON.stringify(store_ingredients, null, 2)}

매칭할 용기 목록:
${JSON.stringify(containers, null, 2)}

당신은 한국어 레시피 텍스트를 분석하는 AI입니다.
사용자가 자연어로 작성한 조리 과정을 분석하여 구조화된 JSON으로 변환하세요.

매칭할 재료 목록:
${JSON.stringify(store_ingredients, null, 2)}

매칭할 용기 목록:
${JSON.stringify(containers, null, 2)}

분석 절차 (반드시 이 순서대로 사고하세요):

STEP 1 - 조리 단계를 시간순으로 나열:
각 동작을 순서대로 분해한다.
예: "양파 50g 10초 볶고 계란 2개 추가로 넣고 2초 볶고 그릇에 옮겨서 참기름 뿌린다"
→ (1) 양파 50g 투입 (2) 10초 볶음 (3) 계란 2개 투입 (4) 2초 볶음 (5) 그릇에 옮김 (6) 참기름 뿌림

STEP 2 - 그릇 이동 시점을 파악하여 plate_order 결정:
"그릇에 옮기다/담다/올리다/뿌리다" 같은 표현이 그릇 이동 시점이다.
같은 장비에서 함께 조리된 뒤 한꺼번에 그릇에 옮겨지는 재료들은 모두 같은 plate_order.
그 이후 별도로 그릇에 추가되는 재료는 다음 plate_order.
위 예시: 양파+계란은 함께 볶다가 그릇에 옮김 → plate_order=1, 참기름은 별도 추가 → plate_order=2

STEP 3 - 각 재료의 총 조리 시간(duration_sec) 역산:
재료가 장비에 투입된 시점부터 그릇에 옮길 때까지의 총 시간.
먼저 투입된 재료는 이후 조리 시간도 포함.
위 예시: 양파는 10초+2초=12초, 계란은 2초.
장비를 거치지 않는 재료(뿌리기, 올리기)는 duration_sec=0.

STEP 4 - 재료 매칭:
각 재료명을 store_ingredients의 display_name과 매칭.
일치하면 해당 id를, 없으면 null.

STEP 5 - action_type 결정:
볶다→"stir", 튀기다→"fry", 삶다/끓이다→"boil", 데우다→"microwave",
자르다→"cut", 올리다/놓다/뿌리다/담다→"place", 붓다→"pour", 섞다→"mix"

STEP 6 - confidence 결정:
매칭 확실→"high", 추정→"medium", 불확실→"low"

반드시 아래 JSON 형식만 반환하세요. 사고 과정은 출력하지 마세요. 순수 JSON만 반환하세요.

{
  "ingredients": [
    {
      "matched_ingredient_id": "uuid 또는 null",
      "raw_name": "원문에 적힌 재료명",
      "quantity": 숫자,
      "unit": "g/ml/ea/spoon/portion/pinch",
      "action_type": "stir/fry/boil/microwave/cut/place/pour/mix",
      "duration_sec": 숫자,
      "plate_order": 숫자,
      "confidence": "high/medium/low"
    }
  ],
  "target_container": {
    "matched_container_id": "uuid 또는 null",
    "raw_name": "원문에 적힌 용기명"
  }
}


반드시 아래 JSON 형식만 반환하세요. 마크다운 코드블록이나 설명 텍스트 없이 순수 JSON만 반환하세요.

{
  "ingredients": [
    {
      "matched_ingredient_id": "uuid 또는 null",
      "raw_name": "원문에 적힌 재료명",
      "quantity": 숫자,
      "unit": "g/ml/ea/spoon/portion/pinch",
      "action_type": "stir/fry/boil/microwave/cut/place/pour/mix",
      "duration_sec": 숫자,
      "plate_order": 숫자,
      "confidence": "high/medium/low"
    }
  ],
  "target_container": {
    "matched_container_id": "uuid 또는 null",
    "raw_name": "원문에 적힌 용기명"
  }
}`;

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
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: natural_text,
          },
        ],
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
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Claude 응답에서 텍스트 추출
    const textContent = data.content?.find(
      (block: { type: string }) => block.type === "text"
    );

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: "AI 응답에 텍스트가 없습니다" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // JSON 파싱 (Claude가 ```json 블록으로 감쌀 수 있으므로 제거)
    let resultText = textContent.text.trim();
    resultText = resultText.replace(/^```json\s*/i, "").replace(/\s*```$/, "");

    const parsed = JSON.parse(resultText);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({
        error: "서버 내부 오류",
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});