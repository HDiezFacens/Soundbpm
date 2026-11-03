/* ==========================================================================
   SoundBPM - Feed de Notícias Musicais e Radar de Lançamentos
   ========================================================================== */

var supabase = window.supabaseClient || window.supabase;
var gameEsc = window.gameEsc;
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
            const current2026Queries = [
                "The Weeknd 2026", 
                "Lady Gaga 2026", 
                "Bad Bunny 2026", 
                "Kendrick Lamar 2026", 
                "Sabrina Carpenter 2026", 
                "Billie Eilish 2026", 
                "Tyler The Creator 2026", 
                "Bruno Mars 2026", 
                "Rosalia 2026", 
                "Coldplay 2026", 
                "Charli xcx 2026", 
                "Post Malone 2026"
            ];

            const shuffledQueries = current2026Queries.sort(() => 0.5 - Math.random()).slice(0, 5);
            let allAlbums = [];

            for (const q of shuffledQueries) {
                const results = await fetchCatalogData(q);
                if (results && results.length > 0) {
                    allAlbums.push(...results);
                }
            }

            if (allAlbums.length === 0) {
                allAlbums = await fetchCatalogData("2026");
            }

            allAlbums.sort((a, b) => {
                const dateA = new Date(a.release_date || '2026-01-01');
                const dateB = new Date(b.release_date || '2026-01-01');
                return dateB - dateA;
            });

            const uniqueMap = new Map();
            allAlbums.forEach(album => {
                const albumName = album.name || album.collectionName;
                if (albumName && !uniqueMap.has(albumName)) {
                    const rawDate = album.release_date || '2026';
                    const year = rawDate.split('-')[0] || '2026';

                    uniqueMap.set(albumName, {
                        collectionName: albumName,
                        artistName: album.artistName || (album.artists ? album.artists.map(a => a.name).join(', ') : ''),
                        artworkUrl100: album.artworkUrl100 || (album.images && album.images[0] ? album.images[0].url : ''),
                        releaseDate: rawDate,
                        releaseYear: year,
                        collectionViewUrl: '#'
                    });
                }
            });

            allUpcomingItems = Array.from(uniqueMap.values());
            renderUpcomingList(4);

            if (viewMoreUpcomingLink) {
                const newLink = viewMoreUpcomingLink.cloneNode(true);
                viewMoreUpcomingLink.parentNode.replaceChild(newLink, viewMoreUpcomingLink);
                
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
            const year = a.releaseYear || '2026';
            
            return `
            <div class="upcoming-card">
                <img src="${cover}" alt="${a.collectionName}">
                <div class="upcoming-details">
                    <h4 title="${a.collectionName}">${a.collectionName}</h4>
                    <span class="upcoming-artist">${a.artistName}</span>
                    <p>🔥 Lançamento Recente • ${year}</p>
                </div>
                <a href="${a.collectionViewUrl || '#'}" target="_blank" class="btn-notify">Ouvir</a>
            </div>`;
        }).join('');

        upcomingContainer.style.display = "grid";
        upcomingContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
        upcomingContainer.style.gap = "1rem";
    }
}
loadNewsAndUpcoming();


window.loadNewsAndUpcoming = loadNewsAndUpcoming;
