import { createClient } from "npm:@supabase/supabase-js@2";

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
  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("Faltam secrets do Supabase para excluir a conta.");
    return json({ error: "A exclusão de conta ainda não está configurada no servidor." }, 503);
  }
  if (!accessToken) return json({ error: "Entre na conta que deseja excluir." }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !user) return json({ error: "Não foi possível validar sua sessão. Entre novamente." }, 401);

  try {
    // Remove os arquivos privados/públicos antes de apagar o usuário Auth.
    await removeUserFolder(admin, "avatars", user.id);
    await removeUserFolder(admin, "videos", user.id);

    // Apaga primeiro registros dependentes e relações sociais.
    await deleteRows(admin, "review_comments", { user_id: user.id });
    await deleteRows(admin, "review_likes", { user_id: user.id });
    await deleteRows(admin, "videos", { user_id: user.id });
    await deleteRowsOr(admin, "friendships", "requester_id", "addressee_id", user.id);
    await deleteRowsOr(admin, "notifications", "user_id", "from_user_id", user.id);
    await deleteRows(admin, "reviews", { user_id: user.id });
    await deleteRows(admin, "favorites", { user_id: user.id });
    await deleteRows(admin, "backlog", { user_id: user.id });
    await deleteRows(admin, "profile_content_approvals", { user_id: user.id });
    await deleteRows(admin, "profiles", { id: user.id });

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) throw deleteUserError;
    return json({ ok: true });
  } catch (error) {
    console.error("Falha ao excluir conta:", error);
    return json({ error: "Não foi possível concluir a exclusão. Tente novamente ou contate o suporte." }, 500);
  }
});

async function deleteRows(
  client: ReturnType<typeof createClient>,
  table: string,
  filter: Record<string, string>,
) {
  let query = client.from(table).delete();
  for (const [column, value] of Object.entries(filter)) query = query.eq(column, value);
  const { error } = await query;
  if (error) throw new Error(`Falha ao limpar ${table}: ${error.message}`);
}

async function deleteRowsOr(
  client: ReturnType<typeof createClient>,
  table: string,
  firstColumn: string,
  secondColumn: string,
  userId: string,
) {
  const { error } = await client.from(table).delete()
    .or(`${firstColumn}.eq.${userId},${secondColumn}.eq.${userId}`);
  if (error) throw new Error(`Falha ao limpar ${table}: ${error.message}`);
}

async function removeUserFolder(client: ReturnType<typeof createClient>, bucket: string, userId: string) {
  const { data: root, error: rootError } = await client.storage.from(bucket).list(userId, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (rootError) {
    if (/not found|does not exist/i.test(rootError.message)) return;
    throw new Error(`Falha ao listar arquivos de ${bucket}: ${rootError.message}`);
  }

  const paths = await collectStoragePaths(client, bucket, userId, root || []);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw new Error(`Falha ao remover arquivos de ${bucket}: ${error.message}`);
  }
}

async function collectStoragePaths(
  client: ReturnType<typeof createClient>,
  bucket: string,
  folder: string,
  entries: Array<{ name: string; id?: string | null }>,
): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of entries) {
    const path = `${folder}/${entry.name}`;
    if (entry.id) {
      paths.push(path);
      continue;
    }
    const { data, error } = await client.storage.from(bucket).list(path, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Falha ao listar arquivos de ${bucket}: ${error.message}`);
    paths.push(...await collectStoragePaths(client, bucket, path, data || []));
  }
  return paths;
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
