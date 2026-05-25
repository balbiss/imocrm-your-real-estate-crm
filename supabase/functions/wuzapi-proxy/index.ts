import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, wuzapi-token'
};
const WUZAPI_URL = "https://wuzap.inoovaweb.cloud";
const WUZAPI_ADMIN_TOKEN = "31b9618c53297a92bf893a9d23e1bdbf";
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { method, path, payload } = await req.json();
    const fetchHeaders = {
      "Content-Type": "application/json"
    };
    if (path && path.startsWith("/admin/")) {
      fetchHeaders["Authorization"] = WUZAPI_ADMIN_TOKEN;
    } else {
      const userToken = req.headers.get("wuzapi-token");
      if (userToken) {
        fetchHeaders["token"] = userToken;
      }
    }
    const response = await fetch(`${WUZAPI_URL}${path}`, {
      method: method || "POST",
      headers: fetchHeaders,
      body: payload ? JSON.stringify(payload) : undefined
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = {
        success: false,
        error: "Invalid response from WUZAPI",
        details: text
      };
    }
    // SEMPRE retorna 200 para que o frontend (supabase-js) não estoure erro de "non-2xx status code"
    // O erro real da WUZAPI vai dentro do JSON `data` e o frontend lê isso.
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  }
});
