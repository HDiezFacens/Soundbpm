/* ==========================================================================
   SoundBPM - Motor de Gamificação: Níveis, Patamares, Conquistas e Ranking
   ========================================================================== */

var supabase = window.supabaseClient || window.supabase;
var gameEsc = window.gameEsc;
var gameToast = window.gameToast;

// 1. Patamares, Insígnias, Níveis e Estatísticas do Perfil
const GAME_TIERS = [
    { min: 0,    name: "Ouvinte",   icon: "🎧" },
    { min: 100,  name: "Curioso",   icon: "🎵" },
    { min: 300,  name: "Crítico",   icon: "✍️" },
    { min: 700,  name: "Audiófilo", icon: "📀" },
    { min: 1500, name: "Lenda",    icon: "👑" }
];

const GAME_BADGES = [
    { icon: "📝", name: "Primeira Resenha",  desc: "Publique sua 1ª resenha",         ok: s => s.reviews >= 1 },
    { icon: "🎙️", name: "Crítico Dedicado",  desc: "Publique 10 resenhas",            ok: s => s.reviews >= 10 },
    { icon: "🏆", name: "Crítico Veterano",  desc: "Publique 50 resenhas",            ok: s => s.reviews >= 50 },
    { icon: "📖", name: "Escritor",          desc: "5 resenhas com 100+ caracteres",  ok: s => s.longText >= 5 },
    { icon: "🎼", name: "Faixa a Faixa",     desc: "Avalie um álbum faixa a faixa",   ok: s => s.trackReviews >= 1 },
    { icon: "💛", name: "Colecionador",      desc: "Favorite 5 álbuns",               ok: s => s.favorites >= 5 },
    { icon: "💿", name: "Curador",           desc: "Favorite 20 álbuns",              ok: s => s.favorites >= 20 },
    { icon: "🔥", name: "Em Sequência",      desc: "Avalie em 3 dias seguidos",       ok: s => s.streak >= 3 },
    { icon: "⚡", name: "Maratonista",       desc: "Avalie em 7 dias seguidos",       ok: s => s.streak >= 7 },
    { icon: "🌟", name: "Presença Fiel",     desc: "7 dias de login seguidos",        ok: s => s.loginBest >= 7 },
    { icon: "🏠", name: "Residente",         desc: "30 dias de login seguidos",       ok: s => s.loginBest >= 30 }
];

const TIER_TITLES  = ["Novato do Vinil", "Ouvido Curioso", "Pena Afiada", "Audiófilo de Respeito", "Lenda do Vinil"];
const BADGE_TITLES = ["Estreante", "Voz da Crítica", "Mestre da Crítica", "Poeta das Resenhas", "Ouvido Clínico",
                     "Guardião de Discos", "Curador de Acervo", "Em Chamas", "Imparável", "Presença Fiel", "Morador do Estúdio"];
const GAME_TITLES = [
    ...GAME_TIERS.map((t, i) => ({ name: TIER_TITLES[i], src: `Classificação ${t.name} (${t.min} XP)`, tier: true, ok: s => s.xp >= t.min })),
    ...GAME_BADGES.map((b, i) => ({ name: BADGE_TITLES[i], src: `Conquista: ${b.name}`, ok: b.ok }))
];
function resolveTitle(s, chosen) {
    const ok = GAME_TITLES.filter(t => t.ok(s));
    return (ok.find(t => t.name === chosen) || ok.filter(t => t.tier).pop()).name;
}
function liveStreak(p) {
    if (!p.last_checkin) return 0;
    return (Date.now() - new Date(p.last_checkin).getTime()) / 3600000 >= 44 ? 0 : (p.streak_count || 0);
}
function gameToast(msg) {
    const t = document.createElement("div");
    t.className = "game-toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("hide"), 3500);
    setTimeout(() => t.remove(), 4000);
}
async function fetchProfilesGame() {
    let r = await supabase.from("profiles").select("id, username, avatar_url, title, streak_count, streak_best, last_checkin");
    if (r.error) r = await supabase.from("profiles").select("id, username, avatar_url");
    return r;
}
let localStreak = null;

function gameStats(revs, favCount, login = {}) {
    const text = r => (r.review_text || "");
    const days = [...new Set(revs.map(r => new Date(r.created_at).toDateString()))]
        .map(d => new Date(d).getTime()).sort((a, b) => a - b);
    let streak = days.length ? 1 : 0, run = 1;
    for (let i = 1; i < days.length; i++) {
        run = Math.round((days[i] - days[i - 1]) / 86400000) === 1 ? run + 1 : 1;
        streak = Math.max(streak, run);
    }
    const s = {
        reviews: revs.length,
        withText: revs.filter(r => text(r).replace(/\[Avaliação Faixa a Faixa\][\s\S]*?\n\n/, "").trim().length >= 50).length,
        longText: revs.filter(r => text(r).length >= 100).length,
        trackReviews: revs.filter(r => text(r).startsWith("[Avaliação Faixa a Faixa]")).length,
        favorites: favCount,
        streak,
        loginBest: login.best || 0,
        loginNow: login.now || 0
    };
    s.xp = s.reviews * 10 + s.withText * 5 + s.favorites * 3;
    s.badges = GAME_BADGES.filter(b => b.ok(s)).length;
    const idx = GAME_TIERS.reduce((acc, t, i) => (s.xp >= t.min ? i : acc), 0);
    s.tier = GAME_TIERS[idx];
    s.nextTier = GAME_TIERS[idx + 1] || null;
    return s;
}

let gameCache = null, gameCacheAt = 0;
async function fetchGameData() {
    if (gameCache && Date.now() - gameCacheAt < 60000) return gameCache;
    if (!supabase) return [];
    const [rv, fv, pf] = await Promise.all([
        supabase.from("reviews").select("user_id, review_text, created_at"),
        supabase.from("favorites").select("user_id"),
        fetchProfilesGame()
    ]);
    const map = new Map();
    const entry = id => { if (!map.has(id)) map.set(id, { revs: [], favs: 0 }); return map.get(id); };
    (rv.data || []).forEach(r => entry(r.user_id).revs.push(r));
    (fv.data || []).forEach(f => entry(f.user_id).favs++);
    const profiles = new Map((pf.data || []).map(p => [p.id, p]));
    (pf.data || []).forEach(p => entry(p.id));
    gameCache = [...map.entries()].map(([id, v]) => {
        const p = profiles.get(id) || {};
        if (localStreak && localStreak.id === id && !("streak_count" in p)) Object.assign(p, localStreak);
        if (!("title" in p)) { try { p.title = localStorage.getItem("sb_title_" + id) || null; } catch (e) {} }
        const now = liveStreak(p);
        const st = gameStats(v.revs, v.favs, { best: Math.max(p.streak_best || 0, now), now });
        st.title = resolveTitle(st, p.title);
        return { id, profile: p, stats: st };
    });
    gameCacheAt = Date.now();
    return gameCache;
}

async function equipTitle(name) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from("profiles").update({ title: name }).eq("id", session.user.id);
    if (error) localStorage.setItem("sb_title_" + session.user.id, name);
    gameCache = null;
    renderProfileGamification(session.user.id);
    gameToast(error ? "Título equipado (salvo só neste navegador)" : "Título equipado: " + name);
}

function notifyNewTitles(userId, unlocked) {
    const key = "sb_titles_" + userId;
    const names = unlocked.map(t => t.name);
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    if (seen) {
        const fresh = names.filter(n => !seen.includes(n));
        if (fresh.length) gameToast("🏅 Novo título desbloqueado: " + fresh[fresh.length - 1]);
    }
    localStorage.setItem(key, JSON.stringify(names));
}

async function renderProfileGamification(userId) {
    const box = document.getElementById("profile-gamification");
    if (!box || !userId) return;
    const users = await fetchGameData();
    const found = users.find(u => u.id === userId);
    const s = found ? found.stats : gameStats([], 0);
    const p = found ? found.profile : {};
    if (!found) s.title = resolveTitle(s, null);
    const { data: { session } } = await supabase.auth.getSession();
    const mine = session?.user?.id === userId;

    const base = s.tier.min;
    const pct = s.nextTier ? Math.min(100, Math.round(((s.xp - base) / (s.nextTier.min - base)) * 100)) : 100;
    let hint = s.nextTier ? `Faltam ${s.nextTier.min - s.xp} XP para ${s.nextTier.icon} ${s.nextTier.name}` : "Classificação máxima alcançada!";
    if (mine && p.last_checkin) {
        const rem = 20 - (Date.now() - new Date(p.last_checkin).getTime()) / 3600000;
        if (rem > 0) hint += ` • Próximo dia da sequência em ${Math.floor(rem)}h ${Math.floor((rem % 1) * 60)}min`;
    }

    const line = document.getElementById("profile-title-line");
    if (line) line.innerHTML = `<span class="title-chip">🏅 ${gameEsc(s.title)}</span>` +
        (s.loginNow ? `<span class="streak-chip">🔥 ${s.loginNow} dia${s.loginNow === 1 ? "" : "s"}</span>` : "");

    const unlocked = GAME_TITLES.filter(t => t.ok(s));
    box.innerHTML = `
        <div class="game-tier-card">
            <div class="game-tier-top">
                <span class="game-tier-icon">${s.tier.icon}</span>
                <div>
                    <div class="game-tier-name">${s.tier.name}</div>
                    <div class="game-tier-xp">${s.xp} XP • ${s.reviews} resenha${s.reviews === 1 ? "" : "s"} • ${s.favorites} favorito${s.favorites === 1 ? "" : "s"} • 🔥 ${s.loginNow} dia${s.loginNow === 1 ? "" : "s"} de login (recorde ${s.loginBest})</div>
                </div>
            </div>
            <div class="game-xp-bar"><div class="game-xp-fill" style="width: ${pct}%;"></div></div>
            <div class="game-xp-hint">${hint}</div>
        </div>
        <div class="badge-grid">
            ${GAME_BADGES.map(b => `
                <div class="badge-item ${b.ok(s) ? "" : "locked"}">
                    <span class="badge-icon">${b.icon}</span>
                    <span class="badge-name">${b.name}</span>
                    <span class="badge-desc">${b.desc}</span>
                </div>`).join("")}
        </div>
        <h4 class="game-subtitle">Títulos (${unlocked.length}/${GAME_TITLES.length})</h4>
        <div class="badge-grid">
            ${GAME_TITLES.map(t => {
                const ok = t.ok(s), eq = t.name === s.title;
                return `<div class="badge-item title-item ${ok ? "unlocked" : "locked"} ${eq ? "equipped" : ""} ${ok && mine ? "clickable" : ""}" data-title="${gameEsc(t.name)}">
                    <span class="badge-name">🏅 ${gameEsc(t.name)}</span>
                    <span class="badge-desc">${ok ? (eq ? "Equipado" : (mine ? "Clique para equipar" : "Desbloqueado")) : gameEsc(t.src)}</span>
                </div>`;
            }).join("")}
        </div>`;

    if (mine) {
        box.querySelectorAll(".title-item.clickable").forEach(el => el.addEventListener("click", () => equipTitle(el.dataset.title)));
        notifyNewTitles(userId, unlocked);
    }
}

let rankingSort = "xp";
async function loadRankingPage() {
    const list = document.getElementById("ranking-list");
    if (!list) return;
    list.innerHTML = "<p style='color: var(--text-muted);'>Carregando ranking...</p>";

    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: {} };
    const myId = session?.user?.id;
    const users = (await fetchGameData()).slice()
        .sort((a, b) => b.stats[rankingSort] - a.stats[rankingSort] || b.stats.xp - a.stats.xp)
        .slice(0, 50);

    if (users.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 3rem; background: var(--bg-card); border-radius: 8px;">
            <p style="color: var(--text-muted);">Ninguém pontuou ainda. Avalie um álbum para abrir o ranking!</p></div>`;
        return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const unit = { xp: "XP", reviews: "resenhas", badges: "conquistas", loginNow: "dias" }[rankingSort];
    list.innerHTML = users.map((u, i) => {
        const avatar = u.profile.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&h=60&fit=crop&crop=faces";
        return `
        <div class="rank-row ${u.id === myId ? "me" : ""}" onclick="openUserProfile('${gameEsc(u.id)}')">
            <span class="rank-pos">${medals[i] || i + 1}</span>
            <img src="${gameEsc(avatar)}" alt="Avatar">
            <div class="rank-info">
                <strong>${gameEsc(u.profile.username || "Usuário")}${u.id === myId ? " (você)" : ""}</strong>
                <span>🏅 ${gameEsc(u.stats.title)} • ${u.stats.tier.icon} ${u.stats.tier.name}${u.stats.loginNow ? " • 🔥 " + u.stats.loginNow : ""}</span>
            </div>
            <span class="rank-score">${u.stats[rankingSort]} ${unit}</span>
        </div>`;
    }).join("");
}

document.querySelectorAll(".game-tab").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".game-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        rankingSort = btn.dataset.sort;
        loadRankingPage();
    });
});

const navRankingLink = document.getElementById("nav-ranking-link");
if (navRankingLink) {
    navRankingLink.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("ranking-page");
        loadRankingPage();
    });
}

async function loginCheckIn(uid) {
    let st = null, dbOk = true;
    const r = await supabase.from("profiles").select("streak_count, streak_best, last_checkin").eq("id", uid).maybeSingle();
    if (r.error) { dbOk = false; try { st = JSON.parse(localStorage.getItem("sb_streak_" + uid)); } catch (e) {} } else st = r.data;
    st = st || {};
    const now = Date.now();
    const last = st.last_checkin ? new Date(st.last_checkin).getTime() : 0;
    const hrs = (now - last) / 3600000;
    if (last && hrs < 20) { if (!dbOk) localStreak = { id: uid, ...st }; return; }
    const count = (last && hrs < 44) ? (st.streak_count || 0) + 1 : 1;
    const next = { streak_count: count, streak_best: Math.max(st.streak_best || 0, count), last_checkin: new Date(now).toISOString() };
    if (dbOk) { const u = await supabase.from("profiles").update(next).eq("id", uid); if (u.error) dbOk = false; }
    if (!dbOk) { localStorage.setItem("sb_streak_" + uid, JSON.stringify(next)); localStreak = { id: uid, ...next }; }
    gameToast(count > 1 ? `🔥 Sequência de ${count} dias!` : "🔥 Sequência iniciada! Volte em 20 horas.");
    gameCache = null;
    renderProfileGamification(uid);
}

let checkedInUser = null;
if (supabase) {
    supabase.auth.onAuthStateChange((_event, session) => {
        const uid = session?.user?.id;
        if (!uid) { checkedInUser = null; return; }
        if (checkedInUser !== uid) { checkedInUser = uid; setTimeout(() => loginCheckIn(uid), 0); }
    });
}

async function shareText(text, link) {
    const url = link || location.href.split("#")[0];
    try {
        if (navigator.share) { await navigator.share({ text, url }); return; }
        await navigator.clipboard.writeText(text + " " + url);
        gameToast("Texto copiado para compartilhar!");
    } catch (e) { /* compartilhamento cancelado */ }
}

function calcProfileStats(reviews, favs) {
    const n = reviews.length, num = r => Number(r.rating || 0);
    const avg = n ? reviews.reduce((a, r) => a + num(r), 0) / n : 0;
    const dist = {}, artists = {};
    reviews.forEach(r => {
        const k = num(r).toFixed(1); dist[k] = (dist[k] || 0) + 1;
        if (r.artist_name) artists[r.artist_name] = (artists[r.artist_name] || 0) + 1;
    });
    const favNames = new Set(favs.map(f => f.album_name));
    const best = [...reviews].sort((a, b) => num(b) - num(a) || (favNames.has(b.album_name) - favNames.has(a.album_name)) || new Date(b.created_at) - new Date(a.created_at))[0];
    return { n, avg, dist, best, topArtist: Object.entries(artists).sort((a, b) => b[1] - a[1])[0] };
}

const fmtDateBR = d => d ? new Date(d).toLocaleDateString("pt-BR") : "";

async function renderProfileExtras(ctx) {
    const { userId, myId, mine, name, reviews, favs } = ctx;
    const st = calcProfileStats(reviews, favs);

    const { data: fr } = await supabase.from("friendships").select("id, requester_id, addressee_id, status")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const accepted = (fr || []).filter(f => f.status === "accepted");
    const friendIds = new Set(accepted.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id));
    const rel = (fr || []).find(f => f.requester_id === myId || f.addressee_id === myId);

    const box = document.getElementById("profile-stats");
    if (box) {
        const keys = ["0.5", "1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0"];
        const max = Math.max(1, ...Object.values(st.dist));
        const card = (v, l) => `<div class="stat-card"><span class="stat-value">${v}</span><span class="stat-label">${l}</span></div>`;
        box.innerHTML = st.n === 0
            ? `<p style="color: var(--text-muted);">Nenhuma estatística ainda. Avalie um álbum para começar!</p>`
            : `<div class="badge-grid">
                ${st.best ? `<div class="stat-card stat-fav"><img src="${gameEsc(st.best.cover_url)}" alt="Capa">
                    <div><span class="stat-label">Álbum favorito</span><div class="stat-value" style="font-size:1.1rem;">${gameEsc(st.best.album_name)}</div>
                    <span class="stat-label">${gameEsc(st.best.artist_name)} • nota ${st.best.rating}</span></div></div>` : ""}
                ${card(st.n, "resenhas")}${card(st.avg.toFixed(2), "média das notas")}${card(favs.length, "favoritos")}${card(friendIds.size, "amigos")}
                ${st.topArtist ? card(gameEsc(st.topArtist[0]), `artista mais avaliado (${st.topArtist[1]}x)`) : ""}
               </div>
               <div class="dist-row">${keys.map(k => `<div class="dist-col" title="${k}★: ${st.dist[k] || 0}"><div class="dist-bar" style="height:${((st.dist[k] || 0) / max) * 80}%"></div><span>${k}</span></div>`).join("")}</div>`;
    }

    const feed = [
        ...reviews.map(r => ({ icon: "⭐", date: r.created_at, album: r.album_name, artist: r.artist_name, txt: `avaliou com ${r.rating}★` })),
        ...favs.filter(f => f.created_at).map(f => ({ icon: "💛", date: f.created_at, album: f.album_name, artist: f.artist_name, txt: "favoritou" }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    const act = document.getElementById("profile-activity");
    if (act) {
        act.innerHTML = feed.length ? feed.map((a, i) => `<div class="activity-item"><span style="font-size:1.3rem;">${a.icon}</span>
            <div class="activity-body"><strong>${gameEsc(name)}</strong> ${gameEsc(a.txt)} <em>${gameEsc(a.album)}</em><span class="activity-date">${gameEsc(a.artist)} • ${fmtDateBR(a.date)}</span></div></div>`).join("")
            : `<p style="color: var(--text-muted);">Nenhuma atividade ainda.</p>`;
    }

    const actions = document.getElementById("profile-actions");
    if (!actions) return;
    actions.innerHTML = `<span class="title-chip">👥 ${friendIds.size} amigo${friendIds.size === 1 ? "" : "s"}</span>`;
    const add = (label, cls, fn, disabled) => {
        const b = document.createElement("button");
        b.className = cls; b.textContent = label; b.style.cssText = "font-size:0.8rem; padding:0.4rem 0.9rem;";
        if (disabled) b.disabled = true; else b.addEventListener("click", fn);
        actions.appendChild(b);
    };
    if (!mine && myId) {
        if (!rel) add("+ Adicionar amigo", "btn-notify", async () => { await sendFriendRequest(userId, null); loadUserProfile(userId); });
        else if (rel.status === "accepted") add("✓ Amigos • Desfazer", "btn-secondary-dark", async () => {
            if (!confirm(`Desfazer amizade com ${name}?`)) return;
            await supabase.from("friendships").delete().eq("id", rel.id);
            gameToast("Amizade desfeita.");
            loadUserProfile(userId);
        });
        else if (rel.requester_id === myId) add("Pedido enviado", "btn-secondary-dark", null, true);
        else add("Aceitar pedido", "btn-primary-gold", async () => { await acceptFriendRequest(rel.requester_id, null, rel.id); loadUserProfile(userId); });
    }
    add("🔗 Compartilhar perfil", "btn-secondary-dark", () =>
        shareText(`Perfil de ${name} no SoundBPM: ${st.n} resenhas • média ${st.avg.toFixed(1)}★ • ${friendIds.size} amigos 🎵`, profileLink(userId)));
}

const fxReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

(function initTheme() {
    const root = document.documentElement, btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const sync = () => btn.setAttribute("aria-pressed", root.getAttribute("data-theme") === "light");
    sync();
    let t = null;
    btn.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        root.classList.add("theme-anim");
        if (next === "light") root.setAttribute("data-theme", "light"); else root.removeAttribute("data-theme");
        try { localStorage.setItem("soundbpm_theme", next); } catch (e) {}
        sync();
        clearTimeout(t);
        t = setTimeout(() => root.classList.remove("theme-anim"), 700);
    });
})();

(function initScrollReveal() {
    if (fxReduceMotion || !("IntersectionObserver" in window)) return;
    const RULES = [
        ["main h2, main h3, .section-header-flex, .footer-col", "up"],
        [".poster-card, .news-card, .upcoming-card, .dash-block, .stat-card, .badge-item, .game-tier-card, .acc", "up"],
        [".diary-item, .activity-item, .rank-row", "alt"],
        ["section.section-container img", "zoom"],
        ["[data-reveal]", "attr"]
    ];
    const SKIP = ".hero-carousel-section, .site-header, .web-player, .modal-overlay, .find-bar";
    const io = new IntersectionObserver((entries) => {
        entries.filter(e => e.isIntersecting).forEach((e, i) => {
            const el = e.target, delay = Math.min(i, 8) * 70;
            io.unobserve(el);
            el.style.transitionDelay = delay + "ms";
            el.classList.add("sr-in");
            setTimeout(() => { el.classList.remove("sr", "sr-up", "sr-left", "sr-right", "sr-zoom", "sr-in"); el.style.transitionDelay = ""; }, 1000 + delay);
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    const scan = () => {
        RULES.forEach(([sel, kind]) => document.querySelectorAll(sel).forEach(el => {
            if (el.dataset.sr || el.closest(SKIP)) return;
            if (kind !== "attr" && el.parentElement && el.parentElement.closest("[data-sr]")) return;
            el.dataset.sr = "1";
            let dir = kind;
            if (kind === "attr") dir = el.dataset.reveal || "up";
            if (kind === "alt") dir = ([...el.parentElement.children].indexOf(el) % 2 === 0) ? "left" : "right";
            el.classList.add("sr", "sr-" + dir);
            io.observe(el);
        }));
    };
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    scan();
})();

document.addEventListener("click", (e) => {
    const head = e.target.closest(".acc-head");
    if (head) {
        const item = head.closest(".acc"), willOpen = !item.classList.contains("open");
        const group = item.closest("[data-acc-group]");
        if (group && willOpen) group.querySelectorAll(".acc.open").forEach(o => {
            o.classList.remove("open");
            o.querySelector(".acc-head").setAttribute("aria-expanded", "false");
        });
        item.classList.toggle("open", willOpen);
        head.setAttribute("aria-expanded", String(willOpen));
        return;
    }
    const foot = e.target.closest(".footer-col h4");
    if (foot) foot.parentElement.classList.toggle("open");
});

window.loadRankingPage = loadRankingPage;
window.renderProfileGamification = renderProfileGamification;

// 2. Gerador de Card para Instagram Story (Versão com Disco de Vinil)
window.shareToInstagramStory = async function (albumName, artistName, coverUrl, rating, reviewText) {
    if (typeof html2canvas === "undefined") { gameToast("A biblioteca html2canvas não carregou. Verifique o HTML."); return; }
    const unesc = s => new DOMParser().parseFromString(String(s || ""), "text/html").documentElement.textContent;
    let { comment } = parseReviewText(unesc(reviewText));
    if (comment.length > 230) comment = comment.slice(0, 227).trim() + "…";
    const local = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
    const username = gameEsc(local.username || "Usuário"), avatar = local.avatar || CM_AVATAR;
    const title = albumName.length > 46 ? albumName.slice(0, 43).trim() + "…" : albumName;
    const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const coverImg = await loadImg(coverUrl);

    let bgUrl = "", tint = "223,177,91";
    if (coverImg) {
        try {
            const c = document.createElement("canvas"); c.width = c.height = 24;
            const x = c.getContext("2d"); x.drawImage(coverImg, 0, 0, 24, 24);
            bgUrl = c.toDataURL("image/jpeg", 0.9);
            const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0; const n = d.length / 4;
            for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
            tint = `${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)}`;
        } catch (e) {}
    }
    const star = f => `<span style="position:relative;display:inline-block;color:rgba(255,255,255,0.18);">★<span style="position:absolute;left:0;top:0;width:${f * 100}%;overflow:hidden;color:#ffb020;">★</span></span>`;
    const stars = [0, 1, 2, 3, 4].map(i => star(Math.max(0, Math.min(1, rating - i)))).join("");
    const size = comment ? 640 : 760;

    const card = document.createElement("div");
    card.style.cssText = "position:absolute;left:-9999px;top:0;width:1080px;height:1920px;overflow:hidden;background:#0b0e12;color:#fff;font-family:Inter,'Segoe UI',sans-serif;";
    card.innerHTML = `
        ${bgUrl ? `<div style="position:absolute;inset:0;background:url(${bgUrl}) center/cover;"></div>` : ""}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,14,18,0.55) 0%,rgba(11,14,18,0.8) 55%,rgba(11,14,18,0.97) 100%);"></div>
        <div style="position:absolute;top:-260px;left:-60px;width:1200px;height:1200px;border-radius:50%;background:radial-gradient(circle,rgba(${tint},0.5),rgba(${tint},0) 65%);"></div>
        <div style="position:relative;height:100%;box-sizing:border-box;padding:110px 90px 100px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;">
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                <div style="font-size:34px;font-weight:800;letter-spacing:9px;">SOUND<span style="color:#dfb15b;">BPM</span></div>
                <div style="display:flex;align-items:center;gap:22px;">
                    <img src="${gameEsc(avatar)}" crossorigin="anonymous" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:4px solid #dfb15b;">
                    <div style="text-align:left;"><div style="font-size:40px;font-weight:700;">${username}</div><div style="font-size:26px;color:#aab4c0;">avaliou um álbum</div></div>
                </div>
            </div>
            <div style="position:relative;width:900px;height:${size}px;">
                <div style="position:absolute;left:${size - 120}px;top:${Math.round(size * 0.06)}px;width:${Math.round(size * 0.9)}px;height:${Math.round(size * 0.9)}px;border-radius:50%;background:#0d0f12;border:3px solid rgba(255,255,255,0.1);">
                    <div style="position:absolute;inset:14%;border-radius:50%;border:2px solid rgba(255,255,255,0.08);"></div>
                    <div style="position:absolute;inset:30%;border-radius:50%;border:2px solid rgba(255,255,255,0.08);"></div>
                    <div style="position:absolute;inset:40%;border-radius:50%;background:#dfb15b;"></div>
                </div>
                ${coverImg ? `<img src="${gameEsc(coverUrl)}" crossorigin="anonymous" style="position:absolute;left:0;top:0;width:${size}px;height:${size}px;border-radius:28px;object-fit:cover;box-shadow:0 50px 120px rgba(${tint},0.55),0 20px 60px rgba(0,0,0,0.6);">`
                          : `<div style="position:absolute;left:0;top:0;width:${size}px;height:${size}px;border-radius:28px;background:#1c2228;"></div>`}
            </div>
            <div style="width:100%;">
                <div style="font-size:68px;font-weight:800;line-height:1.1;margin-bottom:14px;">${gameEsc(title)}</div>
                <div style="font-size:40px;color:#c4ccd6;margin-bottom:34px;">${gameEsc(artistName)}</div>
                <div style="font-size:92px;letter-spacing:8px;line-height:1;">${stars}</div>
                <div style="margin-top:26px;display:inline-block;padding:10px 38px;border-radius:50px;background:rgba(223,177,91,0.16);border:2px solid rgba(223,177,91,0.55);color:#dfb15b;font-size:46px;font-weight:800;">${rating} <span style="font-size:30px;opacity:0.7;">/ 5</span></div>
            </div>
            ${comment ? `<div style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.07);border-left:8px solid #dfb15b;border-radius:18px;padding:34px 44px;text-align:left;font-size:38px;line-height:1.45;font-style:italic;color:#eef0f3;">"${gameEsc(comment)}"</div>` : ""}
            <div style="font-size:28px;letter-spacing:3px;color:#8a95a3;">AVALIE E DESCUBRA MÚSICA NO <span style="color:#dfb15b;font-weight:800;">SOUNDBPM</span></div>
        </div>`;
    document.body.appendChild(card);
    gameToast("Gerando imagem para o Instagram...");
    try {
        const canvas = await html2canvas(card, { useCORS: true, allowTaint: false, scale: 1, backgroundColor: "#0b0e12" });
        canvas.toBlob(async (blob) => {
            const file = new File([blob], `soundbpm_${albumName.replace(/\s+/g, "_")}.png`, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try { await navigator.share({ files: [file], title: "Resenha no SoundBPM", text: `A minha avaliação de ${albumName} no SoundBPM!` }); }
                catch (err) { console.log("Compartilhamento cancelado", err); }
            } else {
                const url = URL.createObjectURL(blob), a = document.createElement("a");
                a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                gameToast("Imagem baixada! Agora é só postar nos seus Stories.");
            }
        }, "image/png", 1.0);
    } catch (error) {
        console.error("Erro ao gerar a imagem:", error);
        gameToast("Não foi possível gerar a imagem. A capa pode não permitir compartilhamento (CORS).");
    } finally { card.remove(); }
};

