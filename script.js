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
                const submitBtn = document.getElementById("auth-submit-btn");
                const oldText = submitBtn.textContent;
                submitBtn.textContent = "Criando conta...";
                submitBtn.disabled = true;

                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password
                });

                if (error) {
                    alert("Erro ao criar conta: " + error.message);
                    submitBtn.textContent = oldText;
                    submitBtn.disabled = false;
                    return;
                }
                
                if (data.user) {
                    const userId = data.user.id;
                    let avatarUrl = "";
                    
                    if (avatarField && avatarField.files && avatarField.files.length > 0) {
                        const file = avatarField.files[0];
                        const fileExt = file.name.split('.').pop();
                        const filePath = `${userId}-${Math.random()}.${fileExt}`;
                        
                        const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
                        if (!uploadError) {
                            const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(filePath);
                            avatarUrl = pubData.publicUrl;
                        } else {
                            console.error("Erro no upload da foto:", uploadError);
                        }
                    }

                    await supabase.from('profiles').upsert([
                        { id: userId, username: username, avatar_url: avatarUrl, bio: "Explorando o mundo da música." }
                    ]);
                }
                
                submitBtn.textContent = oldText;
                submitBtn.disabled = false;
                alert("Conta criada com sucesso!");
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
            if (supabase) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    navigateTo("profile-page");
                    loadUserProfile();
                } else {
                    modal.classList.add("active");
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

    async function updateLoginButtonState() {
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

        if (session) {
            const { data: profile } = await supabase
                .from("profiles").select("username, avatar_url").eq("id", session.user.id).single();

            const username = profile?.username || session.user.email?.split("@")[0] || "Meu Perfil";
            const avatar   = profile?.avatar_url || "";

            localStorage.setItem("soundbpm_user", JSON.stringify({
                email: session.user.email,
                username: username,
                avatar: avatar
            }));
            await updateLoginButtonState();
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

    const dashboardSpotifyBtn = document.getElementById("dashboard-spotify-connect-btn");
    if (dashboardSpotifyBtn) {
        dashboardSpotifyBtn.addEventListener("click", async () => {
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
                release_date: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'Desconhecido',
                collectionId: item.collectionId
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
                        synopsis: shuffled[index].synopsis,
                        collectionId: item.collectionId
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

    // ── Renderizador Universal de Cards ──
    window.createAlbumCardHTML = function(album) {
        const imageUrl = album.images && album.images[0] ? album.images[0].url : (album.artworkUrl100 ? album.artworkUrl100.replace('100x100bb', '600x600bb') : '');
        const artistName = album.artists ? album.artists.map(a => a.name).join(', ') : (album.artistName || 'Artista Desconhecido');
        const albumName = album.name || album.collectionName || 'Álbum';
        const collectionId = album.collectionId || '';
        
        const safeName = albumName.replace(/'/g, "\\'");
        const safeArtist = artistName.replace(/'/g, "\\'");
        const safeImage = imageUrl.replace(/'/g, "\\'");

        return `
            <div class="poster-card" data-collection-id="${collectionId}">
                <div class="poster-image-wrap">
                    <img src="${imageUrl}" alt="${albumName}">
                    <div class="poster-overlay-actions">
                        <button class="action-icon-btn" title="Avaliar Álbum" onclick="openReviewModal('${safeName}', '${safeArtist}', '${safeImage}', '${collectionId}')">★</button>
                        <button class="action-icon-btn btn-fav-action" title="Favoritar" onclick="toggleFavorite('${safeName}', '${safeArtist}', '${safeImage}', this)">♥</button>
                        <button class="action-icon-btn" title="Tocar" onclick="playMockTrack('${safeName}', '${safeArtist}', '${safeImage}')">▶</button>
                    </div>
                </div>
                <div class="poster-info">
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
    const allPages = ["dashboard", "albums-page", "profile-page"];

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
        
        const localUser = localStorage.getItem("soundbpm_user");
        const spotifyToken = localStorage.getItem("spotify_access_token");
        
        const loggedOutView = document.getElementById("dashboard-logged-out");
        const loggedInView = document.getElementById("dashboard-logged-in");

        if (!localUser) {
            if (loggedOutView) loggedOutView.style.display = "block";
            if (loggedInView) loggedInView.style.display = "none";
            return;
        } else {
            if (loggedOutView) loggedOutView.style.display = "none";
            if (loggedInView) loggedInView.style.display = "block";
        }

        if (scrobblesContainer) scrobblesContainer.innerHTML = "<p>Carregando...</p>";
        if (recsContainer) recsContainer.innerHTML = "<p>Carregando...</p>";
        
        if (spotifyToken && spotifyToken !== "simulated_token") {
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
                scrobblesContainer.innerHTML = "<p style='color: var(--text-muted);'>Nenhum histórico recente encontrado. Conecte o seu Spotify abaixo para carregar.</p>";
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

        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: favs } = await supabase.from('favorites').select('*').eq('user_id', session.user.id);
        const favGrid = document.getElementById("dashboard-favorites-grid");
        if (favGrid) {
            if (favs && favs.length > 0) {
                favGrid.innerHTML = favs.map(f => `
                    <div class="poster-card">
                        <div class="poster-image-wrap">
                            <img src="${f.cover_url}" alt="${f.album_name}">
                        </div>
                        <div class="poster-info">
                            <h3>${f.album_name}</h3>
                            <span class="poster-artist">${f.artist_name}</span>
                        </div>
                    </div>
                `).join('');
            } else {
                favGrid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">Nenhum álbum favoritado ainda. Explore o catálogo e clique em ♥ para favoritar!</p>`;
            }
        }

        const { data: reviews } = await supabase.from('reviews').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
        const reviewsList = document.getElementById("dashboard-reviews-list");
        if (reviewsList) {
            if (reviews && reviews.length > 0) {
                reviewsList.innerHTML = reviews.map(r => {
                    const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
                    const date = new Date(r.created_at).toLocaleDateString('pt-BR');
                    return `
                    <div class="diary-item" style="background: var(--bg-card); padding: 1rem; border-radius: 6px; display: flex; gap: 1rem; align-items: flex-start;">
                        <img src="${r.cover_url}" style="width: 60px; height: 60px; border-radius: 4px; object-fit: cover;">
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong>${r.album_name}</strong>
                                <span style="color: var(--accent-orange);">${stars}</span>
                            </div>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">${r.artist_name} • ${date}</span>
                            <p style="margin-top: 0.5rem; font-style: italic; font-size: 0.9rem; white-space: pre-line;">"${r.review_text || 'Sem texto de resenha.'}"</p>
                        </div>
                    </div>`;
                }).join('');
            } else {
                reviewsList.innerHTML = `<p style="color: var(--text-muted);">Nenhuma resenha ainda. Avalie um álbum para começar seu diário!</p>`;
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
            albumsPageGrid.insertAdjacentHTML('beforeend', createAlbumCardHTML(album));
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

    // ── Lógica de Favoritos ──
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
        populateDashboard();
        if (typeof loadUserProfile === 'function') loadUserProfile();
    };

    // Lógica do Meu Perfil
    window.loadUserProfile = async function() {
        const localUser = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
        const displayName = localUser.username || "Meu Perfil";
        const avatarUrl = localUser.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces";
        
        const usernameDisplay = document.getElementById("profile-username-display");
        const avatarImg = document.getElementById("profile-avatar-img");
        const bioDisplay = document.getElementById("profile-bio-display");
        
        if (usernameDisplay) usernameDisplay.textContent = displayName;
        if (avatarImg) avatarImg.src = avatarUrl;
        
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                if (profile) {
                    if (bioDisplay) bioDisplay.textContent = profile.bio || "Membro do SoundBPM.";
                    if (usernameDisplay) usernameDisplay.textContent = profile.username || displayName;
                    if (avatarImg && profile.avatar_url) avatarImg.src = profile.avatar_url;
                }
                
                const { data: favs } = await supabase.from('favorites').select('*').eq('user_id', session.user.id);
                const favGrid = document.getElementById("profile-favorites-grid");
                if (favGrid) {
                    if (favs && favs.length > 0) {
                        favGrid.innerHTML = favs.map(f => `
                            <div class="poster-card" style="width: 150px;">
                                <img src="${f.cover_url}" alt="${f.album_name}" style="width: 100%; border-radius: 4px;">
                                <h4 style="font-size: 0.9rem; margin-top: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.album_name}</h4>
                            </div>
                        `).join('');
                    } else {
                        favGrid.innerHTML = "<p style='color: var(--text-muted); grid-column: 1/-1;'>Nenhum álbum favoritado ainda.</p>";
                    }
                }

                if (!document.getElementById("btn-logout-profile")) {
                    const logoutBtn = document.createElement("button");
                    logoutBtn.id = "btn-logout-profile";
                    logoutBtn.className = "btn-secondary-dark";
                    logoutBtn.textContent = "Sair da Conta";
                    logoutBtn.style.marginTop = "2rem";
                    logoutBtn.onclick = async () => {
                        await supabase.auth.signOut();
                        localStorage.removeItem("soundbpm_user");
                        localStorage.removeItem("spotify_access_token");
                        window.location.reload();
                    };
                    document.getElementById("profile-page").appendChild(logoutBtn);
                }
            }
        }
    };

    // Lógica de Notícias e Lançamentos
    async function loadNewsAndUpcoming() {
        const newsContainer = document.getElementById("news-grid-container");
        const upcomingContainer = document.getElementById("upcoming-grid-container");

        if (newsContainer) {
            try {
                const rssUrl = "https://g1.globo.com/rss/g1/pop-arte/musica/";
                const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
                const response = await fetch(apiUrl);
                const data = await response.json();
                
                if (data.status === "ok" && data.items) {
                    newsContainer.innerHTML = data.items.slice(0, 3).map(item => {
                        const date = new Date(item.pubDate);
                        const dataFormatada = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
                        return `
                        <article class="news-card">
                            <div class="news-tag">News</div>
                            <h3><a href="${item.link}" target="_blank" style="color: inherit; text-decoration: none;">${item.title}</a></h3>
                            <p class="news-snippet">${item.description.replace(/<[^>]+>/g, '').substring(0, 100)}...</p>
                            <div class="news-meta">
                                <span>${dataFormatada}</span>
                                <span>G1 Música</span>
                            </div>
                        </article>
                        `;
                    }).join('');
                }
            } catch(e) {
                console.error("Erro ao carregar notícias:", e);
                newsContainer.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: var(--text-muted);'>Não foi possível carregar as notícias mais recentes.</p>";
            }
        }

        if (upcomingContainer) {
            try {
                const itunesRss = "https://itunes.apple.com/br/rss/topalbums/limit=5/xml";
                const rssApi = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(itunesRss)}&api_key=&order_by=pubDate`;
                const resp = await fetch(rssApi);
                const rssData = await resp.json();

                let upcomingHtml = "";

                if (rssData.status === "ok" && rssData.items && rssData.items.length > 0) {
                    rssData.items.slice(0, 4).forEach(item => {
                        const imgMatch = item.description ? item.description.match(/src="([^"]+)"/) : null;
                        const imgUrl = imgMatch ? imgMatch[1].replace("55x55", "170x170") : "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=170&h=170&fit=crop";
                        upcomingHtml += `
                        <div class="upcoming-card" style="display: flex; gap: 1rem; align-items: center;">
                            <img src="${imgUrl}" style="width: 80px; height: 80px; border-radius: 4px; object-fit: cover;">
                            <div class="upcoming-details">
                                <h4 style="margin: 0 0 0.25rem 0;">${item.title}</h4>
                                <span class="upcoming-artist" style="color: var(--text-muted); font-size: 0.9rem;">${item.author || "Artista"}</span>
                                <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: var(--accent-gold);">🔥 Top Charts Brasil</p>
                            </div>
                            <a href="${item.link}" target="_blank" class="btn-notify" style="margin-left: auto; text-decoration: none;">Ouvir</a>
                        </div>`;
                    });
                    upcomingContainer.innerHTML = upcomingHtml;
                } else {
                    throw new Error("RSS sem dados");
                }
            } catch(e) {
                const fallbackQueries = [
                    { q: "sabrina carpenter short n sweet", label: "🔥 Hot agora" },
                    { q: "kendrick lamar gnx",              label: "🔥 Hot agora" },
                    { q: "chappell roan rise and fall",     label: "📈 Em alta" },
                    { q: "charli xcx brat",                 label: "📈 Em alta" }
                ];
                const fallbackResults = await Promise.all(
                    fallbackQueries.map(item =>
                        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(item.q)}&entity=album&limit=1&country=br`)
                            .then(r => r.json())
                            .then(d => ({ ...d, label: item.label }))
                            .catch(() => null)
                    )
                );
                let html = "";
                fallbackResults.forEach(res => {
                    if (!res || !res.results || !res.results[0]) return;
                    const a = res.results[0];
                    const cover = a.artworkUrl100.replace("100x100", "170x170");
                    html += `
                    <div class="upcoming-card" style="display: flex; gap: 1rem; align-items: center;">
                        <img src="${cover}" style="width: 80px; height: 80px; border-radius: 4px; object-fit: cover;">
                        <div class="upcoming-details">
                            <h4 style="margin: 0 0 0.25rem 0;">${a.collectionName}</h4>
                            <span class="upcoming-artist" style="color: var(--text-muted); font-size: 0.9rem;">${a.artistName}</span>
                            <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: var(--accent-gold);">${res.label} • ${new Date(a.releaseDate).getFullYear()}</p>
                        </div>
                        <a href="${a.collectionViewUrl}" target="_blank" class="btn-notify" style="margin-left: auto; text-decoration: none;">Ver</a>
                    </div>`;
                });
                upcomingContainer.innerHTML = html || "<p style='color: var(--text-muted);'>Erro ao carregar lançamentos.</p>";
            }
        }
    }
    loadNewsAndUpcoming();

    // Editar Perfil Modals
    const editProfileModal = document.getElementById("edit-profile-modal");
    const closeEditProfile = document.getElementById("close-edit-profile");
    const editProfileForm  = document.getElementById("edit-profile-form");

    document.addEventListener("click", async (e) => {
        if (e.target && e.target.id === "btn-edit-profile") {
            if (!supabase) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data: profile } = await supabase
                .from("profiles").select("*").eq("id", session.user.id).single();

            if (profile) {
                const uInput = document.getElementById("edit-profile-username");
                const bInput = document.getElementById("edit-profile-bio");
                if (uInput) uInput.value = profile.username || "";
                if (bInput) bInput.value = profile.bio || "";
            }
            if (editProfileModal) editProfileModal.classList.add("active");
        }
    });

    if (closeEditProfile && editProfileModal) {
        closeEditProfile.addEventListener("click", () => editProfileModal.classList.remove("active"));
        editProfileModal.addEventListener("click", e => {
            if (e.target === editProfileModal) editProfileModal.classList.remove("active");
        });
    }

    if (editProfileForm) {
        editProfileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!supabase) return;

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { alert("Você precisa estar logado."); return; }

            const submitBtn = document.getElementById("edit-profile-submit");
            submitBtn.textContent = "Salvando...";
            submitBtn.disabled = true;

            const newUsername = document.getElementById("edit-profile-username").value.trim();
            const newBio      = document.getElementById("edit-profile-bio").value.trim();
            const avatarFile  = document.getElementById("edit-profile-avatar").files[0];

            let updatedFields = { id: session.user.id, username: newUsername, bio: newBio };

            if (avatarFile) {
                const ext      = avatarFile.name.split(".").pop();
                const filePath = `${session.user.id}-${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage
                    .from("avatars").upload(filePath, avatarFile, { upsert: true });
                if (!upErr) {
                    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
                    updatedFields.avatar_url = pub.publicUrl;
                } else {
                    console.error("Erro no upload:", upErr);
                    alert("Erro ao fazer upload da foto: " + upErr.message);
                }
            }

            const { error } = await supabase.from("profiles").upsert([updatedFields]);

            submitBtn.textContent = "Salvar Alterações";
            submitBtn.disabled = false;

            if (error) {
                alert("Erro ao salvar: " + error.message);
            } else {
                const localUser = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
                localUser.username = newUsername;
                if (updatedFields.avatar_url) localUser.avatar = updatedFields.avatar_url;
                localStorage.setItem("soundbpm_user", JSON.stringify(localUser));

                if (editProfileModal) editProfileModal.classList.remove("active");

                await loadUserProfile();
                updateLoginButtonState();
            }
        });
    }
    // ── Sistema de Estrelas do Modo Geral (Corrigido para alinhar perfeitamente) ──
    const starSelector = document.getElementById("star-rating-selector");
    const ratingValueInput = document.getElementById("review-rating-value");
    
    function renderGeneralStars(val) {
        if (!starSelector) return;
        starSelector.innerHTML = "";
        starSelector.style.letterSpacing = "2px"; // Mantém espaçamento limpo
        
        for (let i = 1; i <= 5; i++) {
            let fillPercent = 0;
            if (val >= i) fillPercent = 100;
            else if (val >= i - 0.5) fillPercent = 50;

            const span = document.createElement("span");
            span.style.cssText = "position: relative; display: inline-block; cursor: pointer;";
            span.innerHTML = `
                <span style="color: var(--text-muted);">★</span>
                <span style="position: absolute; left: 0; top: 0; width: ${fillPercent}%; overflow: hidden; color: var(--accent-orange); white-space: nowrap;">★</span>
            `;

            span.addEventListener("click", (e) => {
                const rect = span.getBoundingClientRect();
                const isLeftHalf = (e.clientX - rect.left) < (rect.width / 2);
                const rating = isLeftHalf ? (i - 0.5) : i;
                ratingValueInput.value = rating;
                renderGeneralStars(rating);
            });

            starSelector.appendChild(span);
        }
    }

    if (starSelector) {
        renderGeneralStars(5);
    }

    // ── Modal de Avaliação & Abas Geral/Faixas ──
    const reviewModal = document.getElementById("review-modal");
    const closeReviewModal = document.getElementById("close-review-modal");
    const reviewForm = document.getElementById("review-form");
    const tabGen = document.getElementById("tab-review-general");
    const tabTrk = document.getElementById("tab-review-tracks");
    const modeGen = document.getElementById("review-mode-general");
    const modeTrk = document.getElementById("review-mode-tracks");
    let currentTracksData = [];
    let reviewMode = 'general';

    if (tabGen && tabTrk) {
        tabGen.addEventListener("click", () => {
            reviewMode = 'general';
            tabGen.style.color = "var(--accent-gold)"; tabGen.style.fontWeight = "700";
            tabTrk.style.color = "var(--text-muted)"; tabTrk.style.fontWeight = "600";
            modeGen.style.display = "block"; modeTrk.style.display = "none";
        });
        tabTrk.addEventListener("click", async () => {
            reviewMode = 'tracks';
            tabTrk.style.color = "var(--accent-gold)"; tabTrk.style.fontWeight = "700";
            tabGen.style.color = "var(--text-muted)"; tabGen.style.fontWeight = "600";
            modeTrk.style.display = "block"; modeGen.style.display = "none";
            
            const collectionId = reviewModal.dataset.collectionId;
            if (collectionId && collectionId !== 'undefined' && collectionId !== 'null' && collectionId !== '') {
                await fetchAlbumTracks(collectionId);
            } else {
                document.getElementById("tracks-rating-container").innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Faixas individuais indisponíveis para este álbum. Use a nota geral.</p>";
            }
        });
    }

    async function fetchAlbumTracks(collectionId) {
        const container = document.getElementById("tracks-rating-container");
        if (!container) return;
        container.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Carregando faixas...</p>";
        try {
            const resp = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song`);
            const data = await resp.json();
            const songs = data.results.filter(item => item.wrapperType === 'track');
            currentTracksData = songs.map(s => ({ name: s.trackName, rating: 5 }));

            if (currentTracksData.length === 0) {
                container.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Nenhuma faixa encontrada.</p>";
                return;
            }

            renderTracksList();
            updateCalculatedAverage();
        } catch (e) {
            console.error("Erro ao buscar faixas:", e);
            container.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Erro ao carregar faixas.</p>";
        }
    }

    function renderStarIcons(rating) {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            let fillPercent = 0;
            if (rating >= i) fillPercent = 100;
            else if (rating >= i - 0.5) fillPercent = 50;

            html += `
                <span class="track-star-item" data-star="${i}" style="position: relative; display: inline-block; cursor: pointer;">
                    <span style="color: var(--text-muted);">★</span>
                    <span style="position: absolute; left: 0; top: 0; width: ${fillPercent}%; overflow: hidden; color: var(--accent-orange); white-space: nowrap;">★</span>
                </span>
            `;
        }
        return html;
    }

    function renderTracksList() {
        const container = document.getElementById("tracks-rating-container");
        if (!container) return;
        container.innerHTML = currentTracksData.map((track, idx) => `
            <div style="background: var(--bg-card); padding: 0.6rem 0.8rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${track.name}">${idx+1}. ${track.name}</span>
                <div class="track-stars-group" data-index="${idx}" style="cursor: pointer; color: var(--accent-orange); font-size: 1.1rem; display: inline-flex; gap: 2px;">
                    ${renderStarIcons(track.rating)}
                </div>
            </div>
        `).join('');

        container.querySelectorAll(".track-stars-group").forEach(starGroup => {
            const index = parseInt(starGroup.dataset.index);
            starGroup.querySelectorAll(".track-star-item").forEach((starSpan, i) => {
                starSpan.addEventListener("click", (e) => {
                    const rect = starSpan.getBoundingClientRect();
                    const isLeftHalf = (e.clientX - rect.left) < (rect.width / 2);
                    const starNum = i + 1;
                    const val = isLeftHalf ? (starNum - 0.5) : starNum;
                    
                    currentTracksData[index].rating = val;
                    renderTracksList();
                    updateCalculatedAverage();
                });
            });
        });
    }

    function updateCalculatedAverage() {
        if (currentTracksData.length === 0) return;
        const sum = currentTracksData.reduce((acc, t) => acc + t.rating, 0);
        const avg = (sum / currentTracksData.length).toFixed(1);
        const roundedStars = Math.round(avg);
        const starsStr = "★".repeat(Math.min(5, Math.max(0, roundedStars))) + "☆".repeat(Math.max(0, 5 - Math.min(5, roundedStars)));
        const avgElement = document.getElementById("calculated-average-stars");
        if (avgElement) avgElement.textContent = `${starsStr} (${avg})`;
    }

    window.openReviewModal = function(albumName, artistName, coverUrl, collectionId = '') {
        const localUser = localStorage.getItem("soundbpm_user");
        if (!localUser && !localStorage.getItem("spotify_access_token")) {
            alert("Você precisa fazer login para avaliar álbuns e criar seu diário!");
            document.getElementById('login-modal').classList.add('active');
            return;
        }

        document.getElementById("review-modal-title").textContent = albumName;
        document.getElementById("review-modal-artist").textContent = artistName;
        reviewModal.dataset.cover = coverUrl;
        reviewModal.dataset.collectionId = collectionId;

        // Resetar para aba geral e 5 estrelas
        ratingValueInput.value = 5;
        renderGeneralStars(5);

        reviewMode = 'general';
        if(tabGen && tabTrk) {
            tabGen.style.color = "var(--accent-gold)"; tabGen.style.fontWeight = "700";
            tabTrk.style.color = "var(--text-muted)"; tabTrk.style.fontWeight = "600";
            modeGen.style.display = "block"; modeTrk.style.display = "none";
        }
        
        if (reviewModal) reviewModal.classList.add("active");
    };

    if (closeReviewModal && reviewModal) {
        closeReviewModal.addEventListener("click", () => reviewModal.classList.remove("active"));
        reviewModal.addEventListener("click", (e) => {
            if (e.target === reviewModal) reviewModal.classList.remove("active");
        });
    }

    if (reviewForm) {
        reviewForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!supabase) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { alert("You must be logged in."); return; }

            const submitBtn = document.getElementById("submit-review-btn");
            submitBtn.textContent = "Salvando no Diário...";
            submitBtn.disabled = true;

            const albumName = document.getElementById("review-modal-title").textContent;
            const artistName = document.getElementById("review-modal-artist").textContent;
            const coverUrl = reviewModal.dataset.cover || "";
            
            let finalRating = 5;
            let reviewNote = document.getElementById("review-text-input").value.trim();

            if (reviewMode === 'tracks' && currentTracksData.length > 0) {
                const sum = currentTracksData.reduce((acc, t) => acc + t.rating, 0);
                finalRating = parseFloat((sum / currentTracksData.length).toFixed(1));
                const tracksBreakdown = currentTracksData.map(t => `${t.name}: ${t.rating}★`).join(' | ');
                reviewNote = `[Avaliação Faixa a Faixa]\n${tracksBreakdown}\n\nNota: "${reviewNote}"`;
            } else {
                finalRating = parseFloat(ratingValueInput.value) || 5;
            }

            const { error } = await supabase.from("reviews").insert([
                { user_id: session.user.id, album_name: albumName, artist_name: artistName, cover_url: coverUrl, rating: finalRating, review_text: reviewNote }
            ]);

            submitBtn.textContent = "Salvar no Diário";
            submitBtn.disabled = false;

            if (error) {
                alert("Erro ao salvar resenha: " + error.message);
            } else {
                alert("Resenha registrada com sucesso no seu diário!");
                reviewModal.classList.remove("active");
                document.getElementById("review-text-input").value = "";
                populateDashboard();
                if (typeof loadUserProfile === 'function') loadUserProfile();
            }
        });
    }
});