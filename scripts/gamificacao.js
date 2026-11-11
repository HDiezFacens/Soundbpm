var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Motor de Gamificação: Níveis, Patamares, Conquistas e Ranking
   ========================================================================== */

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
        const avatar = u.profile.avatar_url || "";
        return `
        <div class="rank-row ${u.id === myId ? "me" : ""}" onclick="openUserProfile('${gameEsc(u.id)}')">
            <span class="rank-pos">${medals[i] || i + 1}</span>
            ${avatarHtml(avatar, 48)}
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
    const username = gameEsc(local.username || "Usuário"), avatar = local.avatar || "";
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
                    ${avatar ? '<img src="' + gameEsc(avatar) + '" crossorigin="anonymous" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:4px solid #dfb15b;">' : avatarHtml(null, 88, "border:4px solid #dfb15b;")}
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


// 3. Gerador de Vídeo Animado para TikTok / Reels (Review Faixa a Faixa com Vinil e Áudio)
let tiktokAnimId = null;
let tiktokAudioObj = null;
let tiktokFfmpeg = null;
let tiktokFfmpegLoadPromise = null;

async function loadTikTokFfmpeg(statusText) {
    if (tiktokFfmpeg) return tiktokFfmpeg;
    if (!tiktokFfmpegLoadPromise) {
        tiktokFfmpegLoadPromise = (async () => {
            if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) {
                throw new Error("O conversor MP4 não foi carregado.");
            }

            const ffmpeg = new window.FFmpegWASM.FFmpeg();
            const coreBase = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
            if (statusText) statusText.textContent = "Preparando conversor MP4 (download inicial ~31 MB)...";
            const coreJsResponse = await fetch(`${coreBase}/ffmpeg-core.js`);
            const wasmResponse = await fetch(`${coreBase}/ffmpeg-core.wasm`);
            if (!coreJsResponse.ok || !wasmResponse.ok) {
                throw new Error("Não foi possível baixar o conversor MP4.");
            }

            const coreJsUrl = URL.createObjectURL(await coreJsResponse.blob());
            const wasmUrl = URL.createObjectURL(await wasmResponse.blob());
            try {
                await ffmpeg.load({ coreURL: coreJsUrl, wasmURL: wasmUrl });
            } finally {
                URL.revokeObjectURL(coreJsUrl);
                URL.revokeObjectURL(wasmUrl);
            }
            tiktokFfmpeg = ffmpeg;
            return ffmpeg;
        })().catch(error => {
            tiktokFfmpegLoadPromise = null;
            throw error;
        });
    }
    return tiktokFfmpegLoadPromise;
}

async function convertTikTokWebmToMp4(webmBlob, statusText, progBar) {
    const ffmpeg = await loadTikTokFfmpeg(statusText);
    if (statusText) statusText.textContent = "Convertendo vídeo para MP4 (0%)...";
    if (progBar) progBar.style.width = "0%";
    const input = new Uint8Array(await webmBlob.arrayBuffer());
    await ffmpeg.writeFile("soundbpm-input.webm", input);
    const progressHandler = ({ progress }) => {
        if (statusText && Number.isFinite(progress)) {
            const pct = Math.min(99, Math.max(0, Math.round(progress * 100)));
            statusText.textContent = `Convertendo vídeo para MP4 (${pct}%)...`;
            if (progBar) progBar.style.width = `${pct}%`;
        }
    };
    ffmpeg.on("progress", progressHandler);
    try {
        await ffmpeg.exec([
            "-i", "soundbpm-input.webm",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "fps=30,scale=540:960:flags=fast_bilinear",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", "soundbpm-output.mp4"
        ], 120000);
        const output = await ffmpeg.readFile("soundbpm-output.mp4");
        return new Blob([output], { type: "video/mp4" });
    } finally {
        ffmpeg.off("progress", progressHandler);
        await Promise.all([
            ffmpeg.deleteFile("soundbpm-input.webm").catch(() => {}),
            ffmpeg.deleteFile("soundbpm-output.mp4").catch(() => {})
        ]);
    }
}

// Helper para extrair as faixas da avaliação se houver
function extractTrackRatings(rawReviewText) {
    const unesc = s => new DOMParser().parseFromString(String(s || ""), "text/html").documentElement.textContent;
    const cleanText = unesc(rawReviewText || "");
    const { tracks, comment } = parseReviewText(cleanText);

    const trackList = [];
    if (tracks) {
        const parts = tracks.split(/\s*\|\s*|\n+/).map(p => p.trim()).filter(Boolean);
        for (const part of parts) {
            const colonIdx = part.lastIndexOf(":");
            if (colonIdx !== -1) {
                const name = part.slice(0, colonIdx).trim();
                const numStr = part.slice(colonIdx + 1).replace(/[★☆\s]/g, "");
                const trackRating = parseFloat(numStr) || 5;
                trackList.push({ name, rating: trackRating });
            }
        }
    }
    return { trackList, comment: comment || "" };
}

window.generateTikTokVideo = async function(albumName, artistName, coverUrl, rating, reviewText) {
    const modal = document.getElementById("tiktok-video-modal");
    const canvas = document.getElementById("tiktok-canvas");
    const statusOverlay = document.getElementById("tiktok-status-overlay");
    const statusText = document.getElementById("tiktok-status-text");
    const spinner = document.getElementById("tiktok-spinner");
    const progWrap = document.getElementById("tiktok-progress-bar-wrap");
    const progBar = document.getElementById("tiktok-progress-bar");
    const recordBtn = document.getElementById("btn-start-record-tiktok");
    const cancelBtn = document.getElementById("btn-cancel-tiktok");
    const closeBtn = document.getElementById("close-tiktok-video-modal");

    if (!modal || !canvas) return;

    modal.classList.add("active");
    if (statusOverlay) statusOverlay.style.display = "flex";
    if (progWrap) progWrap.style.display = "none";
    if (progBar) progBar.style.width = "0%";
    if (spinner) spinner.style.display = "block";
    if (statusText) statusText.textContent = "Analisando faixas e preparando animação...";
    if (recordBtn) { recordBtn.disabled = true; recordBtn.textContent = "Preparando..."; }

    // Limpa estado anterior se houver
    if (tiktokAnimId) { cancelAnimationFrame(tiktokAnimId); tiktokAnimId = null; }
    if (tiktokAudioObj) { tiktokAudioObj.pause(); tiktokAudioObj.src = ""; tiktokAudioObj = null; }

    const ctx = canvas.getContext("2d");
    const local = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
    const username = local.username || "Usuário";
    const userAvatarUrl = local.avatar || "";

    // Extrai faixas da resenha (se o usuário avaliou faixa a faixa)
    const { trackList, comment: commentClean } = extractTrackRatings(reviewText);
    const hasTrackByTrack = trackList.length > 0;

    // Calcula tempo total do vídeo:
    // Se tiver faixa a faixa: 2s (intro) + 1.3s por faixa + 3.5s (veredito final)
    // Se for geral: 2.2s (intro) + 3.8s (nota/ondas) + 4.0s (resenha/veredito) = 10s
    const introDuration = 2000;
    const trackDuration = 1300;
    const finalDuration = 3500;
    const totalVideoMs = hasTrackByTrack 
        ? introDuration + (trackList.length * trackDuration) + finalDuration 
        : 10000;

    // Carrega a imagem da capa e avatar
    const loadImg = src => new Promise(res => {
        if (!src) return res(null);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
    });

    const [coverImage, avatarImage] = await Promise.all([
        loadImg(coverUrl),
        userAvatarUrl ? loadImg(userAvatarUrl) : Promise.resolve(null)
    ]);

    // Busca prévia de áudio
    let audioUrl = null;
    try {
        const query = `${albumName} ${artistName}`.trim();
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
        const data = await res.json();
        if (data.results && data.results.length > 0 && data.results[0].previewUrl) {
            audioUrl = data.results[0].previewUrl;
        }
    } catch (e) {
        console.warn("Erro ao buscar áudio do TikTok:", e);
    }

    if (audioUrl) {
        tiktokAudioObj = new Audio();
        tiktokAudioObj.crossOrigin = "anonymous";
        tiktokAudioObj.loop = true;
        tiktokAudioObj.src = audioUrl;
    }

    // Controle de tempo da animação
    let animStartTime = performance.now();
    let angle = 0;
    let canvasCaptureTrack = null;
    let lastCapturedFrameTime = 0;
    const cw = canvas.width;  // 720
    const ch = canvas.height; // 1280

    function drawFrame(now) {
        const elapsed = (now - animStartTime) % totalVideoMs;
        ctx.clearRect(0, 0, cw, ch);

        // 1. Fundo dark premium com gradiente
        ctx.fillStyle = "#080b0f";
        ctx.fillRect(0, 0, cw, ch);

        // 2. Aura radial brilhante de fundo
        const aura = ctx.createRadialGradient(360, 440, 50, 360, 440, 420);
        aura.addColorStop(0, "rgba(223, 177, 91, 0.25)");
        aura.addColorStop(1, "rgba(8, 11, 15, 0)");
        ctx.fillStyle = aura;
        ctx.fillRect(0, 0, cw, ch);

        // 3. Header Fixo: Marca SOUNDBPM + Autor
        ctx.save();
        ctx.textAlign = "left";
        ctx.font = "bold 26px Inter, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("SOUND", 55, 95);
        const w1 = ctx.measureText("SOUND").width;
        ctx.fillStyle = "#dfb15b";
        ctx.fillText("BPM", 55 + w1, 95);

        // Avatar do autor
        const avX = 540, avY = 90, avR = 26;
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX, avY, avR, 0, Math.PI * 2);
        ctx.clip();
        if (avatarImage) {
            ctx.drawImage(avatarImage, avX - avR, avY - avR, avR * 2, avR * 2);
        } else {
            ctx.fillStyle = "#222831";
            ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
            ctx.fillStyle = "#aab4c0";
            ctx.beginPath();
            ctx.arc(avX, avY - 4, 10, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.beginPath();
        ctx.arc(avX, avY, avR, 0, Math.PI * 2);
        ctx.strokeStyle = "#dfb15b";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px Inter, sans-serif";
        const shortUser = username.length > 12 ? username.slice(0, 10) + "…" : username;
        ctx.fillText(shortUser, 580, 88);
        ctx.fillStyle = "#aab4c0";
        ctx.font = "14px Inter, sans-serif";
        ctx.fillText("avaliou no SoundBPM", 580, 108);
        ctx.restore();

        angle += 0.03; // Rotação contínua do vinil

        // ========================================================
        // CENAS DINÂMICAS: FAIXA A FAIXA OU GERAL
        // ========================================================
        if (hasTrackByTrack) {
            const tracksTotalTime = trackList.length * trackDuration;
            const finalStart = introDuration + tracksTotalTime;

            if (elapsed < introDuration) {
                // ----------------------------------------------------
                // CENA 1: INTRODUÇÃO DO ÁLBUM
                // ----------------------------------------------------
                const introProgress = elapsed / introDuration;

                // Badge de Introdução
                ctx.save();
                ctx.textAlign = "center";
                ctx.fillStyle = "rgba(223, 177, 91, 0.15)";
                ctx.beginPath();
                ctx.roundRect(200, 160, 320, 38, 19);
                ctx.fill();
                ctx.strokeStyle = "rgba(223, 177, 91, 0.6)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = "#dfb15b";
                ctx.font = "bold 15px Inter, sans-serif";
                ctx.fillText("FAIXA A FAIXA  |  REVIEW COMPLETO", 360, 184);
                ctx.restore();

                // Vinil deslizando
                const vinylOffset = Math.min(1, introProgress * 1.5) * 120;
                drawVinyl(ctx, 360 + vinylOffset, 420, 160, angle);

                // Capa do Álbum
                drawCover(ctx, 160, 260, 320, coverImage);

                // Título e Artista
                ctx.textAlign = "center";
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 38px Inter, sans-serif";
                ctx.fillText(truncateText(ctx, albumName, 600), 360, 680);
                ctx.fillStyle = "#c4ccd6";
                ctx.font = "600 24px Inter, sans-serif";
                ctx.fillText(truncateText(ctx, artistName, 600), 360, 725);

                // Chamada animada
                ctx.fillStyle = "#dfb15b";
                ctx.font = "italic 22px Inter, sans-serif";
                ctx.fillText(`Avaliando todas as ${trackList.length} faixas...`, 360, 810);

                // Ondas sonoras na intro
                drawWaveform(ctx, elapsed, 360, 890);

            } else if (elapsed < finalStart) {
                // ----------------------------------------------------
                // CENA 2: APRESENTAÇÃO FAIXA A FAIXA
                // ----------------------------------------------------
                const trackTime = elapsed - introDuration;
                const trackIdx = Math.min(trackList.length - 1, Math.floor(trackTime / trackDuration));
                const currentTrack = trackList[trackIdx];
                const trackSubTime = (trackTime % trackDuration) / trackDuration; // 0.0 a 1.0

                // Topo da cena: Miniatura da Capa e Vinil Girando
                drawVinyl(ctx, 430, 230, 75, angle);
                drawCover(ctx, 220, 160, 140, coverImage, 12);

                // Nome do Álbum e Artista discretos acima da faixa
                ctx.textAlign = "center";
                ctx.fillStyle = "#c4ccd6";
                ctx.font = "500 19px Inter, sans-serif";
                ctx.fillText(`${albumName} • ${artistName}`, 360, 345);

                // Card Central da Faixa Atual
                const cardX = 60, cardY = 385, cardW = 600, cardH = 340;
                ctx.save();
                ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
                ctx.shadowColor = "rgba(0,0,0,0.6)";
                ctx.shadowBlur = 30;
                ctx.beginPath();
                ctx.roundRect(cardX, cardY, cardW, cardH, 24);
                ctx.fill();
                ctx.strokeStyle = "rgba(223, 177, 91, 0.4)";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();

                // Indicador: FAIXA X DE Y
                ctx.textAlign = "center";
                ctx.fillStyle = "rgba(223, 177, 91, 0.2)";
                ctx.beginPath();
                ctx.roundRect(240, cardY + 28, 240, 36, 18);
                ctx.fill();
                ctx.fillStyle = "#dfb15b";
                ctx.font = "bold 15px Inter, sans-serif";
                ctx.fillText(`FAIXA ${trackIdx + 1} DE ${trackList.length}`, 360, cardY + 52);

                // Nome da Faixa Grande e em Destaque
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 36px Inter, sans-serif";
                const trackTitle = truncateText(ctx, currentTrack.name, 540);
                ctx.fillText(trackTitle, 360, cardY + 125);

                // Estrelas da Faixa
                const trackStars = formatStars(currentTrack.rating);
                ctx.fillStyle = "#ffb020";
                ctx.font = "46px sans-serif";
                ctx.fillText(trackStars, 360, cardY + 195);

                // Badge Gigante com a Nota da Faixa
                const scoreStr = `${currentTrack.rating.toFixed(1)} ★`;
                ctx.save();
                ctx.fillStyle = "#dfb15b";
                ctx.font = "bold 34px Inter, sans-serif";
                ctx.fillText(scoreStr, 360, cardY + 265);
                ctx.restore();

                // Ondas sonoras animadas
                drawWaveform(ctx, elapsed, 360, 785);

                // Barra de Progresso do Álbum no Rodapé
                const progressW = 540;
                const progressX = (cw - progressW) / 2;
                const progressY = 870;
                ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
                ctx.beginPath();
                ctx.roundRect(progressX, progressY, progressW, 8, 4);
                ctx.fill();

                const filledW = ((trackIdx + trackSubTime) / trackList.length) * progressW;
                ctx.fillStyle = "#dfb15b";
                ctx.beginPath();
                ctx.roundRect(progressX, progressY, Math.max(8, filledW), 8, 4);
                ctx.fill();

            } else {
                // ----------------------------------------------------
                // CENA 3: O VEREDITO FINAL (MÉDIA GERAL + RESENHA)
                // ----------------------------------------------------
                renderFinalVerdict(ctx, albumName, artistName, coverImage, rating, commentClean, angle, elapsed);
            }

        } else {
            // --------------------------------------------------------
            // AVALIAÇÃO GERAL TRADICIONAL (SEM FAIXA A FAIXA)
            // --------------------------------------------------------
            if (elapsed < 2500) {
                // Cena 1: Vinil saindo e apresentação
                const prog = elapsed / 2500;
                const vOff = Math.min(1, prog * 1.4) * 130;
                drawVinyl(ctx, 360 + vOff, 410, 160, angle);
                drawCover(ctx, 160, 250, 320, coverImage);

                ctx.textAlign = "center";
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 38px Inter, sans-serif";
                ctx.fillText(truncateText(ctx, albumName, 600), 360, 680);
                ctx.fillStyle = "#c4ccd6";
                ctx.font = "600 24px Inter, sans-serif";
                ctx.fillText(truncateText(ctx, artistName, 600), 360, 725);
                drawWaveform(ctx, elapsed, 360, 800);

            } else {
                // Cena 2 e 3: Veredito e Resenha Completa
                renderFinalVerdict(ctx, albumName, artistName, coverImage, rating, commentClean, angle, elapsed);
            }
        }

        // Rodapé Fixo
        ctx.textAlign = "center";
        ctx.fillStyle = "#8a95a3";
        ctx.font = "600 18px Inter, sans-serif";
        ctx.fillText("AVALIE E DESCUBRA MÚSICA NO SOUNDBPM", 360, 1220);

        // Alguns navegadores não atualizam de forma confiável a captura automática do canvas.
        if (canvasCaptureTrack && canvasCaptureTrack.requestFrame && now - lastCapturedFrameTime >= 1000 / 30) {
            canvasCaptureTrack.requestFrame();
            lastCapturedFrameTime = now;
        }
        tiktokAnimId = requestAnimationFrame(drawFrame);
    }

    // Funções auxiliares de desenho
    function drawVinyl(ctx, x, y, r, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = "#0c0f13";
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 35;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1.5;
        [0.86, 0.72, 0.60, 0.48, 0.36].forEach(pct => {
            ctx.beginPath();
            ctx.arc(0, 0, r * pct, 0, Math.PI * 2);
            ctx.stroke();
        });

        ctx.beginPath();
        ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = "#dfb15b";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
        ctx.fillStyle = "#000000";
        ctx.fill();
        ctx.restore();
    }

    function drawCover(ctx, x, y, size, img, rad = 20) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 35;
        ctx.shadowOffsetY = 15;

        ctx.beginPath();
        ctx.roundRect(x, y, size, size, rad);
        ctx.clip();

        if (img) {
            ctx.drawImage(img, x, y, size, size);
        } else {
            ctx.fillStyle = "#1c2228";
            ctx.fillRect(x, y, size, size);
            ctx.fillStyle = "#dfb15b";
            ctx.font = `bold ${Math.round(size * 0.25)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("🎵", x + size / 2, y + size / 2 + 15);
        }
        ctx.restore();
    }

    function drawWaveform(ctx, timeMs, centerX, centerY) {
        const time = timeMs * 0.006;
        const count = 30;
        const bw = 7, gap = 5;
        const totalW = count * (bw + gap);
        const startX = centerX - totalW / 2;

        for (let i = 0; i < count; i++) {
            const h = Math.abs(Math.sin(time + i * 0.3) * Math.cos(time * 0.6 + i * 0.2)) * 32 + 8;
            const bx = startX + i * (bw + gap);
            const by = centerY - h / 2;

            const g = ctx.createLinearGradient(0, by, 0, by + h);
            g.addColorStop(0, "#dfb15b");
            g.addColorStop(1, "#ff9f1c");

            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, h, 3);
            ctx.fill();
        }
    }

    function renderFinalVerdict(ctx, aName, artName, cImg, finalRate, comTxt, rot, timeMs) {
        ctx.save();

        // Título do Veredito
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(223, 177, 91, 0.2)";
        ctx.beginPath();
        ctx.roundRect(220, 160, 280, 38, 19);
        ctx.fill();
        ctx.strokeStyle = "rgba(223, 177, 91, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#dfb15b";
        ctx.font = "bold 15px Inter, sans-serif";
        ctx.fillText("★ VEREDITO FINAL ★", 360, 184);

        // Capa com Vinil no Veredito
        drawVinyl(ctx, 430, 360, 135, rot);
        drawCover(ctx, 160, 240, 240, cImg, 18);

        // Nome do Álbum e Artista
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 34px Inter, sans-serif";
        ctx.fillText(truncateText(ctx, aName, 580), 360, 545);
        ctx.fillStyle = "#c4ccd6";
        ctx.font = "600 22px Inter, sans-serif";
        ctx.fillText(truncateText(ctx, artName, 580), 360, 585);

        // Média Final Gigante
        ctx.fillStyle = "#ffb020";
        ctx.font = "52px sans-serif";
        ctx.fillText(formatStars(finalRate), 360, 665);

        // Badge Nota Final
        const scoreTxt = `${finalRate.toFixed(1)} / 5.0`;
        ctx.fillStyle = "rgba(223, 177, 91, 0.2)";
        ctx.beginPath();
        ctx.roundRect(240, 695, 240, 48, 24);
        ctx.fill();
        ctx.strokeStyle = "#dfb15b";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#dfb15b";
        ctx.font = "bold 30px Inter, sans-serif";
        ctx.fillText(scoreTxt, 360, 730);

        // Resenha do Usuário
        if (comTxt) {
            const bw = 580, bh = 180, bx = (cw - bw) / 2, by = 780;
            ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 18);
            ctx.fill();

            ctx.fillStyle = "#dfb15b";
            ctx.beginPath();
            ctx.roundRect(bx, by, 8, bh, [18, 0, 0, 18]);
            ctx.fill();

            ctx.fillStyle = "#eef0f3";
            ctx.font = "italic 22px Inter, sans-serif";
            ctx.textAlign = "left";

            const words = `"${comTxt}"`.split(" ");
            let line = "", ly = by + 45;
            for (let n = 0; n < words.length; n++) {
                const test = line + words[n] + " ";
                if (ctx.measureText(test).width > bw - 50 && n > 0) {
                    ctx.fillText(line, bx + 30, ly);
                    line = words[n] + " ";
                    ly += 32;
                    if (ly > by + bh - 20) break;
                } else {
                    line = test;
                }
            }
            if (line && ly <= by + bh - 20) ctx.fillText(line, bx + 30, ly);
        } else {
            drawWaveform(ctx, timeMs, 360, 830);
        }

        ctx.restore();
    }

    function formatStars(val) {
        const full = Math.floor(val);
        const half = (val % 1 !== 0);
        let s = "★".repeat(full);
        if (half) s += "½";
        s += "☆".repeat(Math.max(0, 5 - Math.ceil(val)));
        return s;
    }

    function truncateText(c, str, maxW) {
        let t = String(str || "");
        if (c.measureText(t).width <= maxW) return t;
        while (t.length > 3 && c.measureText(t + "…").width > maxW) {
            t = t.slice(0, -1);
        }
        return t + "…";
    }

    // Inicia o motor de animação no Canvas
    tiktokAnimId = requestAnimationFrame(drawFrame);

    // Atualiza o botão de gravação com a duração exata calculada
    const totalSecs = Math.round(totalVideoMs / 1000);
    if (statusOverlay) statusOverlay.style.display = "none";
    if (recordBtn) {
        recordBtn.disabled = false;
        recordBtn.textContent = hasTrackByTrack 
            ? `🎥 Gravar Vídeo Faixa a Faixa (${totalSecs}s)` 
            : `🎥 Gravar Vídeo TikTok (${totalSecs}s)`;
    }

    // Fechar modal
    const closeModal = () => {
        if (tiktokAnimId) { cancelAnimationFrame(tiktokAnimId); tiktokAnimId = null; }
        if (tiktokAudioObj) { tiktokAudioObj.pause(); tiktokAudioObj.src = ""; tiktokAudioObj = null; }
        modal.classList.remove("active");
    };

    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (closeBtn) closeBtn.onclick = closeModal;

    // ========================================================
    // GRAVAÇÃO ROBUSTA COM DURAÇÃO EXATA E MEDIARECORDER
    // ========================================================
    if (recordBtn) {
        recordBtn.onclick = async () => {
            recordBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (statusOverlay) statusOverlay.style.display = "flex";
            if (spinner) spinner.style.display = "block";
            if (progWrap) progWrap.style.display = "block";

            // Reinicia animação do início exato (t = 0) para o vídeo ser gravado desde a abertura
            animStartTime = performance.now();

            // Captura o stream de 30 FPS do Canvas
            const stream = canvas.captureStream(0);
            canvasCaptureTrack = stream.getVideoTracks()[0] || null;

            // Cria trilha de áudio segura via Web Audio API
            let audioCtx = null;
            let musicSource = null;
            let musicGain = null;
            let audioConnected = false;
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === "suspended") await audioCtx.resume();

                const audioDest = audioCtx.createMediaStreamDestination();
                if (tiktokAudioObj) {
                    // Encaminha a prévia musical tanto ao arquivo quanto aos alto-falantes.
                    musicSource = audioCtx.createMediaElementSource(tiktokAudioObj);
                    musicGain = audioCtx.createGain();
                    musicGain.gain.value = 0.85;
                    musicSource.connect(musicGain);
                    musicGain.connect(audioDest);
                    musicGain.connect(audioCtx.destination);
                    audioDest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
                    audioConnected = true;
                    tiktokAudioObj.currentTime = 0;
                    await tiktokAudioObj.play();
                }
            } catch (aErr) {
                console.warn("Não foi possível incluir a prévia musical no vídeo:", aErr);
            }

            // Grava em WebM, que mantém a animação neste navegador, e converte para MP4 depois.
            const mimeTypes = [
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm"
            ];
            let selectedMime = "";
            for (const m of mimeTypes) {
                if (MediaRecorder.isTypeSupported(m)) {
                    selectedMime = m;
                    break;
                }
            }

            let recorder;
            try {
                recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : {});
            } catch (e) {
                recorder = new MediaRecorder(stream);
            }

            const recordedChunks = [];
            recorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) recordedChunks.push(e.data);
            };

            recorder.onstop = async () => {
                if (tiktokAudioObj) tiktokAudioObj.pause();
                stream.getTracks().forEach(track => track.stop());
                if (audioCtx) { try { audioCtx.close(); } catch(e){} }

                const rawBlob = new Blob(recordedChunks, { type: recorder.mimeType || selectedMime || "video/webm" });
                let downloadBlob = rawBlob;
                let ext = "webm";
                try {
                    downloadBlob = await convertTikTokWebmToMp4(rawBlob, statusText, progBar);
                    ext = "mp4";
                } catch (conversionError) {
                    console.error("Falha ao converter WebM para MP4:", conversionError);
                }

                // Em caso de falha do conversor, ainda entrega o WebM gravado corretamente.
                const url = URL.createObjectURL(downloadBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `soundbpm_${hasTrackByTrack ? "faixa_a_faixa_" : ""}${albumName.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);

                if (statusOverlay) statusOverlay.style.display = "none";
                recordBtn.disabled = false;
                if (cancelBtn) cancelBtn.disabled = false;
                if (window.gameToast) {
                    window.gameToast(ext === "mp4"
                        ? "Vídeo convertido para MP4 e baixado! ✨"
                        : "Conversão indisponível; vídeo baixado em WebM.");
                }
            };

            if (tiktokAudioObj && !audioConnected) {
                console.warn("O vídeo será gravado sem música porque o áudio não pôde ser conectado.");
            }

            // Inicia gravando com timeslice de 100ms para emissão contínua de dados
            recorder.start(100);

            const recStart = Date.now();
            const timer = setInterval(() => {
                const nowMs = Date.now();
                const elapsedMs = nowMs - recStart;
                const pct = Math.min(100, Math.round((elapsedMs / totalVideoMs) * 100));

                if (progBar) progBar.style.width = pct + "%";
                if (statusText) {
                    const curSec = (elapsedMs / 1000).toFixed(1);
                    const totSec = (totalVideoMs / 1000).toFixed(0);
                    statusText.textContent = `Gravando vídeo: ${curSec}s de ${totSec}s (${pct}%)`;
                }

                if (elapsedMs >= totalVideoMs) {
                    clearInterval(timer);
                    if (recorder.state === "recording") {
                        recorder.stop();
                    }
                }
            }, 100);
        };
    }
};

