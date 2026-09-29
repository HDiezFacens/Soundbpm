document.addEventListener("DOMContentLoaded", () => {
    const SUPABASE_URL = "https://mfpjuyqcieqtcdbkvgwu.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_0yXhFfS--QMrzTIJATHvUA_wfealgxV";
    
    let supabase = null;
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error("SDK do Supabase não carregado corretamente.");
    }

    const SPOTIFY_CLIENT_ID = "17faef55f3dd41ce94e8b27d82addf1c";
    const REDIRECT_URI = window.location.href.split('?')[0].replace(/#.*$/, '');
    const SCOPES = "user-read-private user-read-email user-read-recently-played user-top-read user-library-read playlist-modify-public streaming";

    const tabLoginBtn = document.getElementById("tab-login-btn");
    const tabRegisterBtn = document.getElementById("tab-register-btn");
    const usernameFieldWrap = document.getElementById("username-field-wrap");
    const authSubmitBtn = document.getElementById("auth-submit-btn");
    const authForm = document.getElementById("auth-form");
    let isRegisterMode = false;

    if (tabLoginBtn && tabRegisterBtn) {
        tabLoginBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isRegisterMode = false;
            tabLoginBtn.style.color = "var(--accent-gold)";
            tabLoginBtn.style.fontWeight = "700";
            tabRegisterBtn.style.color = "var(--text-muted)";
            tabRegisterBtn.style.fontWeight = "600";
            if (usernameFieldWrap) usernameFieldWrap.style.display = "none";
            if (authSubmitBtn) authSubmitBtn.textContent = "Entrar na Conta";
        });

        tabRegisterBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isRegisterMode = true;
            tabRegisterBtn.style.color = "var(--accent-gold)";
            tabRegisterBtn.style.fontWeight = "700";
            tabLoginBtn.style.color = "var(--text-muted)";
            tabLoginBtn.style.fontWeight = "600";
            if (usernameFieldWrap) usernameFieldWrap.style.display = "block";
            if (authSubmitBtn) authSubmitBtn.textContent = "Criar Conta Gratuita";
        });
    }

    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!supabase) {
                alert("Supabase não inicializado.");
                return;
            }

            const email = document.getElementById("auth-email").value;
            const password = document.getElementById("auth-password").value;
            const usernameField = document.getElementById("auth-username");
            const avatarField = document.getElementById("auth-avatar");
            
            const username = usernameField && usernameField.value ? usernameField.value : "Mófilo";
            const avatar = avatarField && avatarField.value ? avatarField.value : "";

            if (isRegisterMode) {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            username: username,
                            avatar: avatar
                        }
                    }
                });

                if (error) {
                    alert("Erro ao criar conta: " + error.message);
                    return;
                }
                
                alert("Conta criada com sucesso! Verifique sua sessão.");
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    alert("Erro ao entrar: " + error.message);
                    return;
                }

                alert("Login efetuado com sucesso!");
            }

            if (modal) modal.classList.remove("active");
            checkSupabaseSession();
            navigateTo('dashboard');
            populateDashboard();
        });
    }

    const modal = document.getElementById("login-modal");
    const openLoginBtn = document.getElementById("open-login-modal");
    const closeLoginBtn = document.querySelector(".close-modal");

    if (openLoginBtn && modal) {
        openLoginBtn.addEventListener("click", async () => {
            const localUser = localStorage.getItem("soundbpm_user");
            const spotifyToken = localStorage.getItem("spotify_access_token");

            if (localUser || spotifyToken) {
                if (confirm("Deseja encerrar a sessão da sua conta?")) {
                    if (supabase) await supabase.auth.signOut();
                    localStorage.removeItem("soundbpm_user");
                    localStorage.removeItem("spotify_access_token");
                    resetLoginButtonState();
                    window.location.reload();
                }
            } else {
                modal.classList.add("active");
            }
        });
        
        if (closeLoginBtn) {
            closeLoginBtn.addEventListener("click", () => modal.classList.remove("active"));
        }
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.classList.remove("active");
        });
    }

    function updateLoginButtonState() {
        if (openLoginBtn) {
            const localUser = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
            const displayName = localUser.username || "Meu Perfil";
            const avatarUrl = localUser.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces";

            openLoginBtn.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.6rem; background: transparent; border: none; padding: 0;">
                    <img src="${avatarUrl}" alt="Avatar" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--accent-gold);">
                    <span style="font-weight: 600; color: var(--text-main);">${displayName}</span>
                </div>
            `;
            openLoginBtn.style.borderColor = "var(--accent-gold)";
            openLoginBtn.style.background = "var(--bg-card)";
            openLoginBtn.style.padding = "0.3rem 0.8rem";
            openLoginBtn.style.borderRadius = "20px";
        }
    }

    function resetLoginButtonState() {
        if (openLoginBtn) {
            openLoginBtn.textContent = "Entrar";
            openLoginBtn.style.borderColor = "";
            openLoginBtn.style.color = "";
        }
    }

    async function checkSupabaseSession() {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        const spotifyToken = localStorage.getItem("spotify_access_token");

        if (session || spotifyToken === "simulated_token") {
            if (session) {
                const userMeta = session.user.user_metadata;
                localStorage.setItem("soundbpm_user", JSON.stringify({
                    email: session.user.email,
                    username: userMeta.username || "Mófilo",
                    avatar: userMeta.avatar || ""
                }));
            }
            updateLoginButtonState();
        } else {
            resetLoginButtonState();
        }
    }

    checkSupabaseSession();

    const simulateBtn = document.getElementById("simulate-login-btn");
    const webPlayer = document.getElementById("web-player");
    if (simulateBtn) {
        simulateBtn.addEventListener("click", () => {
            localStorage.setItem("spotify_access_token", "simulated_token");
            if (modal) modal.classList.remove("active");
            updateLoginButtonState();
            navigateTo('dashboard');
            populateDashboard();
            if (webPlayer) webPlayer.classList.remove("hidden");
        });
    }

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
                navigateTo('dashboard');
                populateDashboard();
            } else {
                console.error("Erro ao obter o token:", data);
            }
        })
        .catch(error => console.error("Erro na requisição do token:", error));
    }

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
            
            return data.results.map(item => ({
                name: item.collectionName,
                artists: [{ name: item.artistName }],
                images: [{ url: item.artworkUrl100.replace('100x100bb', '600x600bb') }],
                release_date: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'Desconhecido'
            }));
        } catch (error) {
            console.error("Erro ao buscar dados do catálogo:", error);
            return [];
        }
    }

    async function fetchRealTrendingAlbums() {
        const letterboxdCore = [
            { query: "blonde frank ocean", synopsis: "Uma obra-prima atmosférica e introspectiva que redefiniu o R&B contemporâneo com sua vulnerabilidade." },
            { query: "to pimp a butterfly kendrick", synopsis: "Um épico denso de jazz-rap que explora de forma brilhante a cultura afro-americana e o peso da fama." },
            { query: "igor tyler the creator", synopsis: "Uma jornada caótica e genial sobre desilusão amorosa, misturando neo-soul, rap e sintetizadores." },
            { query: "brat charli xcx", synopsis: "Um mergulho frenético e hiperativo na cultura clubber, recheado de vulnerabilidade e batidas ácidas." },
            { query: "ok computer radiohead", synopsis: "O marco do rock alternativo que previu a alienação e a ansiedade da era digital." },
            { query: "in rainbows radiohead", synopsis: "Quente, melancólico e ritmicamente complexo, um dos registros mais intimistas da banda." },
            { query: "the dark side of the moon", synopsis: "Uma experiência sonora transcendental sobre o tempo, a loucura e a condição humana." },
            { query: "currents tame impala", synopsis: "Uma viagem psicodélica e dançante sobre a aceitação de mudanças pessoais inescapáveis." },
            { query: "hit me hard and soft billie eilish", synopsis: "Vocais sussurrados e produções expansivas que flutuam entre o sombrio e o pop brilhante." },
            { query: "renaissance beyonce", synopsis: "Uma celebração eufórica e contínua da cultura dance, house e disco underground." },
            { query: "norman fucking rockwell lana", synopsis: "O grande romance americano moderno contado através de baladas poéticas e melancólicas." },
            { query: "my beautiful dark twisted fantasy", synopsis: "Um espetáculo maximalista e grandioso sobre o ego, a fama e a genialidade em colapso." },
            { query: "after hours weeknd", synopsis: "Uma odisseia noturna e cinematográfica pelas luzes neons e excessos de Las Vegas." },
            { query: "melodrama lorde", synopsis: "Um retrato teatral, eufórico e de cortar o coração sobre a solidão das festas e o fim da juventude." },
            { query: "rumours fleetwood mac", synopsis: "Um clássico atemporal forjado no meio de corações partidos e melodias perfeitas." },
            { query: "discovery daft punk", synopsis: "Uma viagem nostálgica de french house e disco que moldou a música eletrônica moderna." },
            { query: "abbey road the beatles", synopsis: "O grande canto do cisne da banda, trazendo medleys lendários e produção impecável." },
            { query: "nevermind nirvana", synopsis: "O trovão grunge que destruiu o hair metal e deu voz à angústia da Geração X." },
            { query: "the miseducation of lauryn hill", synopsis: "A fusão definitiva de hip-hop, soul e R&B embalada por letras maduras e pessoais." },
            { query: "good kid maad city", synopsis: "Um curta-metragem sonoro sobre a juventude, os perigos e as tentações nas ruas de Compton." },
            { query: "folklore taylor swift", synopsis: "Um refúgio indie-folk repleto de narrativas ficcionais, triângulos amorosos e texturas acústicas." },
            { query: "punisher phoebe bridgers", synopsis: "Folk indie assombrado e poético, perfeito para madrugadas existenciais." },
            { query: "souvlaki slowdive", synopsis: "Paredes de guitarras enevoadas e vocais etéreos criando a essência definitiva do shoegaze." },
            { query: "homogenic bjork", synopsis: "Batidas vulcânicas eletrônicas e cordas sinfônicas em uma carta de amor islandesa." }
        ];
        
        const shuffled = letterboxdCore.sort(() => 0.5 - Math.random()).slice(0, 10);
        
        try {
            const results = await Promise.all(shuffled.map(obj => 
                fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(obj.query)}&entity=album&limit=1`).then(r => r.json())
            ));
            
            let finalAlbums = [];
            results.forEach((res, index) => {
                if (res.results && res.results.length > 0) {
                    const item = res.results[0];
                    finalAlbums.push({
                        name: item.collectionName,
                        artists: [{ name: item.artistName }],
                        images: [{ url: item.artworkUrl100.replace('100x100bb', '600x600bb') }],
                        release_date: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'Desconhecido',
                        synopsis: shuffled[index].synopsis
                    });
                }
            });
            return finalAlbums;
        } catch (e) {
            console.error("Falha ao carregar álbuns do momento", e);
            return await fetchCatalogData("hits");
        }
    }

    async function loadPopularContent() {
        if (sectionMainTitle) sectionMainTitle.textContent = "Álbuns Populares & Destaques";
        if (sectionMainSubtitle) sectionMainSubtitle.textContent = "Os principais álbuns catalogados para você ouvir e avaliar.";

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
            if (album.synopsis) {
                heroDesc.textContent = `"${album.synopsis}" — Lançado em ${album.release_date}.`;
            } else {
                heroDesc.textContent = `Ouça o álbum de ${artists}. Lançado em ${album.release_date}. Avalie e catalogue no SoundBPM.`;
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
                }, 400);
            } else if (query.length <= 2) {
                loadPopularContent();
            }
        });
    }

    loadPopularContent();

    const homeSections = ["explore", "trending", "news", "upcoming", "community"];
    const allPages = ["dashboard", "albums-page"];

    window.navigateTo = function(pageId) {
        if (pageId === "home") {
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
        
        window.scrollTo(0, 0);
    };

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

    window.playMockTrack = function(track, artist, image) {
        const playerTrack = document.getElementById("player-track");
        const playerArtist = document.getElementById("player-artist");
        const playerImg = document.getElementById("player-img");
        
        if (playerTrack) playerTrack.textContent = track;
        if (playerArtist) playerArtist.textContent = artist;
        if (playerImg) playerImg.src = image;
    };
    
    const navHomeLink = document.getElementById("nav-home-link");
    const dashLink = document.getElementById("nav-dashboard-link");
    const navAlbumsLink = document.getElementById("nav-albums-link");
    const exploreCatalogBtn = document.getElementById("explore-catalog-btn"); 

    if (navHomeLink) {
        navHomeLink.addEventListener("click", () => navigateTo("home"));
    }

    if (dashLink) {
        dashLink.addEventListener("click", () => {
            navigateTo("dashboard");
            populateDashboard();
        });
    }

    if (navAlbumsLink) {
        navAlbumsLink.addEventListener("click", () => {
            navigateTo("albums-page");
            loadAlbumsPageContent("__TRENDING__");
        });
    }

    if (exploreCatalogBtn) {
        exploreCatalogBtn.addEventListener("click", () => {
            navigateTo("albums-page");
            loadAlbumsPageContent("__TRENDING__");
        });
    }

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
            const card = document.createElement("div");
            card.className = "poster-card";
            card.innerHTML = `
                <div class="poster-image-wrap">
                    <img src="${album.images[0].url}" alt="${album.name}">
                    <div class="poster-overlay-actions">
                        <button class="action-icon-btn" title="Avaliar">★</button>
                        <button class="action-icon-btn" title="Tocar Faixa" onclick="playMockTrack('${album.name.replace(/'/g, "\\'")}', '${album.artists[0].name.replace(/'/g, "\\'")}', '${album.images[0].url}')">▶</button>
                    </div>
                </div>
                <div class="poster-info">
                    <h3>${album.name}</h3>
                    <span class="poster-artist">${album.artists[0].name}</span>
                    <div class="poster-rating-stars">★★★★★ <span class="numeric-score">${(Math.random() * 0.4 + 4.6).toFixed(1)}</span></div>
                </div>
            `;
            albumsPageGrid.appendChild(card);
        });
    }

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
});