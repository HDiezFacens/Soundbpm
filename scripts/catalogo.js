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

        const { data, error } = await supabase.functions.invoke('spotify-search', {
            body: { query }
        });

        if (error || !data || !data.albums || !data.albums.items || data.albums.items.length === 0) {
            console.warn("Spotify indisponível ou sem resultados. Alternando para o iTunes...");
            const iTunesResults = await fetchCatalogDataFromITunes(query);
            searchCache.set(query, iTunesResults);
            return iTunesResults;
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
        renderAlbums(albums);
        setupHeroCarousel(albums.slice(0, 5));
    } else {
        if (trendingGrid) {
            trendingGrid.innerHTML = `
                <p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Não foi possível carregar os álbuns no momento.</p>
            `;
        }
    }
}

window.createAlbumCardHTML = function(album) {
    const imageUrl = getHighResImage(album);
    const artistName = album.artists ? album.artists.map(a => a.name).join(', ') : (album.artistName || 'Artista Desconhecido');
    const albumName = album.name || album.collectionName || 'Álbum';
    const collectionId = album.collectionId || album.id || '';
    
    const safeName = albumName.replace(/'/g, "\\'");
    const safeArtist = artistName.replace(/'/g, "\\'");
    const safeImage = imageUrl.replace(/'/g, "\\'");

    return `
        <div class="poster-card" data-collection-id="${collectionId}">
            <div class="poster-image-wrap" onclick="openAlbumPage('${collectionId}', '${safeName}', '${safeArtist}', '${safeImage}')" style="cursor: pointer;">
                <img src="${imageUrl}" alt="${albumName}">
                <div class="poster-overlay-actions" onclick="event.stopPropagation()">
                    <button class="action-icon-btn" title="Avaliar Álbum" onclick="openReviewModal('${safeName}', '${safeArtist}', '${safeImage}', '${collectionId}')">★</button>
                    <button class="action-icon-btn btn-fav-action" title="Favoritar" onclick="toggleFavorite('${safeName}', '${safeArtist}', '${safeImage}', this)">♥</button>
                    <button class="action-icon-btn" title="Adicionar à Fila de Desejos" onclick="addToBacklog('${safeName}', '${safeArtist}', '${safeImage}')">＋</button>
                    <button class="action-icon-btn" title="Tocar" onclick="playMockTrack('${safeName}', '${safeArtist}', '${safeImage}')">▶</button>
                </div>
            </div>
            <div class="poster-info" onclick="openAlbumPage('${collectionId}', '${safeName}', '${safeArtist}', '${safeImage}')" style="cursor: pointer;">
                <h3>${albumName}</h3>
                <span class="poster-artist">${artistName}</span>
                <div class="poster-rating-stars">★★★★★ <span class="numeric-score">${(Math.random() * 0.4 + 4.6).toFixed(1)}</span></div>
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
            heroDesc.textContent = `Ouça o álbum de ${artists}. Lançado em ${releaseYear}. Avalie e catalogue no SoundBPM.`;
        }
    }
}

if (searchInput) {
    let timeoutId;
    searchInput.addEventListener("input", (e) => {
        clearTimeout(timeoutId);
        const query = e.target.value.trim();
        
        if (query.length > 2) {
            timeoutId = setTimeout(async () => {
                if (sectionMainTitle) sectionMainTitle.textContent = `Resultados da Pesquisa: "${query}"`;
                if (sectionMainSubtitle) sectionMainSubtitle.textContent = `Álbuns encontrados no catálogo.`;

                const albums = await fetchCatalogData(query);
                renderAlbums(albums);
            }, 500);
        } else if (query.length <= 2) {
            loadPopularContent();
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
            const { data, error } = await supabase.functions.invoke('spotify-search', {
                body: { albumId: collectionId }
            });

            if (error || !data) {
                throw new Error("Erro ao carregar faixas");
            }

            const songs = data.items || [];
            if (songs.length > 0) {
                tracklistContainer.innerHTML = songs.map((s, idx) => {
                    const totalSecs = Math.floor((s.duration_ms || 0) / 1000);
                    const mins = Math.floor(totalSecs / 60);
                    const secs = String(totalSecs % 60).padStart(2, '0');
                    return `
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border-subtle);">
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${idx+1}. ${s.name}</span>
                        <span style="color: var(--text-muted);">${mins}:${secs}</span>
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



// 3. Catálogo Completo (Página de Álbuns) e Favoritos
const albumsPageSearch = document.getElementById("albums-page-search");
const albumsPageGrid = document.getElementById("albums-page-grid");

async function loadAlbumsPageContent(query) {
    if (!albumsPageGrid) return;
    albumsPageGrid.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: var(--text-muted);'>Carregando...</p>";
    
    let data;
    if (query === "__TRENDING__") {
        data = await fetchRealTrendingAlbums();
    } else {
        data = await fetchCatalogData(query);
    }
    
    albumsPageGrid.innerHTML = "";
    if (!data || data.length === 0) {
        albumsPageGrid.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: var(--text-muted);'>Nenhum álbum encontrado.</p>";
        return;
    }
    
    data.forEach(album => {
        albumsPageGrid.insertAdjacentHTML('beforeend', createAlbumCardHTML(album));
    });
}
window.loadAlbumsPageContent = loadAlbumsPageContent;

if (albumsPageSearch) {
    let timeoutId;
    albumsPageSearch.addEventListener("input", (e) => {
        clearTimeout(timeoutId);
        const query = e.target.value.trim();
        if (query.length > 2) {
            timeoutId = setTimeout(() => {
                loadAlbumsPageContent(query);
            }, 500);
        } else if (query.length === 0) {
            loadAlbumsPageContent("__TRENDING__");
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


