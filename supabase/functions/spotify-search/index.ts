const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After",
};

let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;
let pendingTokenRequest: Promise<string> | null = null;

class UpstreamError extends Error {
  status: number;
  retryAfter: string | null;

  constructor(message: string, status: number, retryAfter: string | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });
}

async function getSpotifyAppToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedAccessToken && Date.now() < cachedTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }
  if (pendingTokenRequest) return pendingTokenRequest;

  pendingTokenRequest = (async () => {
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET function secret.");
    }

    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) {
      throw new UpstreamError(
        `Spotify token request failed: ${data.error_description || data.error || "unknown error"}`,
        response.status,
        response.headers.get("Retry-After"),
      );
    }

    cachedAccessToken = data.access_token;
    cachedTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    return cachedAccessToken;
  })();

  try {
    return await pendingTokenRequest;
  } finally {
    pendingTokenRequest = null;
  }
}

async function callSpotify(path: string): Promise<Response> {
  let token = await getSpotifyAppToken();
  let response = await fetch(`https://api.spotify.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Client Credentials não fornece refresh_token: solicite outro access_token.
  if (response.status === 401) {
    cachedAccessToken = null;
    cachedTokenExpiresAt = 0;
    token = await getSpotifyAppToken(true);
    response = await fetch(`https://api.spotify.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  return response;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    let path: string;

    if (typeof body.albumId === "string" && body.albumId.trim()) {
      const albumId = body.albumId.trim();
      if (!/^[A-Za-z0-9]+$/.test(albumId)) return jsonResponse({ error: "Invalid albumId" }, 400);
      path = `albums/${encodeURIComponent(albumId)}/tracks?limit=50`;
    } else if (typeof body.query === "string" && body.query.trim()) {
      const params = new URLSearchParams({ q: body.query.trim().slice(0, 200), type: "album", limit: "20" });
      path = `search?${params.toString()}`;
    } else {
      return jsonResponse({ error: "Provide a query or albumId" }, 400);
    }

    const response = await callSpotify(path);
    const payload = await response.json();
    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      return jsonResponse(payload, response.status, retryAfter ? { "Retry-After": retryAfter } : {});
    }
    return jsonResponse(payload);
  } catch (error) {
    console.error("spotify-search failed:", error);
    const status = error instanceof UpstreamError ? error.status : 500;
    const retryAfter = error instanceof UpstreamError && error.retryAfter
      ? { "Retry-After": error.retryAfter }
      : {};
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Spotify search failed" },
      status,
      retryAfter,
    );
  }
});
