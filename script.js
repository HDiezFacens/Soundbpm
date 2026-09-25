document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("login-modal");
    const openLoginBtn = document.getElementById("open-login-modal");
    const closeLoginBtn = document.querySelector(".close-modal");

    if (openLoginBtn && modal) {
        openLoginBtn.addEventListener("click", () => modal.classList.add("active"));
        closeLoginBtn.addEventListener("click", () => modal.classList.remove("active"));
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.classList.remove("active");
        });
    }

    const SPOTIFY_CLIENT_ID = "17faef55f3dd41ce94e8b27d82addf1c";
    const REDIRECT_URI = window.location.origin;
    // Adicionadas permissões avançadas (scopes) para histórico, recomendações, biblioteca e player
    const SCOPES = "user-read-private user-read-email user-read-recently-played user-top-read user-library-read playlist-modify-public streaming";

    function generateRandomString(length) {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    async function generateCodeChallenge(codeVerifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    const spotifyLoginBtn = document.getElementById("spotify-login-btn");
    if (spotifyLoginBtn) {
        spotifyLoginBtn.addEventListener("click", async () => {
            const codeVerifier = generateRandomString(64);
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            localStorage.setItem('code_verifier', codeVerifier);

            const authUrl = new URL("https://accounts.spotify.com/authorize");
            const params = {
                response_type: 'code',
                client_id: SPOTIFY_CLIENT_ID,
                scope: SCOPES,
                code_challenge_method: 'S256',
                code_challenge: codeChallenge,
                redirect_uri: REDIRECT_URI,
            };
            authUrl.search = new URLSearchParams(params).toString();
            window.location.href = authUrl.toString();
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        const codeVerifier = localStorage.getItem('code_verifier');
        
        fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: SPOTIFY_CLIENT_ID,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
                code_verifier: codeVerifier,
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.access_token) {
                localStorage.setItem('spotify_access_token', data.access_token);
                window.history.replaceState({}, document.title, REDIRECT_URI);
                updateLoginButtonState();
                showDashboardUI();
                populateDashboard();
            } else {
                console.error("Erro ao obter o token:", data);
            }
        })
        .catch(error => console.error("Erro na requisição do token:", error));
    }

    // Atualiza botão de login se já estiver logado (visual)
    function updateLoginButtonState() {
        let token = localStorage.getItem("spotify_access_token");
        if (token && openLoginBtn) {
            openLoginBtn.textContent = "Conectado";
            openLoginBtn.style.borderColor = "var(--accent-gold)";
            openLoginBtn.style.color = "var(--accent-gold)";
        }
    }

    updateLoginButtonState();

    const trendingGrid = document.getElementById("trending-albums-grid");
    const sectionMainTitle = document.getElementById("section-main-title");
    const sectionMainSubtitle = document.getElementById("section-main-subtitle");
    const heroBackdrop = document.getElementById("hero-backdrop");
    const heroTitle = document.getElementById("hero-title");
    const heroDesc = document.getElementById("hero-desc");
    const searchInput = document.getElementById("search-input");
    let carouselInterval;

    async function fetchCatalogData(query) {
        try {
            const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=12`);
            if (!response.ok) throw new Error("Erro na API do iTunes");
            const data = await response.json();
            
            // Mapeia os dados do iTunes para o formato que as funções de renderização esperam
            return data.results.map(item => ({
                name: item.collectionName,
                artists: [{ name: item.artistName }],
                images: [{ url: item.artworkUrl100.replace('100x100bb', '600x600bb') }], // Pega imagem em alta resolução
                release_date: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'Desconhecido'
            }));
        } catch (error) {
            console.error("Erro ao buscar dados do catálogo:", error);
            return [];
        }
    }

    async function loadPopularContent() {
        if (sectionMainTitle) sectionMainTitle.textContent = "Álbuns Populares & Destaques";
        if (sectionMainSubtitle) sectionMainSubtitle.textContent = "Os principais álbuns catalogados para você ouvir e avaliar.";

        const albums = await fetchCatalogData("pop");
        
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

    function renderAlbums(albums) {
        if (!trendingGrid) return;
        trendingGrid.innerHTML = "";
        if (!albums || albums.length === 0) {
            trendingGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Nenhum álbum encontrado.</p>`;
            return;
        }
        albums.forEach(album => {
            const imageUrl = album.images && album.images[0] ? album.images[0].url : '';
            const artists = album.artists.map(a => a.name).join(', ');
            const card = document.createElement("div");
            card.className = "poster-card";
            card.innerHTML = `
                <div class="poster-image-wrap">
                    <img src="${imageUrl}" alt="${album.name}">
                    <div class="poster-overlay-actions">
                        <button class="action-icon-btn" title="Avaliar">★</button>
                        <button class="action-icon-btn" title="Adicionar à Lista">＋</button>
                    </div>
                </div>
                <div class="poster-info">
                    <h3>${album.name}</h3>
                    <span class="poster-artist">${artists}</span>
                    <div class="poster-rating-stars">★★★★★ <span class="numeric-score">${(Math.random() * 0.4 + 4.6).toFixed(1)}</span></div>
                </div>
            `;
            trendingGrid.appendChild(card);
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
        const imageUrl = album.images && album.images[0] ? album.images[0].url : '';
        const artists = album.artists.map(a => a.name).join(', ');
        if (heroBackdrop) {
            heroBackdrop.style.backgroundImage = `url('${imageUrl}')`;
        }
        if (heroTitle) {
            heroTitle.innerHTML = `Destaque Atual: <span style="color: var(--accent-gold);">${album.name}</span>`;
        }
        if (heroDesc) {
            heroDesc.textContent = `Ouça o álbum de ${artists}. Lançado em ${album.release_date}. Avalie e catalogue no SoundBPM.`;
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
                }, 400);
            } else if (query.length <= 2) {
                loadPopularContent();
            }
        });
    }

    loadPopularContent();

    // Lógica do Dashboard e Simulação
    const simulateBtn = document.getElementById("simulate-login-btn");
    const navDashboardItem = document.getElementById("nav-dashboard-item");
    const dashboardSection = document.getElementById("dashboard");
    const exploreSection = document.getElementById("explore");
    const webPlayer = document.getElementById("web-player");
    
    function showDashboardUI() {
        if (navDashboardItem) navDashboardItem.style.display = "inline-block";
        if (exploreSection) exploreSection.style.display = "none";
        if (dashboardSection) dashboardSection.style.display = "block";
        if (webPlayer) webPlayer.classList.remove("hidden");
    }

    async function fetchFromSpotify(endpoint) {
        const token = localStorage.getItem("spotify_access_token");
        if (!token || token === "simulated_token") return null;
        try {
            const response = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Erro Spotify: " + response.status);
            return await response.json();
        } catch (error) {
            console.error("Erro ao buscar dados reais do Spotify:", error);
            return null;
        }
    }

    async function populateDashboard() {
        const scrobblesContainer = document.getElementById("recent-scrobbles");
        const recsContainer = document.getElementById("personal-recs");
        const token = localStorage.getItem("spotify_access_token");
        
        const loggedOutView = document.getElementById("dashboard-logged-out");
        const loggedInView = document.getElementById("dashboard-logged-in");

        if (!token) {
            if (loggedOutView) loggedOutView.style.display = "block";
            if (loggedInView) loggedInView.style.display = "none";
            return;
        } else {
            if (loggedOutView) loggedOutView.style.display = "none";
            if (loggedInView) loggedInView.style.display = "block";
        }

        if (scrobblesContainer) scrobblesContainer.innerHTML = "<p>Carregando...</p>";
        if (recsContainer) recsContainer.innerHTML = "<p>Carregando...</p>";
        
        if (token && token !== "simulated_token") {
            // DADOS REAIS DO SPOTIFY
            const recentData = await fetchFromSpotify("me/player/recently-played?limit=5");
            const topData = await fetchFromSpotify("me/top/tracks?limit=5");
            
            if (recentData && recentData.items && scrobblesContainer) {
                scrobblesContainer.innerHTML = recentData.items.map(item => {
                    const track = item.track;
                    const imageUrl = track.album.images[0] ? track.album.images[0].url : 'logo.png';
                    const trackName = track.name.replace(/'/g, "\\'");
                    const artistName = track.artists[0].name.replace(/'/g, "\\'");
                    return `
                    <div class="dash-item" onclick="playMockTrack('${trackName}', '${artistName}', '${imageUrl}')">
                        <img src="${imageUrl}" alt="${track.name}">
                        <div class="dash-item-info">
                            <h4>${track.name}</h4>
                            <p>${track.artists[0].name}</p>
                        </div>
                    </div>`;
                }).join('');
            } else if (scrobblesContainer) {
                scrobblesContainer.innerHTML = "<p style='color: var(--text-muted);'>Nenhum histórico recente encontrado no seu Spotify.</p>";
            }

            if (topData && topData.items && recsContainer) {
                recsContainer.innerHTML = topData.items.map(track => {
                    const imageUrl = track.album.images[0] ? track.album.images[0].url : 'logo.png';
                    const trackName = track.name.replace(/'/g, "\\'");
                    const artistName = track.artists[0].name.replace(/'/g, "\\'");
                    return `
                    <div class="dash-item" onclick="playMockTrack('${trackName}', '${artistName}', '${imageUrl}')">
                        <img src="${imageUrl}" alt="${track.name}">
                        <div class="dash-item-info">
                            <h4>${track.name}</h4>
                            <p>${track.artists[0].name}</p>
                        </div>
                    </div>`;
                }).join('');
            } else if (recsContainer) {
                recsContainer.innerHTML = "<p style='color: var(--text-muted);'>Sem dados suficientes para recomendações.</p>";
            }

        } else {
            // DADOS SIMULADOS (ITUNES)
            const scrobblesData = await fetchCatalogData("lofi");
            const recsData = await fetchCatalogData("indie");
            
            if (scrobblesContainer && scrobblesData.length) {
                scrobblesContainer.innerHTML = scrobblesData.slice(0, 3).map(album => `
                    <div class="dash-item" onclick="playMockTrack('${album.name.replace(/'/g, "\\'")}', '${album.artists[0].name.replace(/'/g, "\\'")}', '${album.images[0].url}')">
                        <img src="${album.images[0].url}" alt="${album.name}">
                        <div class="dash-item-info">
                            <h4>${album.name}</h4>
                            <p>${album.artists[0].name}</p>
                        </div>
                    </div>
                `).join('');
            }
            
            if (recsContainer && recsData.length) {
                recsContainer.innerHTML = recsData.slice(0, 3).map(album => `
                    <div class="dash-item" onclick="playMockTrack('${album.name.replace(/'/g, "\\'")}', '${album.artists[0].name.replace(/'/g, "\\'")}', '${album.images[0].url}')">
                        <img src="${album.images[0].url}" alt="${album.name}">
                        <div class="dash-item-info">
                            <h4>${album.name}</h4>
                            <p>${album.artists[0].name}</p>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // Toca faixa simulada no Web Player
    window.playMockTrack = function(track, artist, image) {
        const playerTrack = document.getElementById("player-track");
        const playerArtist = document.getElementById("player-artist");
        const playerImg = document.getElementById("player-img");
        
        if (playerTrack) playerTrack.textContent = track;
        if (playerArtist) playerArtist.textContent = artist;
        if (playerImg) playerImg.src = image;
    };
    
    // Vincula evento de clique no Menu de Navegação para o Painel
    const dashLink = document.getElementById("nav-dashboard-link");
    if (dashLink) {
        dashLink.addEventListener("click", (e) => {
            showDashboardUI();
            populateDashboard();
        });
    }

    // Se o usuário já tiver um token (simulado ou real) e recarregou a página, 
    // podemos mostrar o painel diretamente se desejado (descomentar)
    let currentToken = localStorage.getItem("spotify_access_token");
    if (currentToken) {
        // showDashboardUI();
        // populateDashboard();
    }
});