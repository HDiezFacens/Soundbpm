var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Feed de Notícias Musicais e Radar de Lançamentos
   ========================================================================== */

var parseXmlFeed = window.parseXmlFeed;

// 1. Busca de Notícias Reais (Edge Function + Cache Local)
async function fetchRealNews() {
    const KEY = "soundbpm_news_cache_supabase_v7";
    
    const SUPABASE_URL = "https://mfpjuyqcieqtcdbkvgwu.supabase.co";
    const functionUrl = `${SUPABASE_URL}/functions/v1/g1-news-proxy`;

    let items = [];

    try {
        const response = await fetch(functionUrl, {
            method: "GET",
            headers: {
                "apikey": "sb_publishable_0yXhFfS--QMrzTIJATHvUA_wfealgxV"
            },
            signal: AbortSignal.timeout(6000)
        });

        if (response.ok) {
            const xmlText = await response.text();
            const parsedItems = parseXmlFeed(xmlText);

            if (parsedItems && parsedItems.length > 0) {
                items = parsedItems.map(i => ({
                    ...i,
                    source: "G1 Música",
                    tag: "G1"
                }));

                try {
                    localStorage.setItem(KEY, JSON.stringify({ 
                        ts: Date.now(), 
                        items: items.map(i => ({ ...i, date: i.date ? i.date.toISOString() : null })) 
                    }));
                } catch (e) {}

                return { items, cached: false };
            }
        }
    } catch (e) {
        console.warn("Aviso: Falha ao carregar notícias via Edge Function, a tentar cache...", e);
    }

    try {
        const cached = JSON.parse(localStorage.getItem(KEY));
        if (cached && cached.items && cached.items.length) {
            return { 
                items: cached.items.map(i => ({ ...i, date: i.date ? new Date(i.date) : null })), 
                cached: true, 
                ts: cached.ts 
            };
        }
    } catch (e) {}

    return { items: [], cached: false };
}


window.fetchRealNews = fetchRealNews;

// 2. Feed de Notícias e Radar de Lançamentos
let allNewsItems = [];
let newsState = "loading", newsCachedAt = null;
let showingAllNews = false;
let allUpcomingItems = [];
let showingAllUpcoming = false;

async function loadNewsAndUpcoming() {
    const newsContainer = document.getElementById("news-grid-container");
    const viewAllNewsLink = document.getElementById("view-all-news-link");
    const upcomingContainer = document.getElementById("upcoming-grid-container");
    const viewMoreUpcomingLink = document.getElementById("view-more-upcoming-link");

    function renderNewsList(limit) {
        if (!newsContainer) return;
        if (newsState === "loading") { newsContainer.innerHTML = `<p class="news-note">Carregando notícias de música...</p>`; return; }
        if (!allNewsItems.length) {
            newsContainer.innerHTML = `<p class="news-note">Não foi possível carregar as notícias agora. <a href="#" id="news-retry">Tentar novamente</a> ou acesse <a href="https://g1.globo.com/pop-arte/musica/" target="_blank" rel="noopener noreferrer">g1.globo.com/pop-arte/musica</a>.</p>`;
            return;
        }
        const note = newsCachedAt ? `<p class="news-note">Sem conexão com as fontes agora. Exibindo notícias salvas em ${new Date(newsCachedAt).toLocaleString("pt-BR")}.</p>` : "";
        newsContainer.innerHTML = note + allNewsItems.slice(0, limit).map(item => {
            const ok = item.date instanceof Date && !isNaN(item.date);
            const snippet = item.description ? gameEsc(item.description.length > 115 ? item.description.slice(0, 115).trim() + "…" : item.description) : "";
            return `
            <article class="news-card">
                <div class="news-tag">${gameEsc(item.tag || "Notícia")}</div>
                <h3><a href="${gameEsc(item.link)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${gameEsc(item.title)}</a></h3>
                ${snippet ? `<p class="news-snippet">${snippet}</p>` : ""}
                <div class="news-meta">
                    <span>${ok ? item.date.toLocaleDateString("pt-BR") : ""}</span>
                    <span>${gameEsc(item.source || "")}</span>
                </div>
            </article>`;
        }).join("");
    }

    if (newsContainer) {
        renderNewsList(showingAllNews ? allNewsItems.length : 3);

        if (viewAllNewsLink) {
            const newLink = viewAllNewsLink.cloneNode(true);
            viewAllNewsLink.parentNode.replaceChild(newLink, viewAllNewsLink);

            const updateBtnText = () => {
                newLink.textContent = showingAllNews 
                    ? "Mostrar menos ←" 
                    : `Ver todas as notícias (${allNewsItems.length}) →`;
            };
            updateBtnText();

            newLink.addEventListener("click", (e) => {
                e.preventDefault();
                showingAllNews = !showingAllNews;

                if (showingAllNews) {
                    renderNewsList(allNewsItems.length);
                    newLink.textContent = "Mostrar menos ←";
                } else {
                    renderNewsList(3);
                    updateBtnText();
                    const newsSection = document.getElementById("news");
                    if (newsSection) newsSection.scrollIntoView({ behavior: "smooth" });
                }
            });
        }

        const loadNews = async () => {
            newsState = "loading"; newsCachedAt = null; renderNewsList(3);
            const res = await fetchRealNews();
            allNewsItems = res.items; newsCachedAt = res.cached ? res.ts : null; newsState = "done";
            renderNewsList(showingAllNews ? allNewsItems.length : 3);
            const btn = document.getElementById("view-all-news-link");
            if (btn) {
                btn.style.display = allNewsItems.length > 3 ? "" : "none";
                if (!showingAllNews) btn.textContent = `Ver todas as notícias (${allNewsItems.length}) →`;
            }
        };
        newsContainer.addEventListener("click", (e) => { if (e.target.id === "news-retry") { e.preventDefault(); loadNews(); } });
        loadNews();
    }

    if (upcomingContainer) {
        try {
            const latestAlbums = window.fetchCurrentReleases
                ? await window.fetchCurrentReleases()
                : [];
            allUpcomingItems = latestAlbums.map(album => ({
                collectionName: album.collectionName,
                artistName: album.artistName,
                artworkUrl100: album.artworkUrl100,
                releaseDate: album.releaseDate,
                releaseYear: album.releaseYear,
                collectionViewUrl: album.collectionViewUrl,
            }));
            renderUpcomingList(4);

            const freshUpcomingLink = document.getElementById("view-more-upcoming-link");
            if (freshUpcomingLink && freshUpcomingLink.parentNode) {
                const newLink = freshUpcomingLink.cloneNode(true);
                freshUpcomingLink.parentNode.replaceChild(newLink, freshUpcomingLink);
                
                newLink.addEventListener("click", (e) => {
                    e.preventDefault();
                    showingAllUpcoming = !showingAllUpcoming;
                    
                    if (showingAllUpcoming) {
                        renderUpcomingList(allUpcomingItems.length);
                        newLink.textContent = "Mostrar menos ←";
                    } else {
                        renderUpcomingList(4);
                        newLink.textContent = "Ver mais →";
                    }

                    document.getElementById("upcoming").scrollIntoView({ behavior: "smooth" });
                });
            }
        } catch(e) {
            console.error("Erro ao carregar lançamentos:", e);
            upcomingContainer.innerHTML = "<p style='color: var(--text-muted); text-align: center; grid-column: 1/-1;'>Erro ao carregar o radar de lançamentos.</p>";
        }
    }

    function renderUpcomingList(limit) {
        if (!upcomingContainer) return;
        const itemsToDisplay = allUpcomingItems.slice(0, limit);
        const currentViewMoreBtn = document.getElementById("view-more-upcoming-link");
        
        if (allUpcomingItems.length === 0) {
            upcomingContainer.innerHTML = "<p style='color: var(--text-muted); text-align: center; grid-column: 1/-1;'>Nenhum lançamento recente encontrado.</p>";
            upcomingContainer.style.display = "block";
            if (currentViewMoreBtn) currentViewMoreBtn.style.display = "none";
            return;
        }

        if (currentViewMoreBtn) {
            currentViewMoreBtn.style.display = "inline-block";
        }

        upcomingContainer.innerHTML = itemsToDisplay.map((a) => {
            const cover = getHighResImage(a.artworkUrl100) || './Logo.png';
            const releaseDate = a.releaseDate || a.releaseYear || "";
            const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
                ? new Date(`${releaseDate}T00:00:00`).toLocaleDateString("pt-BR")
                : releaseDate;
            
            return `
            <div class="upcoming-card">
                <img src="${gameEsc(cover)}" alt="${gameEsc(a.collectionName)}" loading="lazy">
                <div class="upcoming-details">
                    <h4 title="${gameEsc(a.collectionName)}">${gameEsc(a.collectionName)}</h4>
                    <span class="upcoming-artist">${gameEsc(a.artistName)}</span>
                    <p>🆕 Lançado em ${gameEsc(dateLabel)}</p>
                </div>
                <a href="${gameEsc(a.collectionViewUrl || '#')}" target="_blank" rel="noopener noreferrer" class="btn-notify">Ouvir no Spotify</a>
            </div>`;
        }).join('');

        upcomingContainer.style.display = "grid";
        upcomingContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
        upcomingContainer.style.gap = "1rem";
    }
}
window.loadNewsAndUpcoming = loadNewsAndUpcoming;
