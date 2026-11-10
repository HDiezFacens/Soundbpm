var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Roteador SPA, Histórico, Navegação e Alternância de Temas
   ========================================================================== */


// 1. Roteador SPA e Histórico
const homeSections = ["explore", "trending", "news", "upcoming", "community"];
const allPages = ["dashboard", "albums-page", "profile-page", "people-page", "album-detail-page", "ranking-page", "diary-page"];

window.navigateTo = function(pageId, pushHistory = true) {
    if (pageId === "home" || pageId === "explore") {
        homeSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
        allPages.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
    } else {
        homeSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
        allPages.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = (id === pageId) ? "block" : "none";
        });
    }
    
    if (webPlayer && localStorage.getItem("spotify_access_token")) {
        webPlayer.classList.remove("hidden");
    }

    if (pushHistory) {
        history.pushState({ page: pageId }, "", `#${pageId}`);
    }
    
    window.scrollTo(0, 0);
};

window.addEventListener("popstate", (event) => {
    const pageId = event.state?.page || "home";
    navigateTo(pageId, false);
});


// 2. Seletor de Abas Mobile (Dropdown)
window.switchTab = function(pageId) {
    window.navigateTo(pageId);
    const mobileDropdown = document.getElementById("mobile-nav-dropdown");
    if (mobileDropdown) mobileDropdown.value = pageId;
};

const mobileDropdown = document.getElementById("mobile-nav-dropdown");
if (mobileDropdown) {
    mobileDropdown.addEventListener("change", (e) => {
        const val = e.target.value;
        const homeSectionsList = ["explore", "trending", "news", "upcoming", "community"];
        
        if (val === "explore" || val === "home" || homeSectionsList.includes(val)) {
            navigateTo("home");
            setTimeout(() => {
                const targetEl = document.getElementById(val === "home" ? "explore" : val);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: "smooth" });
                }
            }, 50);
        } else {
            const pageId = val.replace("#", "");
            navigateTo(pageId);
            
            if (pageId === "dashboard") populateDashboard();
            if (pageId === "albums-page") loadAlbumsPageContent("__TRENDING__");
            if (pageId === "people-page") loadPeoplePage();
            if (pageId === "ranking-page") loadRankingPage();
            if (pageId === "profile-page") loadUserProfile();
        }
    });
}


// 3. Links de Navegação da Header
const navHomeLink = document.getElementById("nav-home-link");
const dashLink = document.getElementById("nav-dashboard-link");
const navAlbumsLink = document.getElementById("nav-albums-link");
const exploreCatalogBtn = document.getElementById("explore-catalog-btn"); 

if (navHomeLink) {
    navHomeLink.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("home");
    });
}

if (dashLink) {
    dashLink.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("dashboard");
        populateDashboard();
    });
}

if (navAlbumsLink) {
    navAlbumsLink.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("albums-page");
        loadAlbumsPageContent("__TRENDING__");
    });
}

if (exploreCatalogBtn) {
    exploreCatalogBtn.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("albums-page");
        loadAlbumsPageContent("__TRENDING__");
    });
}



// 4. Botões de Chamada no Hero
const heroStartBtn = document.getElementById("hero-start-diary-btn");
if (heroStartBtn) {
    heroStartBtn.addEventListener("click", async () => {
        let isLoggedIn = false;
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) isLoggedIn = true;
        }
        const localUser = localStorage.getItem("soundbpm_user");
        const spotifyToken = localStorage.getItem("spotify_access_token");

        if (isLoggedIn || localUser || (spotifyToken && spotifyToken !== "simulated_token")) {
            navigateTo("albums-page");
            loadAlbumsPageContent("__TRENDING__");
        } else {
            if (modal) modal.classList.add("active");
        }
    });
}

const viewAllTrendingLink = document.getElementById("view-all-trending-link");
if (viewAllTrendingLink) {
    viewAllTrendingLink.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("albums-page");
        loadAlbumsPageContent("__TRENDING__");
    });
}


// 5. Alternador de Tema Claro / Escuro
const themeToggleBtn = document.getElementById("theme-toggle");
if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const root = document.documentElement;
        const currentTheme = root.getAttribute("data-theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";
        
        root.classList.add("theme-anim");
        if (newTheme === "light") {
            root.setAttribute("data-theme", "light");
        } else {
            root.removeAttribute("data-theme");
        }
        try { localStorage.setItem("soundbpm_theme", newTheme); } catch(e) {}
        setTimeout(() => root.classList.remove("theme-anim"), 450);
    });
}

// 6. Efeito de Rolagem no Cabeçalho
window.addEventListener("scroll", () => {
    const header = document.querySelector(".site-header");
    if (header) {
        if (window.scrollY > 20) header.classList.add("scrolled");
        else header.classList.remove("scrolled");
    }
});
