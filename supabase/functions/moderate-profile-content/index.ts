const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = readSupabaseKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const serviceKey = readSupabaseKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey || !openAiKey) {
    console.error("Faltam secrets para a moderação de perfil.");
    return json({ error: "A moderação ainda não está configurada no servidor." }, 503);
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Entre na sua conta para continuar." }, 401);

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!authRes.ok) return json({ error: "Sessão inválida. Entre novamente." }, 401);
  const user = await authRes.json();
  const userId = user?.id;
  if (!userId) return json({ error: "Não foi possível validar sua conta." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido." }, 400); }

  const action = body.action;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const rest = `${supabaseUrl}/rest/v1`;

  try {
    if (action === "profile") {
      const username = String(body.username || "").trim();
      const bio = String(body.bio || "").trim();
      if (username.length < 2 || username.length > 24) {
        return json({ error: "O nome precisa ter entre 2 e 24 caracteres." }, 400);
      }
      const moderated = await moderate(openAiKey, [{
        type: "text",
        text: username,
      }]);
      if (moderated.flagged) return json({ error: "Esse nome não é permitido. Escolha um nome respeitoso e tente novamente." }, 422);

      const approval = await fetch(`${rest}/profile_content_approvals`, {
        method: "POST", headers,
        body: JSON.stringify({ user_id: userId, field_name: "username", content_value: username }),
      });
      if (!approval.ok) throw new Error(`Falha ao registrar aprovação (${approval.status}).`);

      const profileRes = await fetch(`${rest}/profiles?on_conflict=id`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: userId, username, bio: bio || "Explorando o mundo da música." }),
      });
      if (!profileRes.ok) throw new Error(`Falha ao salvar o perfil (${profileRes.status}).`);
      return json({ ok: true });
    }

    if (action === "image") {
      const field = body.field;
      if (field !== "avatar_url" && field !== "banner_url") return json({ error: "Tipo de imagem inválido." }, 400);
      const mimeType = String(body.mimeType || "");
      const base64 = String(body.base64 || "").replace(/^data:[^,]+,/, "");
      if (!/^image\/(jpeg|png|webp)$/.test(mimeType) || !base64 || base64.length > 9_000_000) {
        return json({ error: "Imagem inválida ou grande demais. Use JPEG, PNG ou WebP com até 6 MB." }, 400);
      }

      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      if (!hasValidImageSignature(bytes, mimeType)) return json({ error: "O arquivo enviado não parece ser uma imagem válida." }, 400);
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const profileRes = await fetch(`${rest}/profiles?id=eq.${encodeURIComponent(userId)}&select=id`, { headers });
      const existingProfiles = profileRes.ok ? await profileRes.json() : [];
      if (!existingProfiles.length) return json({ error: "Seu perfil ainda está sendo criado. Tente novamente em instantes." }, 409);

      const moderated = await moderate(openAiKey, [{ type: "image_url", image_url: { url: dataUrl } }]);
      if (moderated.flagged) return json({ error: "Essa imagem não é permitida. Escolha uma imagem respeitosa e adequada para público geral." }, 422);

      const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${field === "avatar_url" ? "avatar" : "banner"}-${crypto.randomUUID()}.${ext}`;
      const upload = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": mimeType, "x-upsert": "false" },
        body: bytes,
      });
      if (!upload.ok) throw new Error(`Falha ao salvar imagem (${upload.status}).`);

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${path}`;
      const approval = await fetch(`${rest}/profile_content_approvals`, {
        method: "POST", headers,
        body: JSON.stringify({ user_id: userId, field_name: field, content_value: publicUrl }),
      });
      if (!approval.ok) throw new Error(`Falha ao registrar aprovação (${approval.status}).`);

      const profileRes = await fetch(`${rest}/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH", headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          [field]: publicUrl,
          ...(field === "banner_url" && typeof body.bannerPos === "string" ? { banner_pos: body.bannerPos } : {}),
        }),
      });
      if (!profileRes.ok) throw new Error(`Falha ao atualizar perfil (${profileRes.status}).`);
      if (field === "avatar_url") return json({ ok: true, publicUrl });

      return json({ ok: true, publicUrl });
    }

    return json({ error: "Ação de moderação inválida." }, 400);
  } catch (error) {
    console.error("Falha na moderação de perfil:", error);
    return json({ error: "Não foi possível validar ou salvar agora. Tente novamente em instantes." }, 503);
  }
});

async function moderate(apiKey: string, input: Array<Record<string, unknown>>) {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });
  if (!response.ok) throw new Error(`Serviço de moderação respondeu ${response.status}.`);
  const result = await response.json();
  const moderation = result?.results?.[0];
  if (!moderation) throw new Error("Resposta de moderação inválida.");
  return moderation;
}

function readSupabaseKey(mapName: string, legacyName: string) {
  const mapped = Deno.env.get(mapName);
  if (mapped) {
    try {
      const keys = JSON.parse(mapped);
      if (typeof keys.default === "string") return keys.default;
      const first = Object.values(keys).find((value) => typeof value === "string");
      if (typeof first === "string") return first;
    } catch { /* Continua para a variável compatível com chaves antigas. */ }
  }
  return Deno.env.get(legacyName);
}

function hasValidImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mimeType === "image/webp") return bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  return false;
}
