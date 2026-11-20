const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After, X-SoundBPM-Cache",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = readSupabaseKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const spotifyClientId = Deno.env.get("SPOTIFY_CLIENT_ID");
const spotifyClientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

let accessToken = "";
let accessTokenExpiresAt = 0;
let tokenRequest: Promise<string> | null = null;
let lastCacheCleanupAt = 0;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (!supabaseUrl || !serviceKey || !spotifyClientId || !spotifyClientSecret) {
    console.error("Faltam secrets para a busca do Spotify ou para o cache.");
    return json({ error: "A busca do Spotify não está configurada no servidor." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Envie um JSON válido." }, 400);
  }

  const albumId = typeof body.albumId === "string" ? body.albumId.trim() : "";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if ((!albumId && !query) || query.length > 200 || albumId.length > 100) {
    return json({ error: "Parâmetro inválido." }, 400);
  }

  const isAlbumTracks = Boolean(albumId);
  const normalizedQuery = query.replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  const cacheKey = await sha256(isAlbumTracks ? `album-tracks:${albumId}` : `search:${normalizedQuery}`);
  if (Date.now() - lastCacheCleanupAt > 6 * 60 * 60 * 1000) {
    lastCacheCleanupAt = Date.now();
    await cleanupOldCacheRows();
  }
  const staleEntry = await readCache(cacheKey);
  if (staleEntry && Date.parse(staleEntry.expires_at) > Date.now()) {
    return json(staleEntry.response_json, 200, { "X-SoundBPM-Cache": "HIT" });
  }

  const targetUrl = isAlbumTracks
    ? `https://api.spotify.com/v1/albums/${encodeURIComponent(albumId)}/tracks?limit=50`
    : `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album`;

  try {
    let token = await getSpotifyToken();
    let spotifyRes = await fetch(targetUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (spotifyRes.status === 401) {
      accessToken = "";
      accessTokenExpiresAt = 0;
      token = await getSpotifyToken();
      spotifyRes = await fetch(targetUrl, { headers: { Authorization: `Bearer ${token}` } });
    }

    const responseBody = await spotifyRes.json().catch(() => ({ error: "Resposta inválida do Spotify." }));
    if (!spotifyRes.ok) {
      if (staleEntry && (spotifyRes.status === 429 || spotifyRes.status >= 500)) {
        return json(staleEntry.response_json, 200, { "X-SoundBPM-Cache": "STALE" });
      }
      const retryAfter = spotifyRes.headers.get("Retry-After");
      return json(responseBody, spotifyRes.status, retryAfter ? { "Retry-After": retryAfter } : {});
    }

    const ttlSeconds = getCacheTtlSeconds(isAlbumTracks, query);
    await writeCache(cacheKey, responseBody, new Date(Date.now() + ttlSeconds * 1000).toISOString());
    return json(responseBody, 200, { "X-SoundBPM-Cache": "MISS" });
  } catch (error) {
    console.error("Falha na busca Spotify:", error);
    if (staleEntry) return json(staleEntry.response_json, 200, { "X-SoundBPM-Cache": "STALE" });
    return json({ error: "Não foi possível buscar no Spotify agora." }, 502);
  }
});

async function getSpotifyToken(): Promise<string> {
  if (accessToken && accessTokenExpiresAt > Date.now() + 30_000) return accessToken;
  if (tokenRequest) return await tokenRequest;

  tokenRequest = (async () => {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${spotifyClientId}:${spotifyClientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(`Falha ao obter token Spotify (${response.status}).`);
    }
    accessToken = data.access_token;
    accessTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    return accessToken;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

type CacheEntry = { response_json: unknown; expires_at: string };

async function readCache(cacheKey: string): Promise<CacheEntry | null> {
  try {
    const url = new URL(`${supabaseUrl}/rest/v1/spotify_search_cache`);
    url.searchParams.set("cache_key", `eq.${cacheKey}`);
    url.searchParams.set("select", "response_json,expires_at");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { headers: restHeaders() });
    if (!response.ok) {
      console.error(`Leitura do cache falhou (${response.status}); consultando Spotify.`);
      return null;
    }
    const rows = await response.json();
    return rows[0] || null;
  } catch (error) {
    console.error("Cache do Spotify indisponível; consultando Spotify:", error);
    return null;
  }
}

async function writeCache(cacheKey: string, responseJson: unknown, expiresAt: string) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/spotify_search_cache?on_conflict=cache_key`, {
      method: "POST",
      headers: { ...restHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ cache_key: cacheKey, response_json: responseJson, expires_at: expiresAt }),
    });
    if (!response.ok) console.error(`Gravação do cache falhou (${response.status}).`);
  } catch (error) {
    console.error("Não foi possível gravar o cache do Spotify:", error);
  }
}

async function cleanupOldCacheRows() {
  try {
    const url = new URL(`${supabaseUrl}/rest/v1/spotify_search_cache`);
    // Preserva até sete dias de respostas expiradas para fallback se o Spotify cair.
    url.searchParams.set("expires_at", `lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { ...restHeaders(), Prefer: "return=minimal" },
    });
    if (!response.ok) console.error(`Limpeza do cache falhou (${response.status}).`);
  } catch (error) {
    console.error("Não foi possível limpar entradas antigas do cache:", error);
  }
}

function restHeaders() {
  return {
    apikey: serviceKey!,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

function getCacheTtlSeconds(isAlbumTracks: boolean, query: string) {
  if (isAlbumTracks) return 7 * 24 * 60 * 60;
  if (/\btag:new\b/i.test(query)) return 2 * 60 * 60;
  return 12 * 60 * 60;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readSupabaseKey(mapName: string, legacyName: string) {
  const mapped = Deno.env.get(mapName);
  if (mapped) {
    try {
      const keys = JSON.parse(mapped);
      if (typeof keys.default === "string") return keys.default;
      const first = Object.values(keys).find((value) => typeof value === "string");
      if (typeof first === "string") return first;
    } catch { /* Segue para o nome legado. */ }
  }
  return Deno.env.get(legacyName);
}
