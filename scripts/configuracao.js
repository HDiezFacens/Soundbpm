/* ==========================================================================
   SoundBPM - Configuração Global, Supabase, Spotify e Utilitários
   ========================================================================== */

// 1. Limpa simulações antigas do Spotify
// Limpa simulações antigas para que o site nunca abra simulado por padrão
if (localStorage.getItem("spotify_access_token") === "simulated_token") {
    localStorage.removeItem("spotify_access_token");
}


// 2. Configurações e Inicialização do Supabase
const SUPABASE_URL = "https://mfpjuyqcieqtcdbkvgwu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0yXhFfS--QMrzTIJATHvUA_wfealgxV";

let supabaseClient = null;
if (window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("SDK do Supabase não carregado corretamente.");
}

// NÃO sobrescreva window.supabase — esse namespace pertence ao SDK!
window.supabaseClient = supabaseClient;

// 3. Configurações do Spotify Web API
const SPOTIFY_CLIENT_ID = "17faef55f3dd41ce94e8b27d82addf1c";
const REDIRECT_URI = window.location.href.split('?')[0].replace(/#.*$/, '');
const SCOPES = "user-read-private user-read-email user-read-recently-played user-top-read user-library-read playlist-modify-public streaming";



window.SPOTIFY_CLIENT_ID = SPOTIFY_CLIENT_ID;
window.REDIRECT_URI = REDIRECT_URI;
window.SCOPES = SCOPES;

// 4. Utilitários Globais
// Sanitização contra XSS
// Função de sanitização contra XSS
const gameEsc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

window.gameEsc = gameEsc;

// Interceptador de Imagens em Alta Resolução
// ===========================================================================
// CORREÇÃO: INTERCEPTADOR DE ALTA RESOLUÇÃO (Evita imagem embaçada no Hero)
// ===========================================================================
function getHighResImage(data) {
    let url = '';
    if (typeof data === 'string') {
        url = data;
    } else if (data) {
        if (data.images && data.images.length > 0) url = data.images[0].url;
        else if (data.album && data.album.images && data.album.images.length > 0) url = data.album.images[0].url;
        else if (data.artworkUrl100) url = data.artworkUrl100;
    }
    
    // Se a imagem for do iTunes/Apple, força qualidade de estúdio (1000x1000 px)
    if (url && (url.includes('mzstatic.com') || url.includes('apple.com'))) {
        return url.replace(/100x100bb\.jpg/g, '1000x1000bb.jpg').replace(/600x600bb\.jpg/g, '1000x1000bb.jpg');
    }
    return url || '';
}

window.getHighResImage = getHighResImage;

// Mensagens Toast
function gameToast(msg) {
    const t = document.createElement("div");
    t.className = "game-toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("hide"), 3500);
    setTimeout(() => t.remove(), 4000);
}

window.gameToast = gameToast;

// Leitor de arquivo local para DataURL
function fileToDataURL(file) {
    return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => resolve(null);
        r.readAsDataURL(file);
    });
}

window.fileToDataURL = fileToDataURL;

// Formatação amigável de tempo decorrido
function timeAgo(d) {
    const s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return "agora";
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    if (s < 604800) return `há ${Math.floor(s / 86400)} d`;
    return new Date(d).toLocaleDateString("pt-BR");
}

window.timeAgo = timeAgo;

// Requisições com Timeout seguro
function fetchTimeout(url, ms) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    return fetch(url, { signal: c.signal }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r; }).finally(() => clearTimeout(t));
}


window.fetchTimeout = fetchTimeout;

// Utilitários de Notícias (HTML para texto, parse de data e parse de feed XML)
function htmlToText(html) { return new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent.replace(/\s+/g, " ").trim(); }
function parseNewsDate(s) {
    if (!s) return null;
    const d = /^\d{4}-\d{2}-\d{2} \d{2}:/.test(s) ? new Date(s.replace(" ", "T") + "Z") : new Date(s);
    return isNaN(d) ? null : d;
}
function parseXmlFeed(text) {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("XML inválido");
    const tag = (el, n) => { const x = el.getElementsByTagName(n)[0]; return x ? x.textContent : ""; };
    return [...doc.querySelectorAll("item, entry")].map(el => {
        const l = el.getElementsByTagName("link")[0];
        return {
            title: htmlToText(tag(el, "title")),
            link: (l && (l.getAttribute("href") || l.textContent) || "").trim(),
            date: parseNewsDate(tag(el, "pubDate") || tag(el, "published") || tag(el, "updated") || tag(el, "dc:date")),
            description: htmlToText(tag(el, "description") || tag(el, "summary") || tag(el, "content:encoded"))
        };
    });
}


window.htmlToText = htmlToText;
window.parseNewsDate = parseNewsDate;
window.parseXmlFeed = parseXmlFeed;

// Parser e gerador de HTML de Resenhas
function parseReviewText(raw) {
    let t = String(raw || "").trim(), tracks = "";
    const m = t.match(/^\[Avaliação Faixa a Faixa\]\n([\s\S]*?)(?:\n\nNota: "([\s\S]*)")?$/);
    if (m) { tracks = (m[1] || "").trim(); t = (m[2] || "").trim(); }
    if (/^(sem texto( de resenha)?|sem coment[áa]rio)\.?$/i.test(t)) t = "";
    return { comment: t, tracks };
}
function reviewBodyHtml(raw, style) {
    const { comment, tracks } = parseReviewText(raw);
    let html = "";
    if (comment) html += `<p class="rv-text" style="${style || ""}">"${gameEsc(comment)}"</p>`;
    if (tracks) html += `<details class="rv-tracks"><summary>🎼 Nota por faixa</summary><p>${gameEsc(tracks)}</p></details>`;
    return html;
}

window.parseReviewText = parseReviewText;
window.reviewBodyHtml = reviewBodyHtml;

// Gerador de links diretos de perfil
function profileLink(id) {
    if (location.protocol === "file:") gameToast("Este link só funciona com o site publicado (não com o arquivo aberto do computador).");
    return location.href.split(/[?#]/)[0] + "?u=" + id;
}

window.profileLink = profileLink;

// Avatar sem foto: retorna <img> se tiver URL, ou <div> com silhueta SVG se não tiver
function avatarHtml(url, size, extraStyle) {
    size = size || 40;
    extraStyle = extraStyle || "";
    var base = "border-radius:50%;width:" + size + "px;height:" + size + "px;object-fit:cover;flex-shrink:0;" + extraStyle;
    if (url) {
        return '<img src="' + gameEsc(url) + '" style="' + base + '" onerror="this.replaceWith(window._avatarSvgEl(' + size + '))">';
    }
    return '<div style="' + base + ';background:var(--bg-elevated,#2a2a3e);display:flex;align-items:center;justify-content:center;">' +
        '<svg width="' + Math.round(size * 0.55) + '" height="' + Math.round(size * 0.55) + '" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="12" cy="8" r="4" fill="var(--text-muted,#888)"/>' +
        '<path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="var(--text-muted,#888)" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
        '</svg></div>';
}
// Helper para o onerror do <img>
window._avatarSvgEl = function(size) {
    var d = document.createElement('div');
    d.innerHTML = avatarHtml(null, size);
    return d.firstChild;
};
window.avatarHtml = avatarHtml;
