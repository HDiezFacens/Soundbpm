/* ==========================================================================
   SoundBPM - Feed da Comunidade, Diário Global e Vídeos Musicais (Reels)
   ========================================================================== */

var supabase = window.supabaseClient || window.supabase;
var gameEsc = window.gameEsc;
var gameToast = window.gameToast;
var timeAgo = window.timeAgo;
var reviewBodyHtml = window.reviewBodyHtml;
var navigateTo = window.navigateTo;

const CM_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&h=60&fit=crop&crop=faces";
const CM_SQL_HINT = "Curtidas, comentários e vídeos ainda não foram ativados no banco. Rode o arquivo supabase_comunidade_videos.sql no Supabase.";


let cmMe = null;
async function cmGetMe() { const { data: { session } } = await supabase.auth.getSession(); cmMe = session ? session.user : null; return cmMe; }

async function cmLoadMeta(reviews) {
    const ids = reviews.map(r => r.id), uids = [...new Set(reviews.map(r => r.user_id))];
    const [pf, lk, cm] = await Promise.all([
        supabase.from("profiles").select("id, username, avatar_url").in("id", uids),
        supabase.from("review_likes").select("review_id, user_id").in("review_id", ids),
        supabase.from("review_comments").select("review_id").in("review_id", ids)
    ]);
    const likes = new Map(), comments = new Map();
    (lk.data || []).forEach(l => { const o = likes.get(l.review_id) || { n: 0, mine: false }; o.n++; if (cmMe && l.user_id === cmMe.id) o.mine = true; likes.set(l.review_id, o); });
    (cm.data || []).forEach(c => comments.set(c.review_id, (comments.get(c.review_id) || 0) + 1));
    return { profiles: new Map((pf.data || []).map(p => [p.id, p])), likes, comments };
}

function cmCardHtml(r, meta) {
    const p = meta.profiles.get(r.user_id) || {}, lk = meta.likes.get(r.id) || { n: 0, mine: false }, cc = meta.comments.get(r.id) || 0;
    const rt = Math.round(r.rating), stars = "★".repeat(rt) + "☆".repeat(5 - rt), uid = gameEsc(r.user_id);
    return `<article class="cm-review" data-rid="${gameEsc(r.id)}" data-owner="${uid}">
        ${r.cover_url ? `<img class="cm-cover" src="${gameEsc(r.cover_url)}" alt="" loading="lazy">` : ""}
        <div class="cm-main">
            <div class="cm-top">
                <img class="cm-avatar" src="${gameEsc(p.avatar_url || CM_AVATAR)}" alt="" data-uid="${uid}">
                <strong class="cm-user" data-uid="${uid}">${gameEsc(p.username || "Membro")}</strong>
                <span class="cm-when">${timeAgo(r.created_at)}</span>
            </div>
            <div class="cm-line">avaliou <strong>${gameEsc(r.album_name)}</strong> <span class="cm-artist">de ${gameEsc(r.artist_name)}</span></div>
            <div class="cm-stars">${stars} <b>${r.rating}</b></div>
            ${reviewBodyHtml(r.review_text, "")}
            <div class="cm-actions">
                <button type="button" class="cm-btn cm-like ${lk.mine ? "on" : ""}" data-act="like" aria-pressed="${lk.mine}"><span class="cm-heart">♥</span><span class="cm-n">${lk.n}</span></button>
                <button type="button" class="cm-btn" data-act="comments">💬 <span class="cm-cn">${cc}</span></button>
            </div>
            <div class="cm-comments"><div><div class="cm-comments-inner"></div></div></div>
        </div></article>`;
}

async function cmToggleLike(card, btn) {
    const me = await cmGetMe();
    if (!me) { gameToast("Entre na sua conta para curtir."); const m = document.getElementById("login-modal"); if (m) m.classList.add("active"); return; }
    const on = btn.classList.contains("on"), nEl = btn.querySelector(".cm-n"), n0 = parseInt(nEl.textContent, 10) || 0;
    const paint = (v, n) => { btn.classList.toggle("on", v); btn.setAttribute("aria-pressed", String(v)); nEl.textContent = Math.max(0, n); };
    paint(!on, n0 + (on ? -1 : 1));
    const rid = card.dataset.rid;
    const { error } = on ? await supabase.from("review_likes").delete().eq("review_id", rid).eq("user_id", me.id)
                           : await supabase.from("review_likes").insert([{ review_id: rid, user_id: me.id }]);
    if (error) { paint(on, n0); gameToast(CM_SQL_HINT); console.error(error); }
}

async function cmRenderComments(card) {
    const inner = card.querySelector(".cm-comments-inner"), me = await cmGetMe();
    const { data, error } = await supabase.from("review_comments").select("id, user_id, body, created_at").eq("review_id", card.dataset.rid).order("created_at", { ascending: true });
    if (error) { inner.innerHTML = `<p class="cm-empty">${CM_SQL_HINT}</p>`; return; }
    const uids = [...new Set(data.map(c => c.user_id))];
    const { data: pf } = uids.length ? await supabase.from("profiles").select("id, username, avatar_url").in("id", uids) : { data: [] };
    const pm = new Map((pf || []).map(p => [p.id, p]));
    inner.innerHTML = (data.length ? data.map(c => {
        const p = pm.get(c.user_id) || {}, canDel = me && (me.id === c.user_id || me.id === card.dataset.owner);
        return `<div class="cm-comment" data-cid="${gameEsc(c.id)}">
            <img class="cm-avatar sm" src="${gameEsc(p.avatar_url || CM_AVATAR)}" alt="" data-uid="${gameEsc(c.user_id)}">
            <div class="cm-cbody"><strong class="cm-user" data-uid="${gameEsc(c.user_id)}">${gameEsc(p.username || "Membro")}</strong> <span class="cm-when">${timeAgo(c.created_at)}</span><p>${gameEsc(c.body)}</p></div>
            ${canDel ? `<button type="button" class="cm-del" data-act="delcomment" title="Excluir comentário">🗑</button>` : ""}</div>`;
    }).join("") : `<p class="cm-empty">Seja o primeiro a comentar.</p>`)
    + (me ? `<form class="cm-form"><input type="text" class="cm-input" maxlength="500" placeholder="Escreva um comentário..." required><button type="submit" class="btn-primary-gold">Enviar</button></form>`
          : `<button type="button" class="btn-secondary-dark" data-act="login">Entre para comentar</button>`);
    card.querySelector(".cm-cn").textContent = data.length;
}

function cmBind(box) {
    if (box.dataset.bound) return;
    box.dataset.bound = "1";
    box.addEventListener("click", async (e) => {
        const u = e.target.closest("[data-uid]");
        if (u) { window.openUserProfile(u.dataset.uid); return; }
        const act = e.target.closest("[data-act]"), card = e.target.closest(".cm-review");
        if (!act || !card) return;
        if (act.dataset.act === "like") cmToggleLike(card, act);
        if (act.dataset.act === "login") { const m = document.getElementById("login-modal"); if (m) m.classList.add("active"); }
        if (act.dataset.act === "comments") {
            const panel = card.querySelector(".cm-comments"), open = !panel.classList.contains("open");
            panel.classList.toggle("open", open);
            if (open) cmRenderComments(card);
        }
        if (act.dataset.act === "delcomment") {
            const { error } = await supabase.from("review_comments").delete().eq("id", act.closest(".cm-comment").dataset.cid);
            if (error) gameToast("Não foi possível excluir o comentário."); else cmRenderComments(card);
        }
    });
    box.addEventListener("submit", async (e) => {
        if (!e.target.classList.contains("cm-form")) return;
        e.preventDefault();
        const card = e.target.closest(".cm-review"), input = e.target.querySelector("input"), body = input.value.trim(), me = await cmGetMe();
        if (!body || !me) return;
        input.disabled = true;
        const { error } = await supabase.from("review_comments").insert([{ review_id: card.dataset.rid, user_id: me.id, body }]);
        if (error) { input.disabled = false; gameToast(CM_SQL_HINT); console.error(error); return; }
        cmRenderComments(card);
    });
}

async function loadHomeTopReviews() {
    const box = document.getElementById("home-top-reviews");
    if (!box || !supabase) return;
    await cmGetMe();
    const { data: rows, error } = await supabase.from("reviews").select("*").order("rating", { ascending: false }).order("created_at", { ascending: false }).limit(60);
    if (error || !rows || !rows.length) {
        box.innerHTML = `<p class="cm-empty">${error ? "Não foi possível carregar as resenhas agora." : "Ainda não há resenhas publicadas. Seja o primeiro a avaliar um álbum!"}</p>`;
        return;
    }
    const meta = await cmLoadMeta(rows), likesOf = r => (meta.likes.get(r.id) || { n: 0 }).n;
    const withText = rows.filter(r => parseReviewText(r.review_text).comment);
    const top = [...(withText.length >= 3 ? withText : rows)]
        .sort((a, b) => likesOf(b) - likesOf(a) || b.rating - a.rating || new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
    box.innerHTML = top.map(r => cmCardHtml(r, meta)).join("");
    cmBind(box);
}

const diaryState = { offset: 0, done: false, loading: false }, DIARY_PAGE = 12;
async function loadDiaryPage(reset) {
    const list = document.getElementById("diary-list"), more = document.getElementById("diary-more");
    if (!list || !supabase || diaryState.loading) return;
    diaryState.loading = true;
    if (reset) { diaryState.offset = 0; diaryState.done = false; list.innerHTML = `<p class="cm-empty">Carregando resenhas...</p>`; }
    await cmGetMe();
    const { data: rows, error } = await supabase.from("reviews").select("*").order("created_at", { ascending: false }).range(diaryState.offset, diaryState.offset + DIARY_PAGE - 1);
    diaryState.loading = false;
    if (error) { list.innerHTML = `<p class="cm-empty">Não foi possível carregar as resenhas agora.</p>`; more.style.display = "none"; return; }
    if (reset) list.innerHTML = "";
    if (!rows.length && reset) { list.innerHTML = `<p class="cm-empty">Ainda não há resenhas publicadas.</p>`; more.style.display = "none"; return; }
    const meta = await cmLoadMeta(rows);
    list.insertAdjacentHTML("beforeend", rows.map(r => cmCardHtml(r, meta)).join(""));
    cmBind(list);
    diaryState.offset += rows.length;
    diaryState.done = rows.length < DIARY_PAGE;
    more.style.display = diaryState.done ? "none" : "";
}

const vdState = { offset: 0, loading: false }, VD_PAGE = 12, vdItems = new Map();
async function loadVideos(reset) {
    const grid = document.getElementById("video-grid"), more = document.getElementById("video-more");
    if (!grid || vdState.loading) return;
    vdState.loading = true;
    if (reset) { vdState.offset = 0; vdItems.clear(); grid.innerHTML = `<p class="cm-empty">Carregando vídeos...</p>`; }
    await cmGetMe();
    const { data, error } = await supabase.from("videos").select("*").order("created_at", { ascending: false }).range(vdState.offset, vdState.offset + VD_PAGE - 1);
    vdState.loading = false;
    if (error) { grid.innerHTML = `<p class="cm-empty">${CM_SQL_HINT}</p>`; more.style.display = "none"; return; }
    if (reset) grid.innerHTML = "";
    if (!data.length && reset) { grid.innerHTML = `<p class="cm-empty">Nenhum vídeo ainda. Publique o primeiro!</p>`; more.style.display = "none"; return; }
    const uids = [...new Set(data.map(v => v.user_id))];
    const { data: pf } = uids.length ? await supabase.from("profiles").select("id, username, avatar_url").in("id", uids) : { data: [] };
    const pm = new Map((pf || []).map(p => [p.id, p]));
    grid.insertAdjacentHTML("beforeend", data.map(v => {
        v.user = pm.get(v.user_id) || {}; vdItems.set(v.id, v);
        return `<div class="vd-card" data-vid="${gameEsc(v.id)}"><video src="${gameEsc(v.video_url)}#t=0.1" preload="metadata" muted playsinline></video>
            <div class="vd-shade"></div><span class="vd-play">▶</span>
            <div class="vd-meta"><strong>${gameEsc(v.user.username || "Membro")}</strong>${v.caption ? `<span>${gameEsc(v.caption)}</span>` : ""}</div></div>`;
    }).join(""));
    vdState.offset += data.length;
    more.style.display = data.length < VD_PAGE ? "none" : "";
}

function openModalShell(html) {
    const ov = document.createElement("div");
    ov.className = "crop-overlay";
    ov.innerHTML = `<div class="crop-card vd-modal">${html}</div>`;
    const close = () => { document.removeEventListener("keydown", onKey); ov.classList.remove("show"); ov.querySelectorAll("video").forEach(v => v.pause()); setTimeout(() => ov.remove(), 250); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("show"));
    return { ov, close };
}

function openVideoPlayer(v) {
    const mine = cmMe && cmMe.id === v.user_id;
    const { ov, close } = openModalShell(`
        <video class="vd-player" src="${gameEsc(v.video_url)}" controls autoplay playsinline loop></video>
        <div class="vd-info"><strong class="cm-user" data-uid="${gameEsc(v.user_id)}">${gameEsc(v.user.username || "Membro")}</strong> <span class="cm-when">${timeAgo(v.created_at)}</span>
            ${v.tag ? `<div class="vd-tag">🎵 ${gameEsc(v.tag)}</div>` : ""}${v.caption ? `<p>${gameEsc(v.caption)}</p>` : ""}</div>
        <div class="crop-actions">${mine ? `<button type="button" class="btn-secondary-dark vd-del">Excluir</button>` : ""}<button type="button" class="btn-primary-gold vd-close">Fechar</button></div>`);
    ov.querySelector(".vd-close").addEventListener("click", close);
    ov.querySelector(".cm-user").addEventListener("click", () => { close(); window.openUserProfile(v.user_id); });
    const del = ov.querySelector(".vd-del");
    if (del) del.addEventListener("click", async () => {
        if (!confirm("Excluir este vídeo?")) return;
        await supabase.storage.from("videos").remove([v.storage_path]);
        const { error } = await supabase.from("videos").delete().eq("id", v.id);
        if (error) { gameToast("Não foi possível excluir o vídeo."); return; }
        close(); loadVideos(true); gameToast("Vídeo excluído.");
    });
}

async function openVideoUpload() {
    const me = await cmGetMe();
    if (!me) { gameToast("Entre na sua conta para publicar vídeos."); const m = document.getElementById("login-modal"); if (m) m.classList.add("active"); return; }
    const { ov, close } = openModalShell(`
        <strong>Publicar vídeo</strong>
        <p class="crop-hint">MP4, WebM ou MOV • até 60 segundos • até 40 MB</p>
        <input type="file" class="cm-input" accept="video/mp4,video/webm,video/quicktime">
        <video class="vd-preview" controls muted playsinline style="display:none;"></video>
        <input type="text" class="cm-input vd-tag-in" maxlength="80" placeholder="Álbum ou música relacionados (opcional)">
        <textarea class="cm-input vd-cap-in" maxlength="300" rows="3" placeholder="Legenda (opcional)"></textarea>
        <div class="vd-progress" style="display:none;"><span></span></div>
        <div class="crop-actions"><button type="button" class="btn-secondary-dark vd-cancel">Cancelar</button><button type="button" class="btn-primary-gold vd-send" disabled>Publicar</button></div>`);
    const file = ov.querySelector('input[type="file"]'), prev = ov.querySelector(".vd-preview"), send = ov.querySelector(".vd-send"), bar = ov.querySelector(".vd-progress");
    let chosen = null, duration = 0;
    ov.querySelector(".vd-cancel").addEventListener("click", close);
    file.addEventListener("change", () => {
        const f = file.files[0]; chosen = null; send.disabled = true; prev.style.display = "none";
        if (!f) return;
        if (!/^video\/(mp4|webm|quicktime)$/.test(f.type)) { gameToast("Formato não suportado. Use MP4, WebM ou MOV."); file.value = ""; return; }
        if (f.size > 40 * 1024 * 1024) { gameToast("O vídeo passa de 40 MB."); file.value = ""; return; }
        const url = URL.createObjectURL(f); prev.src = url;
        prev.onloadedmetadata = () => {
            duration = prev.duration;
            if (duration > 60.5) { gameToast("O vídeo passa de 60 segundos."); file.value = ""; return; }
            chosen = f; prev.style.display = ""; send.disabled = false;
        };
    });
    send.addEventListener("click", async () => {
        if (!chosen) return;
        send.disabled = true; bar.style.display = ""; send.textContent = "Enviando...";
        const ext = (chosen.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${me.id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from("videos").upload(path, chosen, { contentType: chosen.type, cacheControl: "3600" });
        if (up.error) { bar.style.display = "none"; send.disabled = false; send.textContent = "Publicar"; gameToast(CM_SQL_HINT); console.error(up.error); return; }
        const url = supabase.storage.from("videos").getPublicUrl(path).data.publicUrl;
        const { error } = await supabase.from("videos").insert([{
            user_id: me.id, video_url: url, storage_path: path, duration: Math.round(duration * 10) / 10,
            caption: ov.querySelector(".vd-cap-in").value.trim() || null, tag: ov.querySelector(".vd-tag-in").value.trim() || null
        }]);
        if (error) { await supabase.storage.from("videos").remove([path]); bar.style.display = "none"; send.disabled = false; send.textContent = "Publicar"; gameToast(CM_SQL_HINT); console.error(error); return; }
        close(); gameToast("Vídeo publicado!"); loadVideos(true);
    });
}
window.openVideoPlayer = openVideoPlayer;
window.openVideoUpload = openVideoUpload;

document.querySelectorAll(".diary-tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".diary-tab").forEach(t => t.classList.toggle("active", t === tab));
    const vids = tab.dataset.tab === "videos";
    document.getElementById("diary-reviews-panel").style.display = vids ? "none" : "";
    document.getElementById("diary-videos-panel").style.display = vids ? "" : "none";
    if (vids) loadVideos(true); else loadDiaryPage(true);
}));
const diaryMore = document.getElementById("diary-more"), videoMore = document.getElementById("video-more");
if (diaryMore) diaryMore.addEventListener("click", () => loadDiaryPage(false));
if (videoMore) videoMore.addEventListener("click", () => loadVideos(false));
const publishBtn = document.getElementById("btn-publish-video");
if (publishBtn) publishBtn.addEventListener("click", openVideoUpload);
const videoGrid = document.getElementById("video-grid");
if (videoGrid) videoGrid.addEventListener("click", (e) => { const c = e.target.closest(".vd-card"); if (c && vdItems.has(c.dataset.vid)) openVideoPlayer(vdItems.get(c.dataset.vid)); });
const globalDiaryLink = document.getElementById("view-global-diary-link");
if (globalDiaryLink) globalDiaryLink.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); navigateTo("diary-page"); });


window.loadHomeTopReviews = loadHomeTopReviews;
window.loadDiaryPage = loadDiaryPage;
window.loadVideos = loadVideos;
