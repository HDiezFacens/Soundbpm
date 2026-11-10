var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Arquivo Principal de Inicialização (Bootstrap da Aplicação)
   ========================================================================== */

// Intercepta a navegação SPA para atualizar Diário Global e Top Reviews
const navBase = window.navigateTo;
window.navigateTo = function (pageId, pushHistory = true) {
    if (navBase) navBase(pageId, pushHistory);
    if (pageId === "diary-page") {
        document.querySelectorAll(".diary-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "reviews"));
        const revP = document.getElementById("diary-reviews-panel");
        const vidP = document.getElementById("diary-videos-panel");
        if (revP) revP.style.display = "";
        if (vidP) vidP.style.display = "none";
        if (window.loadDiaryPage) window.loadDiaryPage(true);
    }
    if (pageId === "home" || pageId === "explore") {
        if (window.loadHomeTopReviews) window.loadHomeTopReviews();
    }
};

document.addEventListener("DOMContentLoaded", async () => {
    console.log("SoundBPM inicializado com sucesso.");

    // 1. Inicializa Controles de Banner e Avatar no Perfil
    if (window.wireBannerControls) window.wireBannerControls();

    // 2. Processa Retorno de Autenticação do Spotify se houver na URL
    if (window.handleSpotifyCallback) await window.handleSpotifyCallback();

    // 3. Checa Sessão do Supabase
    if (window.checkSupabaseSession) await window.checkSupabaseSession();

    // 4. Carrega Conteúdo Inicial da Página Inicial (Home / Explore)
    if (window.loadPopularContent) window.loadPopularContent();
    if (window.loadNewsAndUpcoming) window.loadNewsAndUpcoming();
    if (window.loadHomeTopReviews) window.loadHomeTopReviews();

    // 5. Trata Link Direto de Perfil Compartilhado (?u=USER_ID)
    const urlParams = new URLSearchParams(window.location.search);
    let pendingProfileId = urlParams.get("u");
    if (pendingProfileId && window.supabaseClient) {
        window.supabaseClient.auth.onAuthStateChange((_event, session) => {
            if (session && session.user && pendingProfileId) {
                const id = pendingProfileId;
                pendingProfileId = null;
                history.replaceState(null, "", location.href.split(/[?#]/)[0]);
                setTimeout(() => { if (window.openUserProfile) window.openUserProfile(id); }, 800);
            }
        });
        setTimeout(() => {
            if (pendingProfileId && window.gameToast) {
                window.gameToast("Faça login para ver o perfil compartilhado.");
            }
        }, 2500);
    }
});
