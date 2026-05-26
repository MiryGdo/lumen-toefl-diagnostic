// supabase/functions/claude-proxy/index.ts
//
// Edge Function de Supabase para proxy seguro a Claude API.
// Mantiene tu ANTHROPIC_API_KEY del lado del servidor, nunca expuesta al navegador.
//
// ¿Para qué sirve esto?
// La app Lumen ya funciona sin esto: usa evaluación local de respaldo (offline)
// cuando detecta que API_PROXY_ENDPOINT está vacío. Pero la evaluación offline
// es por regex y mucho más simple. Con este proxy obtienes evaluación de Writing
// y generación de práctica con Claude Opus 4.7 / Haiku 4.5 reales, que es
// dramáticamente mejor en calidad pedagógica.
//
// ============================================================================
// INSTALACIÓN PASO A PASO
// ============================================================================
//
// 1. Instala Supabase CLI si no la tienes:
//    npm install -g supabase
//    (o ver https://supabase.com/docs/guides/cli)
//
// 2. En la raíz de tu proyecto local (donde está index.html), corre:
//    supabase login
//    supabase link --project-ref zcrwqnuhvierehwufoot
//    (el project-ref es la parte antes de .supabase.co en tu URL)
//
// 3. Crea la carpeta y archivo:
//    mkdir -p supabase/functions/claude-proxy
//    cp claude-proxy-edge-function.ts supabase/functions/claude-proxy/index.ts
//
// 4. Configura tu API key de Anthropic como secreto (NO en el código):
//    supabase secrets set ANTHROPIC_API_KEY=sk-ant-tu-key-aqui
//
//    Obtén tu key en https://console.anthropic.com → API Keys
//
// 5. Despliega:
//    supabase functions deploy claude-proxy --no-verify-jwt
//
//    (--no-verify-jwt permite que el navegador llame sin Authorization header;
//     la seguridad está en que la API key nunca sale del servidor)
//
// 6. La función queda en:
//    https://zcrwqnuhvierehwufoot.supabase.co/functions/v1/claude-proxy
//
// 7. En index.html busca:
//    const API_PROXY_ENDPOINT = "";
//    Y reemplázalo por:
//    const API_PROXY_ENDPOINT = "https://zcrwqnuhvierehwufoot.supabase.co/functions/v1/claude-proxy";
//
// 8. Listo. La app detectará el proxy y usará Claude real en lugar del fallback.
//
// ============================================================================
// COSTOS APROXIMADOS (mayo 2026)
// ============================================================================
// - Writing eval (Opus 4.7): ~$0.04 por evaluación
// - Practice exercise (Haiku 4.5): ~$0.002 por ejercicio
// - 30 alumnos haciendo 1 examen al mes con 5 ejercicios de práctica c/u:
//   30 × ($0.04 + 5 × $0.002) = ~$1.50 USD/mes
//
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL_OPUS = "claude-opus-4-7";
const MODEL_HAIKU = "claude-haiku-4-5-20251001";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: "ANTHROPIC_API_KEY not configured in Supabase secrets",
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  let claudeRequest: any;

  if (path === "evaluate-writing") {
    if (!body.system || !body.user_content) {
      return new Response(JSON.stringify({
        error: "Missing 'system' or 'user_content' in request body",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    claudeRequest = {
      model: MODEL_OPUS,
      max_tokens: 2000,
      temperature: 0.2,
      system: body.system,
      messages: [{ role: "user", content: body.user_content }],
    };
  } else if (path === "generate-practice") {
    if (!body.system || !body.user_content) {
      return new Response(JSON.stringify({
        error: "Missing 'system' or 'user_content' in request body",
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    claudeRequest = {
      model: MODEL_HAIKU,
      max_tokens: 800,
      temperature: 0.5,
      system: body.system,
      messages: [{ role: "user", content: body.user_content }],
    };
  } else {
    return new Response(JSON.stringify({
      error: `Unknown endpoint '${path}'. Valid: /evaluate-writing, /generate-practice`,
    }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const claudeResponse = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(claudeRequest),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      return new Response(JSON.stringify({
        error: `Claude API error ${claudeResponse.status}`,
        detail: errorText.slice(0, 500),
      }), {
        status: claudeResponse.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const data = await claudeResponse.json();
    const rawText = (data.content || [])
      .map((c: any) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();

    const clean = rawText.replace(/```json|```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return new Response(JSON.stringify({
        error: "Claude returned non-JSON response",
        raw: rawText.slice(0, 500),
      }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Proxy request failed",
      detail: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
