var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Catálogo de Álbuns, Busca, Detalhes e Minha Lista (Backlog)
   ========================================================================== */

var getHighResImage = window.getHighResImage;
var gameToast = window.gameToast;
var navigateTo = window.navigateTo;

// 1. Busca e Carrossel Hero
const trendingGrid = document.getElementById("trending-albums-grid");
const sectionMainTitle = document.getElementById("section-main-title");
const sectionMainSubtitle = document.getElementById("section-main-subtitle");
const heroBackdrop = document.getElementById("hero-backdrop");
const heroTitle = document.getElementById("hero-title");
const heroDesc = document.getElementById("hero-desc");
const searchInput = document.getElementById("search-input");
let carouselInterval;

const searchCache = new Map();

window.invokeSpotifySearch = async function(body) {
    if (!supabase) {
        return { data: null, error: new Error("Supabase não inicializado.") };
    }
    // A Edge Function pode servir uma resposta compartilhada em cache mesmo
    // quando o Spotify está limitando novas chamadas; não bloquear no navegador.
    return await supabase.functions.invoke("spotify-search", { body });
};

async function fetchCatalogDataFromITunes(query) {
    try {
        const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=20`);
        const data = await response.json();
        
        return (data.results || []).map(item => {
            const highResUrl = getHighResImage(item.artworkUrl100);
            return {
                name: item.collectionName,
                collectionName: item.collectionName,
                artistName: item.artistName,
                artists: [{ name: item.artistName }],
                images: [{ url: highResUrl }],
                artworkUrl100: highResUrl,
                release_date: item.releaseDate ? item.releaseDate.split('T')[0] : '2026',
                collectionId: item.collectionId,
                id: item.collectionId
            };
        });
    } catch (error) {
        console.error("Erro no fallback do iTunes:", error);
        return [];
    }
}

async function fetchCatalogData(query) {
    if (!query) return [];
    if (searchCache.has(query)) {
        return searchCache.get(query);
    }

    try {
        if (!supabase) {
            throw new Error("Supabase não inicializado.");
        }

        const { data, error } = await window.invokeSpotifySearch({ query });

        if (error) {
            console.warn("Spotify indisponível. Usando o catálogo de fallback.");
            return await fetchCatalogDataFromITunes(query);
        }

        if (!data || !data.albums || !data.albums.items || data.albums.items.length === 0) {
            console.warn("Spotify indisponível ou sem resultados. Alternando para o iTunes...");
            return await fetchCatalogDataFromITunes(query);
        }

        const results = (data.albums.items || []).map(item => ({
            name: item.name,
            collectionName: item.name,
            artistName: item.artists.map(a => a.name).join(', '),
            artists: item.artists,
            images: item.images,
            artworkUrl100: item.images[0]?.url || '',
            release_date: item.release_date || '2026',
            collectionId: item.id,
            id: item.id
        }));

        searchCache.set(query, results);
        return results;
    } catch (error) {
        console.error("Falha crítica na comunicação com Spotify. Acionando fallback do iTunes:", error);
        const iTunesResults = await fetchCatalogDataFromITunes(query);
        return iTunesResults;
    }
}

let currentReleasesPromise = null;
window.fetchCurrentReleases = function() {
    if (currentReleasesPromise) return currentReleasesPromise;

    currentReleasesPromise = (async () => {
        const { data, error } = await window.invokeSpotifySearch({ query: "tag:new" });
        if (error) throw error;

        const seen = new Set();
        const items = data?.albums?.items || [];
        return items
            .filter(album => album.name && album.release_date && !Number.isNaN(Date.parse(album.release_date)))
            .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
            .filter(album => {
                const artistNames = (album.artists || []).map(artist => artist.name).join(", ");
                const key = `${album.name}::${artistNames}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .map(album => ({
                ...album,
                collectionName: album.name,
                artistName: (album.artists || []).map(artist => artist.name).join(", "),
                artworkUrl100: album.images?.[0]?.url || "",
                releaseDate: album.release_date,
                releaseYear: album.release_date.split("-")[0],
                isCurrentRelease: true,
                collectionId: album.id,
                collectionViewUrl: album.external_urls?.spotify || (album.id ? `https://open.spotify.com/album/${album.id}` : "#"),
            }));
    })().catch(error => {
        currentReleasesPromise = null;
        console.warn("Não foi possível atualizar os lançamentos recentes:", error);
        return [];
    });

    return currentReleasesPromise;
};

async function fetchRealTrendingAlbums() {
    const acclaimedMasterpieces = [
        { query: "Pink Floyd Dark Side of the Moon", synopsis: "Uma experiência sonora transcendental sobre o tempo, a loucura e a condição humana." },
        { query: "The Beatles Abbey Road", synopsis: "O grande canto do cisne da banda, trazendo medleys lendários e produção impecável." },
        { query: "Michael Jackson Thriller", synopsis: "O álbum mais vendido de todos os tempos, redefinindo o pop com genialidade e refrões eternos." },
        { query: "Fleetwood Mac Rumours", synopsis: "Um clássico atemporal forjado no meio de corações partidos e harmonias vocais perfeitas." },
        { query: "Nirvana Nevermind", synopsis: "O trovão grunge que destruiu o hair metal e deu voz à angústia da Geração X." },
        { query: "Radiohead OK Computer", synopsis: "O marco do rock alternativo que previu com precisão a alienação e a ansiedade da era digital." },
        { query: "Amy Winehouse Back to Black", synopsis: "Soul e R&B visceral com uma honestidade brutal e letras de cortar o coração." },
        { query: "Daft Punk Discovery", synopsis: "Uma viagem nostálgica de french house e disco que moldou para sempre a música eletrônica moderna." },
        { query: "Kendrick Lamar good kid m.A.A.d city", synopsis: "Um curta-metragem sonoro magistral sobre a juventude, os perigos e as tentações nas ruas de Compton." },
        { query: "Frank Ocean Blonde", synopsis: "Uma obra-prima atmosférica, minimalista e introspectiva que redefiniu os limites do R&B contemporâneo." },
        { query: "Tyler The Creator Igor", synopsis: "Uma jornada caótica, colorida e genial sobre desilusão amorosa, misturando neo-soul e sintetizadores." },
        { query: "Beyonce Renaissance", synopsis: "Uma celebração eufórica, vibrante e contínua da cultura dance, house e disco underground." }
    ];
    
    const shuffled = acclaimedMasterpieces.sort(() => 0.5 - Math.random()).slice(0, 8);
    let finalAlbums = [];

    try {
        for (const obj of shuffled) {
            const results = await fetchCatalogData(obj.query);
            if (results && results.length > 0) {
                const item = results[0];
                finalAlbums.push({
                    ...item,
                    synopsis: obj.synopsis
                });
            }
        }
        if (finalAlbums.length === 0) {
            return await fetchCatalogData("hits");
        }
        return finalAlbums;
    } catch (e) {
        console.error("Falha ao carregar álbuns em destaque", e);
        return await fetchCatalogData("hits");
    }
}

async function loadPopularContent() {
    if (sectionMainTitle) sectionMainTitle.textContent = "Álbuns Populares & Obras-Primas";
    if (sectionMainSubtitle) sectionMainSubtitle.textContent = "Os álbuns mais aclamados e influentes da história e da atualidade.";

    const albums = await fetchRealTrendingAlbums();
    
    if (albums && albums.length > 0) {
        renderAlbums(albums.slice(0, 8));
        setupHeroCarousel(albums.slice(0, 5));
    } else {
        if (trendingGrid) {
            trendingGrid.innerHTML = `
                <p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Não foi possível carregar os álbuns em destaque.</p>
            `;
        }
    }
}

window.createAlbumCardHTML = function(album) {
    const imageUrl = getHighResImage(album);
    const artistName = album.artists ? album.artists.map(a => a.name).join(', ') : (album.artistName || 'Artista Desconhecido');
    const albumName = album.name || album.collectionName || 'Álbum';
    const collectionId = album.collectionId || album.id || '';
    
    const safeName = gameJsArg(albumName);
    const safeArtist = gameJsArg(artistName);
    const safeImage = gameJsArg(imageUrl);
    const safeCollectionId = gameJsArg(collectionId);
    const releaseDate = album.releaseDate || album.release_date || "";
    const releaseDateLabel = /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
        ? new Date(`${releaseDate}T00:00:00`).toLocaleDateString("pt-BR")
        : releaseDate;
    const cardMeta = album.isCurrentRelease
        ? `🆕 Lançado em ${gameEsc(releaseDateLabel)}`
        : `🎧 Álbum em destaque`;

    return `
        <div class="poster-card" data-collection-id="${gameEsc(collectionId)}">
            <div class="poster-image-wrap" onclick="openAlbumPage(${safeCollectionId}, ${safeName}, ${safeArtist}, ${safeImage})" style="cursor: pointer;">
                <img src="${gameEsc(imageUrl)}" alt="${gameEsc(albumName)}">
                <div class="poster-overlay-actions" onclick="event.stopPropagation()">
                    <button class="action-icon-btn" title="Avaliar Álbum" onclick="openReviewModal(${safeName}, ${safeArtist}, ${safeImage}, ${safeCollectionId})">★</button>
                    <button class="action-icon-btn btn-fav-action" title="Favoritar" onclick="toggleFavorite(${safeName}, ${safeArtist}, ${safeImage}, this)">♥</button>
                    <button class="action-icon-btn" title="Adicionar à Fila de Desejos" onclick="addToBacklog(${safeName}, ${safeArtist}, ${safeImage})">＋</button>
                    <button class="action-icon-btn" title="Ouvir prévia do álbum" onclick="playAlbumPreview(${safeCollectionId}, ${safeName}, ${safeArtist}, ${safeImage})">▶</button>
                </div>
            </div>
            <div class="poster-info" onclick="openAlbumPage(${safeCollectionId}, ${safeName}, ${safeArtist}, ${safeImage})" style="cursor: pointer;">
                <h3>${gameEsc(albumName)}</h3>
                <span class="poster-artist">${gameEsc(artistName)}</span>
                <div class="poster-rating-stars">${cardMeta}</div>
            </div>
        </div>
    `;
};

function renderAlbums(albums) {
    if (!trendingGrid) return;
    trendingGrid.innerHTML = "";
    if (!albums || albums.length === 0) {
        trendingGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Nenhum álbum encontrado.</p>`;
        return;
    }
    albums.forEach(album => {
        trendingGrid.insertAdjacentHTML('beforeend', createAlbumCardHTML(album));
    });
}

function setupHeroCarousel(albums) {
    if (!albums.length) return;
    let index = 0;
    updateHeroContent(albums[0]);
    
    if (carouselInterval) clearInterval(carouselInterval);
    carouselInterval = setInterval(() => {
        index = (index + 1) % albums.length;
        updateHeroContent(albums[index]);
    }, 6000);
}

function updateHeroContent(album) {
    const imageUrl = getHighResImage(album);
    const artists = album.artists ? album.artists.map(a => a.name).join(', ') : (album.artistName || '');
    const releaseYear = album.release_date ? album.release_date.split('-')[0] : '2026';

    if (heroBackdrop) {
        heroBackdrop.style.backgroundImage = `url('${imageUrl}')`;
    }
    if (heroTitle) {
        heroTitle.innerHTML = `Destaque Atual: <span style="color: var(--accent-gold);">${album.name || album.collectionName}</span>`;
    }
    if (heroDesc) {
        if (album.synopsis) {
            heroDesc.textContent = `"${album.synopsis}" — Lançado em ${releaseYear}.`;
        } else {
            const releaseDate = album.releaseDate || album.release_date || releaseYear;
            const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
                ? new Date(`${releaseDate}T00:00:00`).toLocaleDateString("pt-BR")
                : releaseDate;
            heroDesc.textContent = `Lançado em ${dateLabel} por ${artists}. Conheça, avalie e catalogue no SoundBPM.`;
        }
    }
}

if (searchInput) {
    let timeoutId;
    searchInput.addEventListener("input", (e) => {
        clearTimeout(timeoutId);
        const query = e.target.value.trim();
        if (query.length > 1) {
            timeoutId = setTimeout(() => {
                performGlobalCatalogSearch(query);
            }, 450);
        } else if (query.length === 0) {
            performGlobalCatalogSearch("");
        }
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(timeoutId);
            performGlobalCatalogSearch(searchInput.value);
        }
    });
}



// 2. Página Detalhada do Álbum e Adicionar ao Backlog
window.openAlbumPage = async function(collectionId, albumName, artistName, coverUrl) {
    navigateTo("album-detail-page");

    document.getElementById("detail-album-title").textContent = albumName;
    document.getElementById("detail-album-artist").textContent = artistName;
    document.getElementById("detail-album-cover").src = coverUrl;

    document.getElementById("detail-review-btn").onclick = () => openReviewModal(albumName, artistName, coverUrl, collectionId);
    document.getElementById("detail-fav-btn").onclick = () => toggleFavorite(albumName, artistName, coverUrl);
    document.getElementById("detail-backlog-btn").onclick = () => addToBacklog(albumName, artistName, coverUrl);

    const tracklistContainer = document.getElementById("detail-tracklist");
    tracklistContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Carregando faixas...</p>";

    if (collectionId && collectionId !== 'undefined' && collectionId !== 'null' && collectionId !== '') {
        try {
            const { data, error } = await window.invokeSpotifySearch({ albumId: collectionId });

            if (error || !data) {
                throw new Error("Erro ao carregar faixas");
            }

            const songs = data.items || [];
            if (songs.length > 0) {
                tracklistContainer.innerHTML = songs.map((s, idx) => {
                    const totalSecs = Math.floor((s.duration_ms || 0) / 1000);
                    const mins = Math.floor(totalSecs / 60);
                    const secs = String(totalSecs % 60).padStart(2, '0');
                    const songNameSafe = (s.name || '').replace(/'/g, "\\'");
                    const songCoverSafe = (coverUrl || '').replace(/'/g, "\\'");
                    const songAlbumSafe = albumName.replace(/'/g, "\\'");
                    const previewUrlSafe = (s.preview_url || '');
                    const trackNumberSafe = Number(s.track_number) || 0;
                    const trackArtists = (s.artists || []).map(a => a.name).join(', ') || artistName;
                    const trackArtistSafe = trackArtists.replace(/'/g, "\\'");
                    return `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; padding: 0.45rem 0; border-bottom: 1px solid var(--border-subtle);">
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${idx+1}. ${s.name}</span>
                        <div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">
                            <span style="color: var(--text-muted); font-size: 0.8rem;">${mins}:${secs}</span>
                            <button class="action-icon-btn" style="width:26px; height:26px; font-size:0.75rem; line-height: 1;" title="Ouvir faixa" onclick="playMockTrack('${songNameSafe}', '${trackArtistSafe}', '${songCoverSafe}', '${previewUrlSafe}', '${songAlbumSafe}', ${trackNumberSafe})">▶</button>
                        </div>
                    </div>
                `;
                }).join('');
            } else {
                tracklistContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Nenhuma faixa encontrada.</p>";
            }
        } catch (e) {
            console.error(e);
            tracklistContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Erro ao carregar faixas.</p>";
        }
    } else {
        tracklistContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>ID do álbum inválido.</p>";
    }

    const reviewsContainer = document.getElementById("detail-community-reviews");
    if (supabase) {
        const { data: albumReviews } = await supabase
            .from('reviews')
            .select('*, profiles:user_id(username, avatar_url)')
            .eq('album_name', albumName)
            .order('created_at', { ascending: false });

        let myReview = null;
        const { data: sessData } = await supabase.auth.getSession();
        if (sessData?.session?.user && albumReviews) {
            myReview = albumReviews.find(r => r.user_id === sessData.session.user.id);
        }
        const reviewBtn = document.getElementById("detail-review-btn");
        if (reviewBtn) {
            if (myReview) {
                reviewBtn.textContent = `★ Avaliado (${myReview.rating}★)`;
                reviewBtn.onclick = () => {
                    const msg = `Você já avaliou o álbum "${albumName}" com nota ${myReview.rating}★! Cada álbum só pode ser avaliado uma vez.`;
                    if (window.gameToast) window.gameToast(msg);
                    else alert(msg);
                };
            } else {
                reviewBtn.textContent = "★ Avaliar";
                reviewBtn.onclick = () => openReviewModal(albumName, artistName, coverUrl, collectionId);
            }
        }

        if (albumReviews && albumReviews.length > 0) {
            const totalRating = albumReviews.reduce((acc, r) => acc + r.rating, 0);
            const avgRating = (totalRating / albumReviews.length).toFixed(1);
            const starsCount = "★".repeat(Math.round(avgRating)) + "☆".repeat(5 - Math.round(avgRating));
            document.getElementById("detail-album-rating-avg").innerHTML = `${starsCount} <span style="color: var(--text-main); font-weight: 600;">${avgRating}</span> <span style="color: var(--text-muted); font-size: 0.9rem;">(${albumReviews.length} resenha${albumReviews.length > 1 ? 's' : ''})</span>`;

            reviewsContainer.innerHTML = albumReviews.map(r => {
                const avatar = r.profiles?.avatar_url || "";
                const username = r.profiles?.username || "Membro";
                const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
                const date = new Date(r.created_at).toLocaleDateString('pt-BR');
                // RESOLUÇÃO DE XSS
                return `
                <div style="background: var(--bg-base); padding: 0.8rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
                    <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; cursor: pointer;" onclick="openUserProfile('${r.user_id}')">
                        ${avatarHtml(avatar, 26)}
                        <span style="font-weight: 600; font-size: 0.85rem; color: var(--accent-gold);">${username}</span>
                        <span style="margin-left: auto; color: var(--accent-orange); font-size: 0.85rem;">${stars}</span>
                    </div>
                    ${reviewBodyHtml(r.review_text, 'margin: 0; font-size: 0.85rem; font-style: italic; color: var(--text-main); white-space: pre-line;')}
                    <span style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-top: 0.3rem;">${date}</span>
                </div>`;
            }).join('');
        } else {
            document.getElementById("detail-album-rating-avg").innerHTML = `★★★★★ <span style="color: var(--text-muted); font-size: 0.9rem;">(Sem avaliações ainda)</span>`;
            reviewsContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Ainda ninguém escreveu uma resenha para este álbum. Seja o primeiro!</p>";
        }
    }
};

window.addToBacklog = async function(albumName, artistName, coverUrl) {
    if (!supabase) { alert("Supabase não inicializado."); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("Você precisa estar logado para adicionar álbuns à fila!");
        document.getElementById('login-modal').classList.add('active');
        return;
    }

    const { error } = await supabase.from('backlog').insert([
        { user_id: session.user.id, album_name: albumName, artist_name: artistName, cover_url: coverUrl }
    ]);

    if (error) {
        alert("Erro ao adicionar à fila: " + error.message);
    } else {
        alert("Álbum adicionado à Fila de Desejos com sucesso! 🎧");
    }
};



// 3. Catálogo Completo (Página de Álbuns), Busca Global e Favoritos
const albumsPageSearch = document.getElementById("albums-page-search");
const albumsPageGrid = document.getElementById("albums-page-grid");

async function loadAlbumsPageContent(query) {
    if (!albumsPageGrid) return;
    albumsPageGrid.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;'>Buscando álbuns...</p>";
    
    let data;
    if (query === "__TRENDING__") {
        data = await fetchRealTrendingAlbums();
    } else {
        data = await fetchCatalogData(query);
    }
    
    albumsPageGrid.innerHTML = "";
    if (!data || data.length === 0) {
        albumsPageGrid.innerHTML = `<p style='grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;'>Nenhum álbum encontrado para "${gameEsc(query)}". Tente outro artista ou título.</p>`;
        return;
    }
    
    data.forEach(album => {
        albumsPageGrid.insertAdjacentHTML('beforeend', createAlbumCardHTML(album));
    });
}
window.loadAlbumsPageContent = loadAlbumsPageContent;

async function performGlobalCatalogSearch(query) {
    const q = (query || "").trim();
    const albumsTitle = document.getElementById("albums-page-title");
    const albumsSubtitle = document.getElementById("albums-page-subtitle");

    // Sempre direciona o usuário para a página de catálogo
    if (window.navigateTo) {
        window.navigateTo("albums-page");
    }

    // Sincroniza os dois campos de pesquisa (cabeçalho e catálogo)
    if (searchInput && searchInput.value !== q) searchInput.value = q;
    if (albumsPageSearch && albumsPageSearch.value !== q) albumsPageSearch.value = q;

    // Rola suavemente até o topo dos resultados
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (q.length > 1) {
        if (albumsTitle) albumsTitle.textContent = `Resultados da Pesquisa: "${q}"`;
        if (albumsSubtitle) albumsSubtitle.textContent = `Álbuns e artistas encontrados no catálogo do SoundBPM.`;
        await loadAlbumsPageContent(q);
    } else {
        if (albumsTitle) albumsTitle.textContent = "Catálogo Completo";
        if (albumsSubtitle) albumsSubtitle.textContent = "Explore uma infinidade de álbuns e lançamentos do mundo todo.";
        await loadAlbumsPageContent("__TRENDING__");
    }
}
window.performGlobalCatalogSearch = performGlobalCatalogSearch;

if (albumsPageSearch) {
    let timeoutId;
    albumsPageSearch.addEventListener("input", (e) => {
        clearTimeout(timeoutId);
        const query = e.target.value.trim();
        if (query.length > 1) {
            timeoutId = setTimeout(() => {
                performGlobalCatalogSearch(query);
            }, 450);
        } else if (query.length === 0) {
            performGlobalCatalogSearch("");
        }
    });

    albumsPageSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(timeoutId);
            performGlobalCatalogSearch(albumsPageSearch.value);
        }
    });
}

window.toggleFavorite = async function(albumName, artistName, coverUrl, btnEl) {
    if (!supabase) { alert("Supabase não inicializado."); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        alert("Você precisa estar logado para favoritar álbuns!");
        document.getElementById('login-modal').classList.add('active');
        return;
    }

    const { data: existing } = await supabase.from('favorites')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('album_name', albumName)
        .maybeSingle();

    if (existing) {
        await supabase.from('favorites').delete().eq('id', existing.id);
        if (btnEl) {
            btnEl.style.color = "var(--text-main)";
            btnEl.style.background = "var(--bg-card)";
        }
        alert("Removido dos favoritos.");
    } else {
        await supabase.from('favorites').insert([
            { user_id: session.user.id, album_name: albumName, artist_name: artistName, cover_url: coverUrl }
        ]);
        if (btnEl) {
            btnEl.style.color = "var(--accent-gold)";
            btnEl.style.background = "rgba(223, 177, 91, 0.2)";
        }
        alert("Adicionado aos favoritos com sucesso!");
    }
    if (typeof loadUserProfile === 'function') loadUserProfile();
};
  


// 4. Carregamento e Gerenciamento do Backlog

window.loadDashboardBacklog = async function() {
    const backlogContainer = document.getElementById("dashboard-backlog-list");
    if (!backlogContainer || !supabase) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        backlogContainer.innerHTML = "<p style='color: var(--text-muted);'>Faça login para ver sua fila de desejos.</p>";
        return;
    }

    const { data: backlogItems, error } = await supabase
        .from('backlog')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Erro ao carregar backlog:", error);
        backlogContainer.innerHTML = "<p style='color: var(--text-muted);'>Erro ao carregar sua fila.</p>";
        return;
    }

    if (backlogItems && backlogItems.length > 0) {
        backlogContainer.innerHTML = backlogItems.map(item => {
            const safeName = (item.album_name || '').replace(/'/g, "\\'");
            const safeArtist = (item.artist_name || '').replace(/'/g, "\\'");
            const safeCover = (item.cover_url || '').replace(/'/g, "\\'");
            return `
            <div class="backlog-item" style="background: var(--bg-card); padding: 1rem; border-radius: 8px; display: flex; align-items: center; gap: 1.5rem; border: 1px solid rgba(255,255,255,0.05); cursor: pointer;" onclick="openAlbumPage('', '${safeName}', '${safeArtist}', '${safeCover}')">
                <img src="${item.cover_url || 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=100&h=100&fit=crop'}" style="width: 70px; height: 70px; border-radius: 6px; object-fit: cover;">
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-main);">${item.album_name}</h4>
                    <span style="color: var(--text-muted); font-size: 0.9rem;">${item.artist_name}</span>
                </div>
                <div style="display: flex; gap: 0.75rem;">
                    <button onclick="event.stopPropagation(); removeFromBacklog('${item.id}')" class="btn-secondary-dark" style="padding: 0.5rem 1rem; font-size: 0.85rem; cursor: pointer; background: transparent; border: 1px solid var(--text-muted); color: var(--text-muted); border-radius: 4px;">Remover</button>
                </div>
            </div>
        `;
        }).join('');
    } else {
        backlogContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; background: var(--bg-card); border-radius: 8px;">
                <p style="color: var(--text-muted); margin-bottom: 1rem;">Sua fila de desejos está vazia.</p>
                <a href="#explore" onclick="navigateTo('home')" style="color: var(--accent-orange); text-decoration: none; font-weight: 600;">Explorar álbuns para adicionar &rarr;</a>
            </div>`;
    }
};

window.removeFromBacklog = async function(id) {
    if (!supabase) return;
    const { error } = await supabase.from('backlog').delete().eq('id', id);
    if (!error) {
        loadDashboardBacklog();
    } else {
        alert("Erro ao remover item da fila.");
    }
};

const randomAlbumSeeds = [
    { album: "Clube da Esquina", artist: "Milton Nascimento", query: "Clube da Esquina Milton Nascimento Lô Borges", note: "Um disco brasileiro expansivo, cheio de encontros entre MPB, rock e música latino-americana." },
    { album: "Acabou Chorare", artist: "Novos Baianos", query: "Acabou Chorare Novos Baianos", note: "Samba, violão e psicodelia se encontram em um dos grandes discos coletivos da música brasileira." },
    { album: "Sobrevivendo no Inferno", artist: "Racionais MC's", query: "Sobrevivendo no Inferno Racionais MCs", note: "Um retrato poderoso da vida nas periferias de São Paulo, contado com precisão e urgência." },
    { album: "A Tábua de Esmeralda", artist: "Jorge Ben Jor", query: "A Tábua de Esmeralda Jorge Ben Jor", note: "Samba-rock, alquimia e balanço em uma das obras mais singulares de Jorge Ben." },
    { album: "Elis & Tom", artist: "Elis Regina", query: "Elis e Tom Elis Regina Antonio Carlos Jobim", note: "A voz de Elis Regina encontra as canções e os arranjos delicados de Tom Jobim." },
    { album: "Construção", artist: "Chico Buarque", query: "Construção Chico Buarque", note: "Canções de arquitetura impecável que observam o cotidiano e as tensões do Brasil urbano." },
    { album: "Transa", artist: "Caetano Veloso", query: "Transa Caetano Veloso", note: "Um álbum gravado no exílio, com mistura inventiva de rock, MPB e canções em inglês." },
    { album: "Bom Mesmo É Estar Debaixo D'Água", artist: "Luedji Luna", query: "Bom Mesmo É Estar Debaixo D'Água Luedji Luna", note: "Neo-soul e jazz em canções íntimas sobre afeto, identidade e pertencimento." },
    { album: "CAJU", artist: "Liniker", query: "CAJU Liniker", note: "Um álbum amplo e cheio de cor, com soul, pop e a voz marcante de Liniker." },
    { album: "Abbey Road", artist: "The Beatles", query: "Abbey Road The Beatles", note: "Um lado final em forma de medley e algumas das gravações mais reconhecíveis dos Beatles." },
    { album: "Rumours", artist: "Fleetwood Mac", query: "Rumours Fleetwood Mac", note: "Harmonias pop perfeitas e histórias de relacionamentos em transformação." },
    { album: "OK Computer", artist: "Radiohead", query: "OK Computer Radiohead", note: "Rock alternativo inquieto que transforma alienação e tecnologia em paisagens sonoras." },
    { album: "Discovery", artist: "Daft Punk", query: "Discovery Daft Punk", note: "French house, disco e samples luminosos em uma viagem eletrônica irresistível." },
    { album: "Back to Black", artist: "Amy Winehouse", query: "Back to Black Amy Winehouse", note: "Soul retrô, letras confessionais e interpretações que ficam na memória." },
    { album: "good kid, m.A.A.d city", artist: "Kendrick Lamar", query: "good kid m.A.A.d city Kendrick Lamar", note: "Uma narrativa de amadurecimento em Compton, construída como um filme em forma de álbum." },
    { album: "Blonde", artist: "Frank Ocean", query: "Blonde Frank Ocean", note: "R&B minimalista e fragmentos de memória em uma escuta íntima e atmosférica." },
    { album: "Lemonade", artist: "Beyoncé", query: "Lemonade Beyoncé", note: "Uma sequência de estilos e emoções que transforma experiência pessoal em declaração artística." },
    { album: "The Miseducation of Lauryn Hill", artist: "Lauryn Hill", query: "The Miseducation of Lauryn Hill", note: "Hip-hop e soul em canções sobre amor, crescimento e autonomia." },
    { album: "Songs in the Key of Life", artist: "Stevie Wonder", query: "Songs in the Key of Life Stevie Wonder", note: "Uma celebração generosa de soul, funk e pop, repleta de melodias inesquecíveis." },
    { album: "Voodoo", artist: "D'Angelo", query: "Voodoo D'Angelo", note: "Grooves profundos e soul moderno que recompensa uma audição sem pressa." }
];

let lastRandomAlbumKey = "";
let currentRandomAlbum = null;
const randomAlbumButton = document.getElementById("recommend-random-album");
const randomAlbumResult = document.getElementById("random-album-result");

function normalizeRandomAlbumText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function recommendRandomAlbum() {
    if (!supabase || !randomAlbumButton || !randomAlbumResult) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        gameToast ? gameToast("Entre na sua conta para receber e salvar uma recomendação.") : alert("Entre na sua conta para receber e salvar uma recomendação.");
        document.getElementById("login-modal")?.classList.add("active");
        return;
    }

    randomAlbumButton.disabled = true;
    randomAlbumButton.textContent = "Procurando um álbum...";
    randomAlbumResult.innerHTML = `<div class="random-album-placeholder"><span class="random-album-spinner">♫</span><p>Escolhendo sua próxima escuta...</p></div>`;

    const { data: backlog, error: backlogError } = await supabase
        .from("backlog").select("album_name").eq("user_id", session.user.id);
    if (backlogError) {
        console.error("Não foi possível consultar a fila antes da recomendação:", backlogError);
        randomAlbumResult.innerHTML = `<div class="random-album-placeholder"><p>Não consegui consultar sua fila agora. Tente novamente.</p></div>`;
        randomAlbumButton.disabled = false;
        randomAlbumButton.textContent = "Tentar novamente";
        return;
    }

    const queuedAlbums = new Set((backlog || []).map(item => normalizeRandomAlbumText(item.album_name)));
    const availableSeeds = randomAlbumSeeds.filter(seed => !queuedAlbums.has(normalizeRandomAlbumText(seed.album)));
    const candidates = availableSeeds
        .filter(seed => seed.album !== lastRandomAlbumKey)
        .sort(() => Math.random() - 0.5);
    if (!candidates.length && availableSeeds.length) {
        candidates.push(...availableSeeds.sort(() => Math.random() - 0.5));
    }

    for (const seed of candidates.slice(0, 5)) {
        const results = await fetchCatalogData(seed.query);
        const wantedTitle = normalizeRandomAlbumText(seed.album);
        const wantedArtist = normalizeRandomAlbumText(seed.artist.split(",")[0]);
        const exact = results.find(album => normalizeRandomAlbumText(album.name) === wantedTitle && normalizeRandomAlbumText(album.artistName).includes(wantedArtist));
        const close = results.find(album => normalizeRandomAlbumText(album.name).includes(wantedTitle) && normalizeRandomAlbumText(album.artistName).includes(wantedArtist));
        const album = exact || close;
        if (!album) continue;

        currentRandomAlbum = { ...album, recommendationNote: seed.note };
        lastRandomAlbumKey = seed.album;
        const safeName = gameEsc(album.name || album.collectionName || seed.album);
        const safeArtist = gameEsc(album.artistName || seed.artist);
        const safeCover = gameEsc(getHighResImage(album));
        randomAlbumResult.innerHTML = `
            <article class="random-album-card">
                <img class="random-album-cover" src="${safeCover}" alt="Capa de ${safeName}" loading="lazy">
                <div class="random-album-info">
                    <span class="random-album-label">SUGESTÃO ALEATÓRIA</span>
                    <h4>${safeName}</h4>
                    <p class="random-album-artist">${safeArtist}</p>
                    <p class="random-album-note">${gameEsc(seed.note)}</p>
                    <div class="random-album-actions">
                        <button type="button" class="btn-secondary-dark" data-random-action="preview">▶ Ouvir prévia</button>
                        <button type="button" class="btn-primary-gold" data-random-action="add">＋ Adicionar à fila</button>
                    </div>
                </div>
            </article>`;
        randomAlbumButton.textContent = "🎲 Me recomenda outro";
        randomAlbumButton.disabled = false;
        return;
    }

    currentRandomAlbum = null;
    if (!candidates.length) {
        randomAlbumResult.innerHTML = `<div class="random-album-placeholder"><span>✓</span><p>Essas sugestões já estão na sua fila. Explore o catálogo para encontrar mais álbuns.</p></div>`;
        randomAlbumButton.textContent = "Sugestões já adicionadas";
        randomAlbumButton.disabled = true;
    } else {
        randomAlbumResult.innerHTML = `<div class="random-album-placeholder"><p>Não encontrei uma sugestão agora. Tente de novo em instantes.</p></div>`;
        randomAlbumButton.textContent = "Tentar novamente";
    }
    randomAlbumButton.disabled = false;
}

if (randomAlbumButton) randomAlbumButton.addEventListener("click", recommendRandomAlbum);
if (randomAlbumResult) randomAlbumResult.addEventListener("click", async event => {
    const button = event.target.closest("[data-random-action]");
    if (!button || !currentRandomAlbum) return;
    if (button.dataset.randomAction === "preview") {
        if (window.playAlbumPreview) window.playAlbumPreview(currentRandomAlbum.collectionId || currentRandomAlbum.id, currentRandomAlbum.name, currentRandomAlbum.artistName, getHighResImage(currentRandomAlbum));
        return;
    }
    if (button.dataset.randomAction !== "add") return;

    button.disabled = true;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        button.disabled = false;
        document.getElementById("login-modal")?.classList.add("active");
        return;
    }
    const albumName = currentRandomAlbum.name || currentRandomAlbum.collectionName;
    const artistName = currentRandomAlbum.artistName || "Artista desconhecido";
    const { data: existing, error: lookupError } = await supabase.from("backlog")
        .select("id").eq("user_id", session.user.id).eq("album_name", albumName).limit(1).maybeSingle();
    if (lookupError) {
        button.disabled = false;
        gameToast ? gameToast("Não consegui verificar sua fila. Tente novamente.") : alert("Não consegui verificar sua fila. Tente novamente.");
        return;
    }
    if (existing) {
        button.textContent = "✓ Já está na sua fila";
        gameToast ? gameToast("Esse álbum já está na sua fila.") : alert("Esse álbum já está na sua fila.");
        return;
    }

    const { error } = await supabase.from("backlog").insert([{
        user_id: session.user.id,
        album_name: albumName,
        artist_name: artistName,
        cover_url: getHighResImage(currentRandomAlbum)
    }]);
    if (error) {
        console.error("Erro ao adicionar recomendação à fila:", error);
        button.disabled = false;
        gameToast ? gameToast("Não foi possível adicionar o álbum à fila.") : alert("Não foi possível adicionar o álbum à fila.");
        return;
    }
    button.textContent = "✓ Adicionado à fila";
    gameToast ? gameToast("Álbum adicionado à sua fila de desejos.") : alert("Álbum adicionado à sua fila de desejos.");
    window.loadDashboardBacklog();
});


