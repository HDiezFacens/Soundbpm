document.addEventListener("DOMContentLoaded", () => {
    // RESOLUÇÃO DE HOISTING: Variáveis do modal movidas para o topo para evitar quebra no fluxo de autenticação
    const modal = document.getElementById("login-modal");
    const openLoginBtn = document.getElementById("open-login-modal");
    const closeLoginBtn = document.querySelector(".close-modal");

    // Limpa simulações antigas para que o site nunca abra simulado por padrão
    if (localStorage.getItem("spotify_access_token") === "simulated_token") {
        localStorage.removeItem("spotify_access_token");
    }

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

    // Função de sanitização contra XSS
    const gameEsc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

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
            const submitBtn = document.getElementById("auth-submit-btn");
            const oldText = submitBtn.textContent;

            if (isRegisterMode) {
                submitBtn.textContent = "Criando conta...";
                submitBtn.disabled = true;

                const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: { data: { username: username, bio: "Explorando o mundo da música." } }
                });

                if (signUpError) {
                    alert("Erro ao criar conta: " + signUpError.message);
                    submitBtn.textContent = oldText;
                    submitBtn.disabled = false;
                    return;
                }

                await savePendingSignup(email, username, avatarField);

                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (signInError) {
                    alert("Conta criada! Confirme seu e-mail e depois faça login: seu apelido e sua foto serão aplicados automaticamente.");
                    submitBtn.textContent = oldText;
                    submitBtn.disabled = false;
                    if (modal) modal.classList.remove("active");
                    return;
                }

                const { data: { session } } = await supabase.auth.getSession();
                
                if (session && session.user) {
                    const userId = session.user.id;
                    let avatarUrl = "";
                    
                    if (avatarField && avatarField.files && avatarField.files.length > 0) {
                        const file = avatarField.files[0];
                        const fileExt = file.name.split('.').pop();
                        const filePath = `${userId}-${Math.random()}.${fileExt}`;
                        
                        const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
                        if (!uploadError) {
                            const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(filePath);
                            avatarUrl = pubData.publicUrl;
                        }
                    }

                    await supabase.from('profiles').upsert([
                        { id: userId, username: username, avatar_url: avatarUrl, bio: "Explorando o mundo da música." }
                    ]);

                    localStorage.setItem("soundbpm_user", JSON.stringify({
                        email: email,
                        username: username,
                        avatar: avatarUrl
                    }));
                }
                
                submitBtn.textContent = oldText;
                submitBtn.disabled = false;
                alert("Conta criada e login efetuado com sucesso!");
            } else {
                submitBtn.textContent = "Entrando...";
                submitBtn.disabled = true;

                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                submitBtn.textContent = oldText;
                submitBtn.disabled = false;

                if (error) {
                    alert("Erro ao entrar: " + error.message);
                    return;
                }

                if (data.session && data.session.user) {
                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("username, avatar_url")
                        .eq("id", data.session.user.id)
                        .single();

                    localStorage.setItem("soundbpm_user", JSON.stringify({
                        email: data.session.user.email,
                        username: profile?.username || data.session.user.email.split("@")[0],
                        avatar: profile?.avatar_url || ""
                    }));
                }

                alert("Login efetuado com sucesso!");
            }

            if (modal) modal.classList.remove("active");
            await checkSupabaseSession();
            await updateLoginButtonState();
            openUserProfile(); 
        });
    }

    if (openLoginBtn && modal) {
        openLoginBtn.addEventListener("click", async () => {
            if (supabase) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    openUserProfile();
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

    async function generateRandomString(length) {
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

    async function connectToSpotify() {
        const codeVerifier = await generateRandomString(64);
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
    }

    const dashboardSpotifyBtn = document.getElementById("dashboard-spotify-connect-btn");
    if (dashboardSpotifyBtn) {
        dashboardSpotifyBtn.addEventListener("click", connectToSpotify);
    }

    const footerSpotify = document.getElementById("footer-spotify-connect");
    if (footerSpotify) {
        footerSpotify.addEventListener("click", (e) => {
            e.preventDefault();
            connectToSpotify();
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
            openLoginBtn.style.background = "";
            openLoginBtn.style.padding = "";
            openLoginBtn.style.borderRadius = "";
        }
    }

    async function checkSupabaseSession() {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            await ensureProfileFromSignup(session);
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

    loadPopularContent();

    const homeSections = ["explore", "trending", "news", "upcoming", "community"];
    const allPages = ["dashboard", "albums-page", "profile-page", "people-page", "album-detail-page", "ranking-page"];

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

            if (albumReviews && albumReviews.length > 0) {
                const totalRating = albumReviews.reduce((acc, r) => acc + r.rating, 0);
                const avgRating = (totalRating / albumReviews.length).toFixed(1);
                const starsCount = "★".repeat(Math.round(avgRating)) + "☆".repeat(5 - Math.round(avgRating));
                document.getElementById("detail-album-rating-avg").innerHTML = `${starsCount} <span style="color: var(--text-main); font-weight: 600;">${avgRating}</span> <span style="color: var(--text-muted); font-size: 0.9rem;">(${albumReviews.length} resenha${albumReviews.length > 1 ? 's' : ''})</span>`;

                reviewsContainer.innerHTML = albumReviews.map(r => {
                    const avatar = r.profiles?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=40&h=40&fit=crop&crop=faces";
                    const username = r.profiles?.username || "Membro";
                    const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
                    const date = new Date(r.created_at).toLocaleDateString('pt-BR');
                    // RESOLUÇÃO DE XSS
                    return `
                    <div style="background: var(--bg-base); padding: 0.8rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
                        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; cursor: pointer;" onclick="openUserProfile('${r.user_id}')">
                            <img src="${avatar}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover;">
                            <span style="font-weight: 600; font-size: 0.85rem; color: var(--accent-gold);">${username}</span>
                            <span style="margin-left: auto; color: var(--accent-orange); font-size: 0.85rem;">${stars}</span>
                        </div>
                        <p style="margin: 0; font-size: 0.85rem; font-style: italic; color: var(--text-main); white-space: pre-line;">"${gameEsc(r.review_text || 'Sem texto.')}"</p>
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

    async function fetchFromSpotify(endpoint) {
        const token = localStorage.getItem("spotify_access_token");
        if (!token || token === "simulated_token") return null;
        try {
            const response = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // RESOLUÇÃO DE EXPIRAÇÃO DE TOKEN
            if (response.status === 401) {
                localStorage.removeItem("spotify_access_token");
                console.warn("Sessão do Spotify expirou.");
                return null;
            }

            if (!response.ok) throw new Error("Erro Spotify: " + response.status);
            return await response.json();
        } catch (error) {
            console.error("Erro ao buscar dados reais do Spotify:", error);
            return null;
        }
    }

    window.populateDashboard = async function() {
        const scrobblesContainer = document.getElementById("recent-scrobbles");
        const recsContainer = document.getElementById("personal-recs");
        const connectBanner = document.getElementById("spotify-connect-banner");
        
        const spotifyToken = localStorage.getItem("spotify_access_token");

        const dashSimulateBtn = document.getElementById("dashboard-simulate-btn");
        if (dashSimulateBtn) {
            dashSimulateBtn.onclick = () => {
                localStorage.setItem("spotify_access_token", "simulated_token");
                populateDashboard();
                if (webPlayer) webPlayer.classList.remove("hidden");
            };
        }

        if (connectBanner) {
            if (spotifyToken) {
                connectBanner.style.display = "none";
            } else {
                connectBanner.style.display = "flex";
            }
        }

        if (!spotifyToken) {
            if (scrobblesContainer) {
                scrobblesContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Conecte o Spotify ou ative o Modo Simulado acima para visualizar o histórico.</p>";
            }
            if (recsContainer) {
                recsContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Conecte o Spotify ou ative o Modo Simulado acima para ver recomendações.</p>";
            }
            if (typeof loadDashboardBacklog === 'function') loadDashboardBacklog();
            return;
        }

        if (scrobblesContainer) scrobblesContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Carregando...</p>";
        if (recsContainer) recsContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Carregando...</p>";
        
        if (spotifyToken && spotifyToken !== "simulated_token") {
            const recentData = await fetchFromSpotify("me/player/recently-played?limit=4");
            const topData = await fetchFromSpotify("me/top/tracks?limit=4");
            
            if (recentData && recentData.items && scrobblesContainer) {
                scrobblesContainer.innerHTML = recentData.items.map(item => {
                    const track = item.track;
                    const imageUrl = getHighResImage(track) || './Logo.png';
                    const trackName = track.name.replace(/'/g, "\\'");
                    const artistName = track.artists[0].name.replace(/'/g, "\\'");
                    return `
                    <div class="poster-card" onclick="playMockTrack('${trackName}', '${artistName}', '${imageUrl}')" style="cursor: pointer;">
                        <div class="poster-image-wrap">
                            <img src="${imageUrl}" alt="${track.name}">
                        </div>
                        <div class="poster-info">
                            <h3 style="font-size: 0.95rem;">${track.name}</h3>
                            <span class="poster-artist">${track.artists[0].name}</span>
                        </div>
                    </div>`;
                }).join('');
            } else if (scrobblesContainer) {
                scrobblesContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Nenhum histórico recente encontrado.</p>";
            }

            if (topData && topData.items && recsContainer) {
                recsContainer.innerHTML = topData.items.map(track => {
                    const imageUrl = getHighResImage(track) || './Logo.png';
                    const trackName = track.name.replace(/'/g, "\\'");
                    const artistName = track.artists[0].name.replace(/'/g, "\\'");
                    return `
                    <div class="poster-card" onclick="playMockTrack('${trackName}', '${artistName}', '${imageUrl}')" style="cursor: pointer;">
                        <div class="poster-image-wrap">
                            <img src="${imageUrl}" alt="${track.name}">
                        </div>
                        <div class="poster-info">
                            <h3 style="font-size: 0.95rem;">${track.name}</h3>
                            <span class="poster-artist">${track.artists[0].name}</span>
                        </div>
                    </div>`;
                }).join('');
            } else if (recsContainer) {
                recsContainer.innerHTML = "<p style='color: var(--text-muted); font-size: 0.85rem;'>Sem dados suficientes para recomendações.</p>";
            }

        } else {
            const scrobblesData = await fetchCatalogData("lofi");
            const recsData = await fetchCatalogData("indie");
            
            if (scrobblesContainer && scrobblesData.length) {
                scrobblesContainer.innerHTML = scrobblesData.slice(0, 4).map(album => createAlbumCardHTML(album)).join('');
            }
            
            if (recsContainer && recsData.length) {
                recsContainer.innerHTML = recsData.slice(0, 4).map(album => createAlbumCardHTML(album)).join('');
            }
        }

        if (typeof loadDashboardBacklog === 'function') {
            loadDashboardBacklog();
        }
    };

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
  
    window.loadUserProfile = async function(targetUserId = null) {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        const myId = session?.user?.id;
        
        const userIdToLoad = targetUserId || myId;
        if (!userIdToLoad) {
            alert("Faça login para ver seu perfil.");
            return;
        }

        const isMyProfile = (userIdToLoad === myId);

        const profilePage = document.getElementById("profile-page");
        if (profilePage) profilePage.dataset.userId = userIdToLoad;

        const usernameDisplay = document.getElementById("profile-username-display");
        const avatarImg = document.getElementById("profile-avatar-img");
        const avatarWrap = document.getElementById("profile-avatar-wrap");
        const avatarOverlay = document.getElementById("avatar-hover-overlay");
        const bioDisplay = document.getElementById("profile-bio-display");
        const editBtn = document.getElementById("btn-edit-profile");

        if (editBtn) editBtn.style.display = isMyProfile ? "block" : "none";
        if (avatarWrap) {
            avatarWrap.style.cursor = isMyProfile ? "pointer" : "default";
            avatarWrap.title = isMyProfile ? "Toque para alterar sua foto de perfil" : "Foto de perfil";
        }
        if (avatarOverlay) {
            avatarOverlay.style.display = isMyProfile ? "flex" : "none";
        }

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userIdToLoad).single();
        
        let displayName = profile?.username || "Usuário";
        let avatarUrl = profile?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces";
        let bioText = profile?.bio || (isMyProfile ? "Explorando o mundo da música." : "Membro do SoundBPM.");

        if (usernameDisplay) usernameDisplay.textContent = displayName;
        if (avatarImg) avatarImg.src = avatarUrl;
        if (bioDisplay) bioDisplay.textContent = bioText;

        // Renderizar Banner do Perfil & Dimensionamento
        const bannerContainer = document.getElementById("profile-banner-container");
        const bannerImg = document.getElementById("profile-banner-img");
        const bannerPlaceholder = document.getElementById("profile-banner-placeholder");
        const bannerActions = document.getElementById("profile-banner-actions");

        let savedBanner = null;
        try {
            savedBanner = JSON.parse(localStorage.getItem(`soundbpm_banner_${userIdToLoad}`) || "null");
        } catch(e) {}

        const bannerUrl = profile?.banner_url || savedBanner?.url || "";
        let bannerPos = { y: 50, scale: 100, height: 380 };
        if (profile?.banner_pos) {
            try {
                bannerPos = typeof profile.banner_pos === 'string' ? JSON.parse(profile.banner_pos) : profile.banner_pos;
            } catch(e) {}
        } else if (savedBanner?.pos) {
            bannerPos = savedBanner.pos;
        }

        const heroSection = document.querySelector(".profile-hero-section");
        if (heroSection) {
            heroSection.style.minHeight = `${Math.max(340, bannerPos.height || 380)}px`;
        }

       if (bannerContainer) {
            bannerContainer.style.height = "100%";
            if (bannerUrl) {
                if (bannerImg) {
                    bannerImg.src = bannerUrl;
                    bannerImg.style.display = "block";
                    bannerImg.style.objectPosition = `center ${bannerPos.y ?? 50}%`;
                    bannerImg.style.transform = `scale(${(bannerPos.scale ?? 100) / 100})`;
                }
                if (bannerPlaceholder) bannerPlaceholder.style.display = "none";
            } else {
                if (bannerImg) {
                    bannerImg.removeAttribute("src");
                    bannerImg.style.display = "none";
                }
                if (bannerPlaceholder) {
                    // Exibe a mensagem de personalizar apenas se for o próprio perfil; caso contrário, oculta
                    bannerPlaceholder.style.display = isMyProfile ? "flex" : "none";
                    bannerPlaceholder.style.cursor = isMyProfile ? "pointer" : "default";
                }
            }
        }

        if (bannerActions) {
            bannerActions.style.display = isMyProfile ? "flex" : "none";
            const removeBtn = document.getElementById("btn-remove-banner");
            if (removeBtn) removeBtn.style.display = bannerUrl ? "inline-flex" : "none";
            const adjustBtn = document.getElementById("btn-adjust-banner");
            if (adjustBtn) adjustBtn.style.display = bannerUrl ? "inline-flex" : "none";
        }

        gameCache = null;
        renderProfileGamification(userIdToLoad);

        const { data: favs } = await supabase.from('favorites').select('*').eq('user_id', userIdToLoad);
        const favGrid = document.getElementById("profile-favorites-grid");
        if (favGrid) {
            if (favs && favs.length > 0) {
                favGrid.innerHTML = favs.map(f => {
                    const safeName = (f.album_name || '').replace(/'/g, "\\'");
                    const safeArtist = (f.artist_name || '').replace(/'/g, "\\'");
                    const safeCover = (f.cover_url || '').replace(/'/g, "\\'");
                    return `
                    <div class="poster-card" style="width: 150px; position: relative; cursor: pointer;" onclick="openAlbumPage('', '${safeName}', '${safeArtist}', '${safeCover}')">
                        ${isMyProfile ? `<button class="remove-favorite-btn" onclick="event.stopPropagation(); removeProfileFavorite('${f.id}')" title="Remover favorito">&times;</button>` : ''}
                        <img src="${f.cover_url}" alt="${f.album_name}" style="width: 100%; border-radius: 4px;">
                        <h4 style="font-size: 0.9rem; margin-top: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.album_name}</h4>
                    </div>
                `;
                }).join('');
            } else {
                favGrid.innerHTML = "<p style='color: var(--text-muted); grid-column: 1/-1;'>Nenhum álbum favoritado ainda.</p>";
            }
        }

        const { data: profileReviews } = await supabase.from('reviews').select('*').eq('user_id', userIdToLoad).order('created_at', { ascending: false });
        const profileReviewsList = document.getElementById("profile-reviews-list");
        if (profileReviewsList) {
            if (profileReviews && profileReviews.length > 0) {
                profileReviewsList.innerHTML = profileReviews.map(r => {
                    const stars = "★".repeat(Math.round(r.rating)) + "☆".repeat(5 - Math.round(r.rating));
                    const date = new Date(r.created_at).toLocaleDateString('pt-BR');
                    const safeName = (r.album_name || '').replace(/'/g, "\\'");
                    const safeArtist = (r.artist_name || '').replace(/'/g, "\\'");
                    const safeCover = (r.cover_url || '').replace(/'/g, "\\'");
                    
                    const shareButtonHtml = isMyProfile ? `
                        <button onclick="event.stopPropagation(); shareToInstagramStory('${safeName}', '${safeArtist}', '${safeCover}', ${r.rating}, \`${(gameEsc(r.review_text || '')).replace(/`/g, '\\`')}\`)" 
                            style="margin-top: 10px; background: transparent; border: 1px solid var(--accent-gold); color: var(--accent-gold); padding: 5px 12px; border-radius: 20px; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;">
                            📸 Compartilhar no Instagram Story
                        </button>` : '';

                    return `
                    <div class="diary-item" style="background: var(--bg-card); padding: 1rem; border-radius: 6px; display: flex; gap: 1rem; align-items: flex-start; position: relative; cursor: pointer;" onclick="openAlbumPage('', '${safeName}', '${safeArtist}', '${safeCover}')">
                        <img src="${r.cover_url}" style="width: 60px; height: 60px; border-radius: 4px; object-fit: cover;">
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong>${r.album_name}</strong>
                                <span style="color: var(--accent-orange);">${stars} (${r.rating})</span>
                            </div>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">${r.artist_name} • ${date}</span>
                            <p style="margin-top: 0.5rem; font-style: italic; font-size: 0.9rem; white-space: pre-line;">"${gameEsc(r.review_text || 'Sem texto de resenha.')}"</p>
                            
                            ${shareButtonHtml}
                            
                        </div>
                        ${isMyProfile ? `<button onclick="event.stopPropagation(); removeProfileReview('${r.id}')" title="Excluir resenha" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.3rem;">&times;</button>` : ''}
                    </div>`;
                }).join('');
            } else {
                profileReviewsList.innerHTML = "<p style='color: var(--text-muted);'>Nenhuma resenha escrita ainda.</p>";
            }
        }

        renderProfileExtras({ userId: userIdToLoad, myId, mine: isMyProfile, name: displayName, profile, reviews: profileReviews || [], favs: favs || [] });

        let logoutBtn = document.getElementById("btn-logout-profile");
        if (isMyProfile) {
            if (!logoutBtn) {
                logoutBtn = document.createElement("button");
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
            } else {
                logoutBtn.style.display = "block";
            }
        } else {
            if (logoutBtn) logoutBtn.style.display = "none";
        }
    };

    window.openUserProfile = function(userId = null) {
        navigateTo("profile-page");
        loadUserProfile(userId);
    };

    window.removeProfileFavorite = async function(id) {
        if (!supabase) return;
        const { error } = await supabase.from('favorites').delete().eq('id', id);
        if (!error) {
            loadUserProfile();
        } else {
            alert("Erro ao remover favorito: " + error.message);
        }
    };

    window.removeProfileReview = async function(id) {
        if (!supabase) return;
        if (!confirm("Tem certeza de que deseja excluir esta resenha?")) return;
        const { error } = await supabase.from('reviews').delete().eq('id', id);
        if (!error) {
            loadUserProfile();
        } else {
            alert("Erro ao excluir resenha: " + error.message);
        }
    };
   
    const defaultMusicNews = [
        {
            title: "Grammy Awards 2026: Academia anuncia mudanças no regulamento e novas categorias de música independente",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 3).toISOString(),
            description: "A Recording Academy revelou novidades que aumentam a representatividade e valorizam produções originais e independentes no cenário mundial.",
            source: "SoundBPM Notícias",
            tag: "Premiação"
        },
        {
            title: "Sabrina Carpenter bate novos recordes nas plataformas de streaming com 'Short n' Sweet'",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 8).toISOString(),
            description: "Com hits consecutivos no topo da Billboard Hot 100, cantora consolida um dos momentos mais vitoriosos e comentados do pop recente.",
            source: "Billboard & G1",
            tag: "Charts"
        },
        {
            title: "Kendrick Lamar expande universo sonoro e prepara grandes apresentações em festivais globais",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 18).toISOString(),
            description: "Após o impacto monumental de GNX e do espetáculo do Super Bowl, o rapper confirma datas especiais que prometem marcar época no hip-hop.",
            source: "Rolling Stone",
            tag: "Turnê"
        },
        {
            title: "The Weeknd dá pistas sobre conclusão de sua aclamada trilogia conceitual com 'Hurry Up Tomorrow'",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 28).toISOString(),
            description: "Apresentação cinematográfica em São Paulo e teasers enigmáticos antecipam um dos lançamentos mais aguardados e comentados da década.",
            source: "Pop & Arte",
            tag: "Lançamento"
        },
        {
            title: "O ressurgimento do vinil e o boom do shoegaze: a geração Z redescobre a audição imersiva",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 42).toISOString(),
            description: "Vendas de discos de vinil superam previsões no Brasil, impulsionadas pelo público jovem em busca de autenticidade analógica e álbuns conceituais.",
            source: "Música & Mercado",
            tag: "Tendência"
        },
        {
            title: "Charli xcx e o fenômeno 'Brat': como a estética verde-limão redefiniu o marketing da cultura pop",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 56).toISOString(),
            description: "Álbum de remixes com participações estelares mantém a era em alta e inspira campanhas, pistas e tendências ao redor do planeta.",
            source: "Cultura Pop",
            tag: "Fenômeno"
        },
        {
            title: "Billie Eilish celebra turnê 'Hit Me Hard and Soft' com cenografia sustentável pioneira",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 70).toISOString(),
            description: "Artista reduz em 70% a pegada de carbono em estádios e arenas, estabelecendo novo padrão de responsabilidade ecológica para o entretenimento ao vivo.",
            source: "G1 Música",
            tag: "Ao Vivo"
        },
        {
            title: "Tyler, The Creator confirma aclamação com 'CHROMAKOPIA' e lidera rankings de crítica",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 85).toISOString(),
            description: "Com produção meticulosa e letras confessionais, trabalho entra para a lista de melhores discos do ano em dezenas de publicações especializadas.",
            source: "Pitchfork & NME",
            tag: "Crítica"
        },
        {
            title: "Música brasileira em ascensão: MPB contemporânea e funk dominam festivais na Europa",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 100).toISOString(),
            description: "Artistas brasileiros levam sonoridades autênticas para palcos de Lisboa, Londres, Paris e Berlim com ingressos completamente esgotados.",
            source: "Indústria Musical",
            tag: "Nacional"
        },
        {
            title: "Inteligência artificial na produção musical: produtores debatem ética e inovação nos estúdios",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 115).toISOString(),
            description: "Novas ferramentas auxiliam em mixagem e masterização, mas proteção aos direitos de voz dos intérpretes ganha foco nas cortes internacionais.",
            source: "Tech & Sound",
            tag: "Tecnologia"
        },
        {
            title: "Lady Gaga prepara retorno apoteótico às pistas de dança com nova sonoridade eletrônica",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 130).toISOString(),
            description: "Retorno da Mother Monster às raízes do electro-pop e dark techno mobiliza milhões de ouvintes ansiosos pela nova era musical.",
            source: "Billboard Brasil",
            tag: "Pop"
        },
        {
            title: "Streaming de áudio de alta resolução (Hi-Res Lossless): o diferencial para os amantes de música",
            link: "https://g1.globo.com/pop-arte/musica/",
            pubDate: new Date(Date.now() - 3600000 * 150).toISOString(),
            description: "Formatos FLAC e áudio espacial ganham espaço definitivo; especialistas explicam as reais nuances que transformam a experiência do catálogo.",
            source: "SoundBPM Lab",
            tag: "Audiófilo"
        }
    ];

    let allNewsItems = [...defaultMusicNews];
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
            const itemsToDisplay = allNewsItems.slice(0, limit);
            newsContainer.innerHTML = itemsToDisplay.map(item => {
                const date = new Date(item.pubDate);
                const dataFormatada = isNaN(date.getDate()) ? 'Hoje' : `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
                const tag = item.tag || 'News';
                const source = item.source || 'G1 Música';
                const snippet = (item.description || '').replace(/<[^>]+>/g, '').substring(0, 115) + '...';
                return `
                <article class="news-card">
                    <div class="news-tag">${tag}</div>
                    <h3><a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${item.title}</a></h3>
                    <p class="news-snippet">${snippet}</p>
                    <div class="news-meta">
                        <span>${dataFormatada}</span>
                        <span>${source}</span>
                    </div>
                </article>
                `;
            }).join('');
        }

        if (newsContainer) {
            // Renderiza imediatamente com os itens pré-carregados
            renderNewsList(showingAllNews ? allNewsItems.length : 3);

            // Configura o botão de alternar visualização (sempre ativo e funcional)
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

            // Tenta buscar atualizações do feed RSS em segundo plano
            (async () => {
                try {
                    const rssUrl = "https://g1.globo.com/rss/g1/pop-arte/musica/";
                    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 4000);
                    const response = await fetch(apiUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    const data = await response.json();

                    if (data.status === "ok" && data.items && data.items.length > 0) {
                        const rssMapped = data.items.map(item => ({
                            title: item.title,
                            link: item.link || "https://g1.globo.com/pop-arte/musica/",
                            pubDate: item.pubDate,
                            description: item.description || '',
                            source: 'G1 Música',
                            tag: 'G1'
                        }));
                        const existingTitles = new Set(rssMapped.map(i => i.title.toLowerCase().trim()));
                        const remainingDefaults = defaultMusicNews.filter(d => !existingTitles.has(d.title.toLowerCase().trim()));
                        allNewsItems = [...rssMapped, ...remainingDefaults];

                        renderNewsList(showingAllNews ? allNewsItems.length : 3);

                        const currentBtn = document.getElementById("view-all-news-link");
                        if (currentBtn && !showingAllNews) {
                            currentBtn.textContent = `Ver todas as notícias (${allNewsItems.length}) →`;
                        }
                    }
                } catch(err) {
                    console.log("Notícias RSS locais ativas:", err.message);
                }
            })();
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
                    console.error("Erro no upload da foto:", upErr);
                    alert("Erro ao fazer upload da foto: " + upErr.message);
                }
            }

            const bannerFile = document.getElementById("edit-profile-banner")?.files[0];
            if (bannerFile) {
                const bExt = bannerFile.name.split(".").pop() || "jpg";
                const bPath = `banner-${session.user.id}-${Date.now()}.${bExt}`;
                const { error: bErr } = await supabase.storage
                    .from("avatars").upload(bPath, bannerFile, { upsert: true });
                if (!bErr) {
                    const { data: bPub } = supabase.storage.from("avatars").getPublicUrl(bPath);
                    if (bPub?.publicUrl) {
                        updatedFields.banner_url = bPub.publicUrl;
                        const savedPos = JSON.parse(localStorage.getItem(`soundbpm_banner_pos_${session.user.id}`) || '{"y":50,"scale":100,"height":220}');
                        updatedFields.banner_pos = JSON.stringify(savedPos);
                        localStorage.setItem(`soundbpm_banner_${session.user.id}`, JSON.stringify({ url: bPub.publicUrl, pos: savedPos }));
                    }
                } else {
                    console.error("Erro no upload do banner:", bErr);
                }
            }

            let { error } = await supabase.from("profiles").upsert([updatedFields]);
            if (error && (error.message.includes("banner_url") || error.message.includes("banner_pos"))) {
                const { banner_url, banner_pos, ...safeFields } = updatedFields;
                const retry = await supabase.from("profiles").upsert([safeFields]);
                error = retry.error;
            }

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

    const starSelector = document.getElementById("star-rating-selector");
    const ratingValueInput = document.getElementById("review-rating-value");
    
    function renderGeneralStars(val) {
        if (!starSelector) return;
        starSelector.innerHTML = "";
        starSelector.style.letterSpacing = "2px";
        
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
            const { data, error } = await supabase.functions.invoke('spotify-search', {
                body: { albumId: collectionId }
            });

            if (error || !data) {
                throw new Error("Erro ao carregar faixas");
            }

            const songs = data.items || [];
            currentTracksData = songs.map(s => ({ name: s.name, rating: 5 }));

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
                if (typeof loadUserProfile === 'function') loadUserProfile();
            }
        });
    }

    document.addEventListener("click", (e) => {
        const link = e.target.closest("a");
        if (link && link.getAttribute("href")) {
            const href = link.getAttribute("href");
            if (href.startsWith("#") && href.length > 1) {
                const targetId = href.substring(1);
                const homeSectionsList = ["explore", "trending", "news", "upcoming", "community"];
                
                if (homeSectionsList.includes(targetId)) {
                    e.preventDefault();
                    navigateTo("home");
                    setTimeout(() => {
                        const targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            targetEl.scrollIntoView({ behavior: "smooth" });
                        }
                    }, 50);
                }
            }
        }
    });

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

    const navPeopleLink = document.getElementById("nav-people-link");
    if (navPeopleLink) {
        navPeopleLink.addEventListener("click", (e) => {
            e.preventDefault();
            navigateTo("people-page");
            loadPeoplePage();
        });
    }

    const bellWrap  = document.getElementById("notification-bell-wrap");
    const bellBtn   = document.getElementById("notification-bell");
    const notifPanel = document.getElementById("notifications-panel");
    const markAllBtn = document.getElementById("mark-all-read-btn");

    async function loadNotifications() {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        if (bellWrap) bellWrap.style.display = "flex";

        const { data: notifs } = await supabase
            .from("notifications")
            .select("*, from_user:from_user_id(username, avatar_url)")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(20);

        if (!notifs) return;

        const unread = notifs.filter(n => !n.read).length;
        const badge = document.getElementById("notification-badge");
        if (badge) {
            if (unread > 0) {
                badge.textContent = unread > 9 ? "9+" : unread;
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }

        const list = document.getElementById("notifications-list");
        if (!list) return;
        if (notifs.length === 0) {
            list.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 1rem;">Nenhuma notificação.</p>`;
            return;
        }

        list.innerHTML = notifs.map(n => {
            const avatar = n.from_user?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=40&h=40&fit=crop&crop=faces";
            const time = new Date(n.created_at).toLocaleDateString("pt-BR");
            const unreadStyle = n.read ? "" : "background: rgba(212,175,55,0.07); border-left: 3px solid var(--accent-gold);";
            return `
            <div style="display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.75rem; border-radius: 6px; margin-bottom: 0.5rem; ${unreadStyle}">
                <img src="${avatar}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; flex-shrink:0;">
                <div style="flex: 1;">
                    <p style="margin: 0 0 0.2rem 0; font-size: 0.9rem;">${n.message}</p>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${time}</span>
                </div>
                ${n.type === "friend_request" && !n.read ? `<button class="btn-notify" onclick="acceptFriendRequest('${n.from_user_id}', '${n.id}')" style="font-size:0.75rem; padding:0.3rem 0.6rem; flex-shrink:0;">Aceitar</button>` : ""}
            </div>`;
        }).join("");
    }

    if (bellBtn && notifPanel) {
        bellBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = notifPanel.style.display !== "none";
            notifPanel.style.display = isOpen ? "none" : "block";
            if (!isOpen) loadNotifications();
        });
        document.addEventListener("click", (e) => {
            if (!notifPanel.contains(e.target) && e.target !== bellBtn) {
                notifPanel.style.display = "none";
            }
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener("click", async () => {
            if (!supabase) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            await supabase.from("notifications").update({ read: true }).eq("user_id", session.user.id);
            loadNotifications();
        });
    }

    async function loadPeoplePage() {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const myId = session.user.id;

        const { data: friendships } = await supabase
            .from("friendships")
            .select("*, requester:requester_id(id, username, avatar_url), addressee:addressee_id(id, username, avatar_url)")
            .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
            .eq("status", "accepted");

        const friendsList = document.getElementById("friends-list");
        if (friendsList) {
            if (friendships && friendships.length > 0) {
                const uniqueFriendsMap = new Map();
                friendships.forEach(f => {
                    const friend = f.requester_id === myId ? f.addressee : f.requester;
                    if (friend && !uniqueFriendsMap.has(friend.id)) {
                        uniqueFriendsMap.set(friend.id, { friendshipId: f.id, friend });
                    }
                });

                friendsList.innerHTML = Array.from(uniqueFriendsMap.values()).map(({ friendshipId, friend }) => {
                    const avatar = friend?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&h=60&fit=crop&crop=faces";
                    return `
                    <div style="display: flex; gap: 1rem; align-items: center; background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle); cursor: pointer;" onclick="openUserProfile('${friend?.id}')">
                        <img src="${avatar}" style="width:52px; height:52px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1;">
                            <strong style="color: var(--accent-gold);">${friend?.username || "Usuário"}</strong>
                        </div>
                        <button class="btn-secondary-dark" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="event.stopPropagation(); removeFriend('${friendshipId}')">Remover</button>
                    </div>`;
                }).join("");
            } else {
                friendsList.innerHTML = `<p style="color: var(--text-muted);">Você ainda não tem amigos. Busque por usuários acima!</p>`;
            }
        }

        const { data: requests } = await supabase
            .from("friendships")
            .select("*, requester:requester_id(id, username, avatar_url)")
            .eq("addressee_id", myId)
            .eq("status", "pending");

        const reqList = document.getElementById("friend-requests-list");
        if (reqList) {
            if (requests && requests.length > 0) {
                reqList.innerHTML = requests.map(r => {
                    const avatar = r.requester?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=52&h=52&fit=crop&crop=faces";
                    return `
                    <div style="display: flex; gap: 1rem; align-items: center; background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid #e74c3c33;">
                        <img src="${avatar}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; cursor: pointer;" onclick="openUserProfile('${r.requester?.id}')">
                        <div style="flex:1;">
                            <strong style="color: var(--accent-gold); cursor: pointer;" onclick="openUserProfile('${r.requester?.id}')">${r.requester?.username || "Usuário"}</strong>
                            <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0.2rem 0 0 0;">Quer ser seu amigo</p>
                        </div>
                        <button class="btn-primary-gold" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="acceptFriendRequest('${r.requester_id}', null, '${r.id}')">Aceitar</button>
                        <button class="btn-secondary-dark" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="rejectFriendRequest('${r.id}')">Recusar</button>
                    </div>`;
                }).join("");
            } else {
                reqList.innerHTML = `<p style="color: var(--text-muted);">Nenhum pedido pendente.</p>`;
            }
        }
    }

    const peopleSearch = document.getElementById("people-search-input");
    if (peopleSearch) {
        let searchTimeout;
        peopleSearch.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            const resultsDiv = document.getElementById("people-search-results");
            if (!query) { if (resultsDiv) resultsDiv.innerHTML = ""; return; }

            searchTimeout = setTimeout(async () => {
                if (!supabase) return;
                const { data: { session } } = await supabase.auth.getSession();
                const myId = session?.user?.id;

                const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, username, avatar_url, bio")
                    .ilike("username", `%${query}%`)
                    .limit(8);

                const { data: rels } = myId ? await supabase.from("friendships").select("requester_id, addressee_id, status").or(`requester_id.eq.${myId},addressee_id.eq.${myId}`) : { data: [] };
                const relMap = new Map((rels || []).map(r => [r.requester_id === myId ? r.addressee_id : r.requester_id, r.status]));
                if (!resultsDiv) return;
                if (!profiles || profiles.length === 0) {
                    resultsDiv.innerHTML = `<p style="color: var(--text-muted);">Nenhum usuário encontrado.</p>`;
                    return;
                }

                resultsDiv.innerHTML = profiles.map(p => {
                    if (p.id === myId) return "";
                    const avatar = p.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=52&h=52&fit=crop&crop=faces";
                    return `
                    <div style="display: flex; gap: 1rem; align-items: center; background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle); cursor: pointer;" onclick="openUserProfile('${p.id}')">
                        <img src="${avatar}" style="width:52px; height:52px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1;">
                            <strong style="color: var(--accent-gold);">${p.username || "Usuário"}</strong>
                            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.15rem 0 0 0;">${p.bio || ""}</p>
                        </div>
                        ${relMap.get(p.id) === "accepted" ? '<span style="color: var(--accent-gold); font-size:0.8rem; font-weight:700;">✓ Amigos</span>' : relMap.get(p.id) === "pending" ? '<span style="color: var(--text-muted); font-size:0.8rem;">Pendente</span>' : `<button class="btn-notify" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="event.stopPropagation(); sendFriendRequest('${p.id}', this)">+ Adicionar</button>`}
                    </div>`;
                }).join("");
            }, 400);
        });
    }

    window.sendFriendRequest = async function(targetId, btn) {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { alert("Você precisa estar logado."); return; }

        const myId = session.user.id;

        const { data: existing } = await supabase
            .from("friendships")
            .select("*")
            .or(`and(requester_id.eq.${myId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${myId})`);

        if (existing && existing.length > 0) {
            alert("Já existe uma amizade ou pedido pendente com este usuário.");
            if (btn) { btn.textContent = "Já Adicionado"; btn.disabled = true; }
            return;
        }

        const { error } = await supabase.from("friendships").insert([{
            requester_id: myId,
            addressee_id: targetId,
            status: "pending"
        }]);

        if (error) {
            alert("Erro: " + error.message);
            return;
        }

        const { data: myProfile } = await supabase
            .from("profiles").select("username").eq("id", myId).single();

        await supabase.from("notifications").insert([{
            user_id: targetId,
            from_user_id: myId,
            type: "friend_request",
            message: `${myProfile?.username || "Alguém"} enviou um pedido de amizade para você.`
        }]);

        if (btn) { btn.textContent = "Pedido Enviado ✓"; btn.disabled = true; }
    };

    window.acceptFriendRequest = async function(fromUserId, notifId, friendshipId) {
        if (!supabase) return;

        if (friendshipId) {
            await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
        } else {
            const { data: { session } } = await supabase.auth.getSession();
            await supabase.from("friendships")
                .update({ status: "accepted" })
                .eq("requester_id", fromUserId)
                .eq("addressee_id", session.user.id);
        }

        if (notifId) {
            await supabase.from("notifications").update({ read: true }).eq("id", notifId);
        }

        loadNotifications();
        loadPeoplePage();
    };

    window.rejectFriendRequest = async function(friendshipId) {
        if (!supabase) return;
        await supabase.from("friendships").delete().eq("id", friendshipId);
        loadPeoplePage();
    };

    window.removeFriend = async function(friendshipId) {
        if (!supabase) return;
        if (!confirm("Remover este amigo?")) return;
        await supabase.from("friendships").delete().eq("id", friendshipId);
        loadPeoplePage();
    };

    (async () => {
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) loadNotifications();
        }
    })();

    window.shareToInstagramStory = async function(albumName, artistName, coverUrl, rating, reviewText) {
        if (typeof html2canvas === 'undefined') {
            alert("A biblioteca html2canvas não carregou corretamente. Verifique o seu HTML.");
            return;
        }

        const localUser = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
        const username = localUser.username || "Usuário";
        const avatar = localUser.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces";
        const starsStr = "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));

        const card = document.createElement("div");
        card.style.position = "absolute";
        card.style.left = "-9999px";
        card.style.width = "1080px";
        card.style.height = "1920px";
        card.style.background = "linear-gradient(145deg, #121212, #1e1e1e)";
        card.style.color = "#fff";
        card.style.fontFamily = "sans-serif";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.alignItems = "center";
        card.style.justifyContent = "center";
        card.style.padding = "80px";
        card.style.boxSizing = "border-box";
        card.style.borderRadius = "40px";

        card.innerHTML = `
            <div style="position: absolute; top:0; left:0; width:100%; height:100%; background: url('${coverUrl}') center/cover; filter: blur(80px); opacity: 0.3; z-index: 1;"></div>
            
            <div style="z-index: 2; display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; max-width: 900px; background: rgba(0,0,0,0.6); padding: 60px; border-radius: 40px; border: 2px solid rgba(255,255,255,0.1);">
                
                <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 50px;">
                    <img src="${avatar}" crossorigin="anonymous" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 4px solid #D4AF37;">
                    <span style="font-size: 40px; font-weight: bold; color: #D4AF37;">${username}</span>
                    <span style="font-size: 35px; color: #aaa;">ouviu e avaliou:</span>
                </div>

                <img src="${coverUrl}" crossorigin="anonymous" style="width: 500px; height: 500px; border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); margin-bottom: 40px;">
                
                <h1 style="font-size: 60px; margin: 0 0 10px 0; line-height: 1.1;">${albumName}</h1>
                <h2 style="font-size: 40px; color: #ccc; margin: 0 0 40px 0; font-weight: normal;">${artistName}</h2>
                
                <div style="font-size: 70px; color: #ff9800; margin-bottom: 40px; letter-spacing: 10px;">${starsStr}</div>
                
                <p style="font-size: 35px; line-height: 1.4; font-style: italic; color: #ddd; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden;">"${reviewText || 'Sem texto na resenha.'}"</p>
                
            </div>

            <div style="position: absolute; bottom: 80px; z-index: 2; text-align: center;">
                <div style="font-size: 30px; font-weight: bold; letter-spacing: 5px; color: #D4AF37;">SOUNDBPM</div>
            </div>
        `;

        document.body.appendChild(card);

        try {
            const loadingMsg = document.createElement('div');
            loadingMsg.id = 'share-loading';
            loadingMsg.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--accent-gold); color:#000; padding:10px 20px; border-radius:20px; z-index:9999; font-weight:bold;";
            loadingMsg.innerText = "Gerando imagem para o Instagram...";
            document.body.appendChild(loadingMsg);

            const canvas = await html2canvas(card, {
                useCORS: true,
                allowTaint: false,
                scale: 2,
                backgroundColor: "#121212"
            });

            document.body.removeChild(loadingMsg);

            canvas.toBlob(async (blob) => {
                const file = new File([blob], `soundbpm_${albumName.replace(/\s+/g, '_')}.png`, { type: "image/png" });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Resenha no SoundBPM',
                            text: `A minha avaliação de ${albumName} no SoundBPM!`
                        });
                    } catch (err) {
                        console.log("Compartilhamento cancelado ou falhou", err);
                    }
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = file.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    alert("Imagem baixada! Agora você pode postar nos seus Stories.");
                }
            }, "image/png", 1.0);

        } catch (error) {
            console.error("Erro ao gerar a imagem: ", error);
            alert("Não foi possível gerar a imagem. Confira se a capa do álbum permite compartilhamento (CORS).");
            if (document.getElementById('share-loading')) document.getElementById('share-loading').remove();
        } finally {
            document.body.removeChild(card);
        }
    };

    const GAME_TIERS = [
        { min: 0,    name: "Ouvinte",   icon: "🎧" },
        { min: 100,  name: "Curioso",   icon: "🎵" },
        { min: 300,  name: "Crítico",   icon: "✍️" },
        { min: 700,  name: "Audiófilo", icon: "📀" },
        { min: 1500, name: "Lenda",    icon: "👑" }
    ];

    const GAME_BADGES = [
        { icon: "📝", name: "Primeira Resenha",  desc: "Publique sua 1ª resenha",        ok: s => s.reviews >= 1 },
        { icon: "🎙️", name: "Crítico Dedicado",  desc: "Publique 10 resenhas",            ok: s => s.reviews >= 10 },
        { icon: "🏆", name: "Crítico Veterano",  desc: "Publique 50 resenhas",            ok: s => s.reviews >= 50 },
        { icon: "📖", name: "Escritor",          desc: "5 resenhas com 100+ caracteres",  ok: s => s.longText >= 5 },
        { icon: "🎼", name: "Faixa a Faixa",     desc: "Avalie um álbum faixa a faixa",   ok: s => s.trackReviews >= 1 },
        { icon: "💛", name: "Colecionador",      desc: "Favorite 5 álbuns",                ok: s => s.favorites >= 5 },
        { icon: "💿", name: "Curador",           desc: "Favorite 20 álbuns",              ok: s => s.favorites >= 20 },
        { icon: "🔥", name: "Em Sequência",      desc: "Avalie em 3 dias seguidos",      ok: s => s.streak >= 3 },
        { icon: "⚡", name: "Maratonista",       desc: "Avalie em 7 dias seguidos",      ok: s => s.streak >= 7 },
        { icon: "🌟", name: "Presença Fiel",     desc: "7 dias de login seguidos",        ok: s => s.loginBest >= 7 },
        { icon: "🏠", name: "Residente",         desc: "30 dias de login seguidos",      ok: s => s.loginBest >= 30 }
    ];

    const TIER_TITLES  = ["Novato do Vinil", "Ouvido Curioso", "Pena Afiada", "Audiófilo de Respeito", "Lenda do Vinil"];
    const BADGE_TITLES = ["Estreante", "Voz da Crítica", "Mestre da Crítica", "Poeta das Resenhas", "Ouvido Clínico",
                         "Guardião de Discos", "Curador de Acervo", "Em Chamas", "Imparável", "Presença Fiel", "Morador do Estúdio"];
    const GAME_TITLES = [
        ...GAME_TIERS.map((t, i) => ({ name: TIER_TITLES[i], src: `Classificação ${t.name} (${t.min} XP)`, tier: true, ok: s => s.xp >= t.min })),
        ...GAME_BADGES.map((b, i) => ({ name: BADGE_TITLES[i], src: `Conquista: ${b.name}`, ok: b.ok }))
    ];
    function resolveTitle(s, chosen) {
        const ok = GAME_TITLES.filter(t => t.ok(s));
        return (ok.find(t => t.name === chosen) || ok.filter(t => t.tier).pop()).name;
    }
    function liveStreak(p) {
        if (!p.last_checkin) return 0;
        return (Date.now() - new Date(p.last_checkin).getTime()) / 3600000 >= 44 ? 0 : (p.streak_count || 0);
    }
    function gameToast(msg) {
        const t = document.createElement("div");
        t.className = "game-toast"; t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add("hide"), 3500);
        setTimeout(() => t.remove(), 4000);
    }
    async function fetchProfilesGame() {
        let r = await supabase.from("profiles").select("id, username, avatar_url, title, streak_count, streak_best, last_checkin");
        if (r.error) r = await supabase.from("profiles").select("id, username, avatar_url");
        return r;
    }
    let localStreak = null;

    function gameStats(revs, favCount, login = {}) {
        const text = r => (r.review_text || "");
        const days = [...new Set(revs.map(r => new Date(r.created_at).toDateString()))]
            .map(d => new Date(d).getTime()).sort((a, b) => a - b);
        let streak = days.length ? 1 : 0, run = 1;
        for (let i = 1; i < days.length; i++) {
            run = Math.round((days[i] - days[i - 1]) / 86400000) === 1 ? run + 1 : 1;
            streak = Math.max(streak, run);
        }
        const s = {
            reviews: revs.length,
            withText: revs.filter(r => text(r).replace(/\[Avaliação Faixa a Faixa\][\s\S]*?\n\n/, "").trim().length >= 50).length,
            longText: revs.filter(r => text(r).length >= 100).length,
            trackReviews: revs.filter(r => text(r).startsWith("[Avaliação Faixa a Faixa]")).length,
            favorites: favCount,
            streak,
            loginBest: login.best || 0,
            loginNow: login.now || 0
        };
        s.xp = s.reviews * 10 + s.withText * 5 + s.favorites * 3;
        s.badges = GAME_BADGES.filter(b => b.ok(s)).length;
        const idx = GAME_TIERS.reduce((acc, t, i) => (s.xp >= t.min ? i : acc), 0);
        s.tier = GAME_TIERS[idx];
        s.nextTier = GAME_TIERS[idx + 1] || null;
        return s;
    }

    let gameCache = null, gameCacheAt = 0;
    async function fetchGameData() {
        if (gameCache && Date.now() - gameCacheAt < 60000) return gameCache;
        if (!supabase) return [];
        const [rv, fv, pf] = await Promise.all([
            supabase.from("reviews").select("user_id, review_text, created_at"),
            supabase.from("favorites").select("user_id"),
            fetchProfilesGame()
        ]);
        const map = new Map();
        const entry = id => { if (!map.has(id)) map.set(id, { revs: [], favs: 0 }); return map.get(id); };
        (rv.data || []).forEach(r => entry(r.user_id).revs.push(r));
        (fv.data || []).forEach(f => entry(f.user_id).favs++);
        const profiles = new Map((pf.data || []).map(p => [p.id, p]));
        (pf.data || []).forEach(p => entry(p.id));
        gameCache = [...map.entries()].map(([id, v]) => {
            const p = profiles.get(id) || {};
            if (localStreak && localStreak.id === id && !("streak_count" in p)) Object.assign(p, localStreak);
            if (!("title" in p)) { try { p.title = localStorage.getItem("sb_title_" + id) || null; } catch (e) {} }
            const now = liveStreak(p);
            const st = gameStats(v.revs, v.favs, { best: Math.max(p.streak_best || 0, now), now });
            st.title = resolveTitle(st, p.title);
            return { id, profile: p, stats: st };
        });
        gameCacheAt = Date.now();
        return gameCache;
    }

    async function equipTitle(name) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { error } = await supabase.from("profiles").update({ title: name }).eq("id", session.user.id);
        if (error) localStorage.setItem("sb_title_" + session.user.id, name);
        gameCache = null;
        renderProfileGamification(session.user.id);
        gameToast(error ? "Título equipado (salvo só neste navegador)" : "Título equipado: " + name);
    }

    function notifyNewTitles(userId, unlocked) {
        const key = "sb_titles_" + userId;
        const names = unlocked.map(t => t.name);
        let seen = null;
        try { seen = JSON.parse(localStorage.getItem(key)); } catch (e) {}
        if (seen) {
            const fresh = names.filter(n => !seen.includes(n));
            if (fresh.length) gameToast("🏅 Novo título desbloqueado: " + fresh[fresh.length - 1]);
        }
        localStorage.setItem(key, JSON.stringify(names));
    }

    async function renderProfileGamification(userId) {
        const box = document.getElementById("profile-gamification");
        if (!box || !userId) return;
        const users = await fetchGameData();
        const found = users.find(u => u.id === userId);
        const s = found ? found.stats : gameStats([], 0);
        const p = found ? found.profile : {};
        if (!found) s.title = resolveTitle(s, null);
        const { data: { session } } = await supabase.auth.getSession();
        const mine = session?.user?.id === userId;

        const base = s.tier.min;
        const pct = s.nextTier ? Math.min(100, Math.round(((s.xp - base) / (s.nextTier.min - base)) * 100)) : 100;
        let hint = s.nextTier ? `Faltam ${s.nextTier.min - s.xp} XP para ${s.nextTier.icon} ${s.nextTier.name}` : "Classificação máxima alcançada!";
        if (mine && p.last_checkin) {
            const rem = 20 - (Date.now() - new Date(p.last_checkin).getTime()) / 3600000;
            if (rem > 0) hint += ` • Próximo dia da sequência em ${Math.floor(rem)}h ${Math.floor((rem % 1) * 60)}min`;
        }

        const line = document.getElementById("profile-title-line");
        if (line) line.innerHTML = `<span class="title-chip">🏅 ${gameEsc(s.title)}</span>` +
            (s.loginNow ? `<span class="streak-chip">🔥 ${s.loginNow} dia${s.loginNow === 1 ? "" : "s"}</span>` : "");

        const unlocked = GAME_TITLES.filter(t => t.ok(s));
        box.innerHTML = `
            <div class="game-tier-card">
                <div class="game-tier-top">
                    <span class="game-tier-icon">${s.tier.icon}</span>
                    <div>
                        <div class="game-tier-name">${s.tier.name}</div>
                        <div class="game-tier-xp">${s.xp} XP • ${s.reviews} resenha${s.reviews === 1 ? "" : "s"} • ${s.favorites} favorito${s.favorites === 1 ? "" : "s"} • 🔥 ${s.loginNow} dia${s.loginNow === 1 ? "" : "s"} de login (recorde ${s.loginBest})</div>
                    </div>
                </div>
                <div class="game-xp-bar"><div class="game-xp-fill" style="width: ${pct}%;"></div></div>
                <div class="game-xp-hint">${hint}</div>
            </div>
            <div class="badge-grid">
                ${GAME_BADGES.map(b => `
                    <div class="badge-item ${b.ok(s) ? "" : "locked"}">
                        <span class="badge-icon">${b.icon}</span>
                        <span class="badge-name">${b.name}</span>
                        <span class="badge-desc">${b.desc}</span>
                    </div>`).join("")}
            </div>
            <h4 class="game-subtitle">Títulos (${unlocked.length}/${GAME_TITLES.length})</h4>
            <div class="badge-grid">
                ${GAME_TITLES.map(t => {
                    const ok = t.ok(s), eq = t.name === s.title;
                    return `<div class="badge-item title-item ${ok ? "unlocked" : "locked"} ${eq ? "equipped" : ""} ${ok && mine ? "clickable" : ""}" data-title="${gameEsc(t.name)}">
                        <span class="badge-name">🏅 ${gameEsc(t.name)}</span>
                        <span class="badge-desc">${ok ? (eq ? "Equipado" : (mine ? "Clique para equipar" : "Desbloqueado")) : gameEsc(t.src)}</span>
                    </div>`;
                }).join("")}
            </div>`;

        if (mine) {
            box.querySelectorAll(".title-item.clickable").forEach(el => el.addEventListener("click", () => equipTitle(el.dataset.title)));
            notifyNewTitles(userId, unlocked);
        }
    }

    let rankingSort = "xp";
    async function loadRankingPage() {
        const list = document.getElementById("ranking-list");
        if (!list) return;
        list.innerHTML = "<p style='color: var(--text-muted);'>Carregando ranking...</p>";

        const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: {} };
        const myId = session?.user?.id;
        const users = (await fetchGameData()).slice()
            .sort((a, b) => b.stats[rankingSort] - a.stats[rankingSort] || b.stats.xp - a.stats.xp)
            .slice(0, 50);

        if (users.length === 0) {
            list.innerHTML = `<div style="text-align: center; padding: 3rem; background: var(--bg-card); border-radius: 8px;">
                <p style="color: var(--text-muted);">Ninguém pontuou ainda. Avalie um álbum para abrir o ranking!</p></div>`;
            return;
        }

        const medals = ["🥇", "🥈", "🥉"];
        const unit = { xp: "XP", reviews: "resenhas", badges: "conquistas", loginNow: "dias" }[rankingSort];
        list.innerHTML = users.map((u, i) => {
            const avatar = u.profile.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&h=60&fit=crop&crop=faces";
            return `
            <div class="rank-row ${u.id === myId ? "me" : ""}" onclick="openUserProfile('${gameEsc(u.id)}')">
                <span class="rank-pos">${medals[i] || i + 1}</span>
                <img src="${gameEsc(avatar)}" alt="Avatar">
                <div class="rank-info">
                    <strong>${gameEsc(u.profile.username || "Usuário")}${u.id === myId ? " (você)" : ""}</strong>
                    <span>🏅 ${gameEsc(u.stats.title)} • ${u.stats.tier.icon} ${u.stats.tier.name}${u.stats.loginNow ? " • 🔥 " + u.stats.loginNow : ""}</span>
                </div>
                <span class="rank-score">${u.stats[rankingSort]} ${unit}</span>
            </div>`;
        }).join("");
    }

    document.querySelectorAll(".game-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".game-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            rankingSort = btn.dataset.sort;
            loadRankingPage();
        });
    });

    const navRankingLink = document.getElementById("nav-ranking-link");
    if (navRankingLink) {
        navRankingLink.addEventListener("click", (e) => {
            e.preventDefault();
            navigateTo("ranking-page");
            loadRankingPage();
        });
    }

    async function loginCheckIn(uid) {
        let st = null, dbOk = true;
        const r = await supabase.from("profiles").select("streak_count, streak_best, last_checkin").eq("id", uid).maybeSingle();
        if (r.error) { dbOk = false; try { st = JSON.parse(localStorage.getItem("sb_streak_" + uid)); } catch (e) {} } else st = r.data;
        st = st || {};
        const now = Date.now();
        const last = st.last_checkin ? new Date(st.last_checkin).getTime() : 0;
        const hrs = (now - last) / 3600000;
        if (last && hrs < 20) { if (!dbOk) localStreak = { id: uid, ...st }; return; }
        const count = (last && hrs < 44) ? (st.streak_count || 0) + 1 : 1;
        const next = { streak_count: count, streak_best: Math.max(st.streak_best || 0, count), last_checkin: new Date(now).toISOString() };
        if (dbOk) { const u = await supabase.from("profiles").update(next).eq("id", uid); if (u.error) dbOk = false; }
        if (!dbOk) { localStorage.setItem("sb_streak_" + uid, JSON.stringify(next)); localStreak = { id: uid, ...next }; }
        gameToast(count > 1 ? `🔥 Sequência de ${count} dias!` : "🔥 Sequência iniciada! Volte em 20 horas.");
        gameCache = null;
        renderProfileGamification(uid);
    }

    let checkedInUser = null;
    if (supabase) {
        supabase.auth.onAuthStateChange((_event, session) => {
            const uid = session?.user?.id;
            if (!uid) { checkedInUser = null; return; }
            if (checkedInUser !== uid) { checkedInUser = uid; setTimeout(() => loginCheckIn(uid), 0); }
        });
    }

    async function shareText(text) {
        const url = location.href.split("#")[0];
        try {
            if (navigator.share) { await navigator.share({ text, url }); return; }
            await navigator.clipboard.writeText(text + " " + url);
            gameToast("Texto copiado para compartilhar!");
        } catch (e) { /* compartilhamento cancelado */ }
    }

    function calcProfileStats(reviews, favs) {
        const n = reviews.length, num = r => Number(r.rating || 0);
        const avg = n ? reviews.reduce((a, r) => a + num(r), 0) / n : 0;
        const dist = {}, artists = {};
        reviews.forEach(r => {
            const k = num(r).toFixed(1); dist[k] = (dist[k] || 0) + 1;
            if (r.artist_name) artists[r.artist_name] = (artists[r.artist_name] || 0) + 1;
        });
        const favNames = new Set(favs.map(f => f.album_name));
        const best = [...reviews].sort((a, b) => num(b) - num(a) || (favNames.has(b.album_name) - favNames.has(a.album_name)) || new Date(b.created_at) - new Date(a.created_at))[0];
        return { n, avg, dist, best, topArtist: Object.entries(artists).sort((a, b) => b[1] - a[1])[0] };
    }

    const fmtDateBR = d => d ? new Date(d).toLocaleDateString("pt-BR") : "";

    async function renderProfileExtras(ctx) {
        const { userId, myId, mine, name, reviews, favs } = ctx;
        const st = calcProfileStats(reviews, favs);

        const { data: fr } = await supabase.from("friendships").select("id, requester_id, addressee_id, status")
            .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
        const accepted = (fr || []).filter(f => f.status === "accepted");
        const friendIds = new Set(accepted.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id));
        const rel = (fr || []).find(f => f.requester_id === myId || f.addressee_id === myId);

        const box = document.getElementById("profile-stats");
        if (box) {
            const keys = ["0.5", "1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0"];
            const max = Math.max(1, ...Object.values(st.dist));
            const card = (v, l) => `<div class="stat-card"><span class="stat-value">${v}</span><span class="stat-label">${l}</span></div>`;
            box.innerHTML = st.n === 0
                ? `<p style="color: var(--text-muted);">Nenhuma estatística ainda. Avalie um álbum para começar!</p>`
                : `<div class="badge-grid">
                    ${st.best ? `<div class="stat-card stat-fav"><img src="${gameEsc(st.best.cover_url)}" alt="Capa">
                        <div><span class="stat-label">Álbum favorito</span><div class="stat-value" style="font-size:1.1rem;">${gameEsc(st.best.album_name)}</div>
                        <span class="stat-label">${gameEsc(st.best.artist_name)} • nota ${st.best.rating}</span></div></div>` : ""}
                    ${card(st.n, "resenhas")}${card(st.avg.toFixed(2), "média das notas")}${card(favs.length, "favoritos")}${card(friendIds.size, "amigos")}
                    ${st.topArtist ? card(gameEsc(st.topArtist[0]), `artista mais avaliado (${st.topArtist[1]}x)`) : ""}
                   </div>
                   <div class="dist-row">${keys.map(k => `<div class="dist-col" title="${k}★: ${st.dist[k] || 0}"><div class="dist-bar" style="height:${((st.dist[k] || 0) / max) * 80}%"></div><span>${k}</span></div>`).join("")}</div>`;
        }

        const feed = [
            ...reviews.map(r => ({ icon: "⭐", date: r.created_at, album: r.album_name, artist: r.artist_name, txt: `avaliou com ${r.rating}★` })),
            ...favs.filter(f => f.created_at).map(f => ({ icon: "💛", date: f.created_at, album: f.album_name, artist: f.artist_name, txt: "favoritou" }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
        const act = document.getElementById("profile-activity");
        if (act) {
            act.innerHTML = feed.length ? feed.map((a, i) => `<div class="activity-item"><span style="font-size:1.3rem;">${a.icon}</span>
                <div class="activity-body"><strong>${gameEsc(name)}</strong> ${gameEsc(a.txt)} <em>${gameEsc(a.album)}</em><span class="activity-date">${gameEsc(a.artist)} • ${fmtDateBR(a.date)}</span></div>
                <button class="activity-share" data-i="${i}" title="Compartilhar">🔗</button></div>`).join("")
                : `<p style="color: var(--text-muted);">Nenhuma atividade ainda.</p>`;
            act.querySelectorAll(".activity-share").forEach(b => b.addEventListener("click", () => {
                const a = feed[b.dataset.i];
                shareText(`${name} ${a.txt} "${a.album}" de ${a.artist} no SoundBPM 🎵`);
            }));
        }

        const actions = document.getElementById("profile-actions");
        if (!actions) return;
        actions.innerHTML = `<span class="title-chip">👥 ${friendIds.size} amigo${friendIds.size === 1 ? "" : "s"}</span>`;
        const add = (label, cls, fn, disabled) => {
            const b = document.createElement("button");
            b.className = cls; b.textContent = label; b.style.cssText = "font-size:0.8rem; padding:0.4rem 0.9rem;";
            if (disabled) b.disabled = true; else b.addEventListener("click", fn);
            actions.appendChild(b);
        };
        if (!mine && myId) {
            if (!rel) add("+ Adicionar amigo", "btn-notify", async () => { await sendFriendRequest(userId, null); loadUserProfile(userId); });
            else if (rel.status === "accepted") add("✓ Amigos • Desfazer", "btn-secondary-dark", async () => {
                if (!confirm(`Desfazer amizade com ${name}?`)) return;
                await supabase.from("friendships").delete().eq("id", rel.id);
                gameToast("Amizade desfeita.");
                loadUserProfile(userId);
            });
            else if (rel.requester_id === myId) add("Pedido enviado", "btn-secondary-dark", null, true);
            else add("Aceitar pedido", "btn-primary-gold", async () => { await acceptFriendRequest(rel.requester_id, null, rel.id); loadUserProfile(userId); });
        }
        add("🔗 Compartilhar perfil", "btn-secondary-dark", () =>
            shareText(`Perfil de ${name} no SoundBPM: ${st.n} resenhas • média ${st.avg.toFixed(1)}★ • ${friendIds.size} amigos 🎵`));
    }

    // ═══════════════ v0.10 SMOOTH: tema, magnético, scroll reveal e painéis ═══════════════
    const fxReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- Alternância de tema claro/escuro (lembra a escolha; padrão = escuro) ----
    (function initTheme() {
        const root = document.documentElement, btn = document.getElementById("theme-toggle");
        if (!btn) return;
        const sync = () => btn.setAttribute("aria-pressed", root.getAttribute("data-theme") === "light");
        sync();
        let t = null;
        btn.addEventListener("click", () => {
            const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
            root.classList.add("theme-anim");
            if (next === "light") root.setAttribute("data-theme", "light"); else root.removeAttribute("data-theme");
            try { localStorage.setItem("soundbpm_theme", next); } catch (e) {}
            sync();
            clearTimeout(t);
            t = setTimeout(() => root.classList.remove("theme-anim"), 700);
        });
    })();

    // ---- Botões magnéticos: o botão é atraído suavemente pelo cursor ----
    (function initMagnetic() {
        if (fxReduceMotion || window.matchMedia("(hover: none)").matches) return;
        const SEL = ".btn-primary-gold, .btn-secondary-dark, .btn-login-nav, .btn-notify, .theme-toggle, [data-magnetic]";
        const RADIUS = 80, PULL = 0.32, MAX = 12;
        const state = new WeakMap();
        let mx = -9999, my = -9999, raf = null;

        function frame() {
            let busy = false;
            document.querySelectorAll(SEL).forEach(el => {
                const r = el.getBoundingClientRect();
                if (!r.width) return;
                const s = state.get(el) || { x: 0, y: 0 };
                state.set(el, s);
                const dx = Math.max(r.left - mx, 0, mx - r.right), dy = Math.max(r.top - my, 0, my - r.bottom);
                let tx = 0, ty = 0;
                if (!el.disabled && Math.hypot(dx, dy) < RADIUS) {
                    tx = Math.max(-MAX, Math.min(MAX, (mx - (r.left + r.width / 2)) * PULL));
                    ty = Math.max(-MAX, Math.min(MAX, (my - (r.top + r.height / 2)) * PULL));
                }
                s.x += (tx - s.x) * 0.18;
                s.y += (ty - s.y) * 0.18;
                const settled = Math.abs(tx - s.x) < 0.05 && Math.abs(ty - s.y) < 0.05;
                if (settled && tx === 0 && ty === 0) { if (s.x || s.y) { s.x = s.y = 0; el.style.translate = ""; } return; }
                el.style.translate = `${s.x.toFixed(2)}px ${s.y.toFixed(2)}px`;
                if (!settled) busy = true;
            });
            raf = busy ? requestAnimationFrame(frame) : null;
        }
        const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
        document.addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; kick(); }, { passive: true });
        document.addEventListener("mouseleave", () => { mx = my = -9999; kick(); });
    })();

    // ---- Elementos surgindo na rolagem (fade + subida / deslize lateral / zoom) ----
    // Dica: qualquer elemento aceita data-reveal="up|left|right|zoom" para escolher o efeito.
    (function initScrollReveal() {
        if (fxReduceMotion || !("IntersectionObserver" in window)) return;
        const RULES = [
            ["main h2, main h3, .section-header-flex, .footer-col", "up"],
            [".poster-card, .news-card, .upcoming-card, .dash-block, .stat-card, .badge-item, .game-tier-card, .acc", "up"],
            [".diary-item, .activity-item, .rank-row", "alt"],
            ["section.section-container img", "zoom"],
            ["[data-reveal]", "attr"]
        ];
        const SKIP = ".hero-carousel-section, .site-header, .web-player, .modal-overlay, .find-bar";
        const io = new IntersectionObserver((entries) => {
            entries.filter(e => e.isIntersecting).forEach((e, i) => {
                const el = e.target, delay = Math.min(i, 8) * 70;
                io.unobserve(el);
                el.style.transitionDelay = delay + "ms";
                el.classList.add("sr-in");
                // Terminada a entrada, devolve o elemento ao CSS original (mantém hovers)
                setTimeout(() => { el.classList.remove("sr", "sr-up", "sr-left", "sr-right", "sr-zoom", "sr-in"); el.style.transitionDelay = ""; }, 1000 + delay);
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

        const scan = () => {
            RULES.forEach(([sel, kind]) => document.querySelectorAll(sel).forEach(el => {
                if (el.dataset.sr || el.closest(SKIP)) return;
                if (kind !== "attr" && el.parentElement && el.parentElement.closest("[data-sr]")) return;
                el.dataset.sr = "1";
                let dir = kind;
                if (kind === "attr") dir = el.dataset.reveal || "up";
                if (kind === "alt") dir = ([...el.parentElement.children].indexOf(el) % 2 === 0) ? "left" : "right";
                el.classList.add("sr", "sr-" + dir);
                io.observe(el);
            }));
        };
        new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        scan();
    })();

    // ---- Painéis expansíveis (FAQ, regras do XP) e menu do rodapé no celular ----
    document.addEventListener("click", (e) => {
        const head = e.target.closest(".acc-head");
        if (head) {
            const item = head.closest(".acc"), willOpen = !item.classList.contains("open");
            const group = item.closest("[data-acc-group]");
            if (group && willOpen) group.querySelectorAll(".acc.open").forEach(o => {
                o.classList.remove("open");
                o.querySelector(".acc-head").setAttribute("aria-expanded", "false");
            });
            item.classList.toggle("open", willOpen);
            head.setAttribute("aria-expanded", String(willOpen));
            return;
        }
        const foot = e.target.closest(".footer-col h4");
        if (foot) foot.parentElement.classList.toggle("open");
    });

    // ═══════════════ CORREÇÃO: dados do cadastro com confirmação de e-mail ═══════════════
    // Sem sessão (e-mail ainda não confirmado) não dá para gravar no banco nem subir a foto.
    // Por isso o apelido/bio vão na própria conta (signUp) e a foto fica guardada neste navegador;
    // no primeiro login com sessão válida o perfil é criado e a foto é enviada.
    function fileToDataURL(file) {
        return new Promise((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => resolve(null);
            r.readAsDataURL(file);
        });
    }

    async function savePendingSignup(email, username, avatarField) {
        let avatar = null;
        if (avatarField && avatarField.files && avatarField.files[0]) avatar = await fileToDataURL(avatarField.files[0]);
        try {
            localStorage.setItem("soundbpm_pending_" + email.toLowerCase(), JSON.stringify({ username, avatar }));
        } catch (e) { console.warn("Não foi possível guardar a foto pendente:", e); }
    }

    async function ensureProfileFromSignup(session) {
        try {
            const user = session.user, meta = user.user_metadata || {};
            const key = "soundbpm_pending_" + (user.email || "").toLowerCase();
            let pending = null;
            try { pending = JSON.parse(localStorage.getItem(key)); } catch (e) {}
            if (!meta.username && !pending) return;

            const { data: profile } = await supabase.from("profiles").select("username, bio, avatar_url").eq("id", user.id).maybeSingle();
            const emailPrefix = (user.email || "").split("@")[0];
            const fields = { id: user.id };

            if (!profile?.username || profile.username === emailPrefix) fields.username = meta.username || pending?.username;
            if (!profile?.bio) fields.bio = meta.bio || "Explorando o mundo da música.";
            if (!profile?.avatar_url && pending?.avatar) {
                const blob = await (await fetch(pending.avatar)).blob();
                const path = `${user.id}-${Date.now()}.jpg`;
                const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
                if (!upErr) fields.avatar_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
                else console.error("Erro ao enviar a foto do cadastro:", upErr);
            }
            if (Object.keys(fields).length > 1) {
                const { error } = await supabase.from("profiles").upsert([fields]);
                if (error) { console.error("Erro ao criar o perfil:", error); return; }
            }
            localStorage.removeItem(key);
        } catch (e) { console.error("ensureProfileFromSignup:", e); }
    }

    // ═══════════════ AJUSTE DE FOTO: dimensionar, posicionar e recortar o avatar ═══════════════
    function openAvatarCropper(file) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.onload = () => {
                const S = 260, OUT = 400;
                const cover = Math.max(S / img.width, S / img.height), contain = Math.min(S / img.width, S / img.height);
                const minScale = contain * 0.6, maxScale = cover * 3;
                let scale = cover, ox = 0, oy = 0, drag = null;

                const ov = document.createElement("div");
                ov.className = "crop-overlay";
                ov.innerHTML = `
                    <div class="crop-card" role="dialog" aria-label="Ajustar foto de perfil">
                        <strong>Ajustar foto de perfil</strong>
                        <p class="crop-hint">Arraste a imagem para posicionar e use o controle (ou a rodinha do mouse) para dimensionar.</p>
                        <div class="crop-stage"><canvas width="${OUT}" height="${OUT}"></canvas></div>
                        <div class="crop-zoom"><span>−</span><input type="range" class="crop-range" min="${minScale}" max="${maxScale}" step="0.001" value="${scale}" aria-label="Tamanho da imagem"><span>+</span></div>
                        <div class="crop-modes">
                            <button type="button" class="btn-secondary-dark" data-m="cover">Preencher</button>
                            <button type="button" class="btn-secondary-dark" data-m="contain">Imagem inteira</button>
                            <button type="button" class="btn-secondary-dark" data-m="reset">Centralizar</button>
                        </div>
                        <div class="crop-actions">
                            <button type="button" class="btn-secondary-dark crop-cancel">Cancelar</button>
                            <button type="button" class="btn-primary-gold crop-ok">Aplicar</button>
                        </div>
                    </div>`;
                const cv = ov.querySelector("canvas"), ctx = cv.getContext("2d"), range = ov.querySelector(".crop-range"), stage = ov.querySelector(".crop-stage");
                const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg-card").trim() || "#2c3440";

                const draw = () => {
                    const k = OUT / S, w = img.width * scale * k, h = img.height * scale * k;
                    ctx.fillStyle = bg; ctx.fillRect(0, 0, OUT, OUT);
                    ctx.drawImage(img, OUT / 2 + ox * k - w / 2, OUT / 2 + oy * k - h / 2, w, h);
                };
                const setScale = (v) => { scale = Math.min(maxScale, Math.max(minScale, v)); range.value = scale; draw(); };
                const clamp = (v) => Math.max(-S, Math.min(S, v));
                const close = (result) => { document.removeEventListener("keydown", onKey); ov.classList.remove("show"); setTimeout(() => ov.remove(), 250); URL.revokeObjectURL(url); resolve(result); };
                const onKey = (e) => { if (e.key === "Escape") close(null); };

                stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX - ox, y: e.clientY - oy }; stage.setPointerCapture(e.pointerId); stage.classList.add("dragging"); });
                stage.addEventListener("pointermove", (e) => { if (!drag) return; ox = clamp(e.clientX - drag.x); oy = clamp(e.clientY - drag.y); draw(); });
                ["pointerup", "pointercancel"].forEach(ev => stage.addEventListener(ev, () => { drag = null; stage.classList.remove("dragging"); }));
                stage.addEventListener("wheel", (e) => { e.preventDefault(); setScale(scale * (e.deltaY < 0 ? 1.06 : 0.94)); }, { passive: false });
                range.addEventListener("input", () => setScale(parseFloat(range.value)));
                ov.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
                    ox = oy = 0;
                    setScale(b.dataset.m === "contain" ? contain : cover);
                }));
                ov.querySelector(".crop-cancel").addEventListener("click", () => close(null));
                ov.addEventListener("click", (e) => { if (e.target === ov) close(null); });
                ov.querySelector(".crop-ok").addEventListener("click", () => {
                    cv.toBlob((blob) => close(blob ? new File([blob], "avatar.jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.9);
                });
                document.addEventListener("keydown", onKey);
                document.body.appendChild(ov);
                draw();
                requestAnimationFrame(() => ov.classList.add("show"));
            };
            img.src = url;
        });
    }

    // Liga o ajuste aos dois campos de foto (cadastro e editar perfil), sem mexer no código de envio:
    // o arquivo recortado substitui o escolhido dentro do próprio <input>.
    function wireAvatarInput(input) {
        if (!input) return;
        const box = document.createElement("div");
        box.className = "avatar-pick";
        box.innerHTML = `<img class="avatar-preview" alt="Prévia da foto" hidden><button type="button" class="btn-secondary-dark avatar-adjust" hidden>Ajustar foto</button>`;
        input.insertAdjacentElement("afterend", box);
        const prev = box.querySelector("img"), adj = box.querySelector("button");
        let original = null;
        const run = async (file) => {
            const out = await openAvatarCropper(file);
            if (!out) { input.value = ""; prev.hidden = adj.hidden = true; original = null; return; }
            const dt = new DataTransfer();
            dt.items.add(out);
            input.files = dt.files;
            prev.src = URL.createObjectURL(out);
            prev.hidden = adj.hidden = false;
        };
        input.addEventListener("change", () => { const f = input.files[0]; if (f) { original = f; run(f); } });
        adj.addEventListener("click", () => { if (original) run(original); });
    }
    wireAvatarInput(document.getElementById("auth-avatar"));
    wireAvatarInput(document.getElementById("edit-profile-avatar"));

    // ═══════════════ AJUSTE DE BANNER: dimensionar, posicionar e recortar o banner ═══════════════
    function openBannerCropper(fileOrUrl, initialPos = null) {
        return new Promise((resolve) => {
            const isFile = (fileOrUrl instanceof Blob || fileOrUrl instanceof File);
            const url = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
            const img = new Image();
            if (!isFile) img.crossOrigin = "anonymous";

            img.onerror = () => {
                if (isFile) URL.revokeObjectURL(url);
                alert("Não foi possível carregar a imagem do banner.");
                resolve(null);
            };

            img.onload = () => {
                const STAGE_W = 560; // Largura de referência do palco no diálogo
                let bannerHeight = initialPos?.height || 380; // Altura em pixels (300 - 520)
                let stageH = Math.round((bannerHeight / 380) * 230);
                const OUT_W = 1200;
                let OUT_H = Math.round((bannerHeight / 380) * 600);

                const cover = Math.max(STAGE_W / img.width, stageH / img.height);
                const contain = Math.min(STAGE_W / img.width, stageH / img.height);
                const minScale = contain * 0.5;
                const maxScale = cover * 3.5;

                let scale = initialPos?.scale ? (initialPos.scale / 100) * cover : cover;
                let ox = 0;
                let oy = initialPos?.y != null ? ((initialPos.y - 50) / 100) * (stageH - img.height * scale) : 0;
                let drag = null;

                const ov = document.createElement("div");
                ov.className = "crop-overlay";
                ov.innerHTML = `
                    <div class="crop-card crop-card-banner" role="dialog" aria-label="Ajustar e dimensionar banner">
                        <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
                            <strong style="font-size: 1.1rem; color: var(--accent-gold);">📐 Ajustar & Dimensionar Banner</strong>
                            <button type="button" class="btn-secondary-dark crop-close-x" style="padding: 0.2rem 0.6rem; font-size: 1.1rem; line-height: 1;">&times;</button>
                        </div>
                        <p class="crop-hint" style="margin: 0; font-size: 0.85rem;">Arraste a imagem para enquadrar. Use os controles para dimensionar o zoom e a altura da capa do perfil.</p>
                        
                        <div class="crop-stage-banner" style="height: ${stageH}px;"><canvas width="${OUT_W}" height="${OUT_H}"></canvas></div>
                        
                        <div class="banner-controls-row">
                            <div class="banner-control-item">
                                <label>🔍 Zoom / Escala</label>
                                <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                                    <span style="font-size: 0.8rem; color: var(--text-muted);">−</span>
                                    <input type="range" class="crop-range banner-zoom-range" min="${minScale}" max="${maxScale}" step="0.001" value="${scale}" style="flex: 1; accent-color: var(--accent-gold); cursor: pointer;">
                                    <span style="font-size: 0.8rem; color: var(--text-muted);">+</span>
                                </div>
                                <span class="val-display banner-zoom-val">${Math.round((scale / cover) * 100)}%</span>
                            </div>

                            <div class="banner-control-item">
                                <label>📐 Altura do Banner</label>
                                <input type="range" class="banner-height-range" min="300" max="520" step="10" value="${bannerHeight}" style="flex: 1; accent-color: var(--accent-gold); cursor: pointer;">
                                <span class="val-display banner-height-val">${bannerHeight}px</span>
                            </div>

                            <div class="banner-control-item">
                                <label>↕️ Posição Vertical</label>
                                <input type="range" class="banner-posy-range" min="0" max="100" step="1" value="50" style="flex: 1; accent-color: var(--accent-gold); cursor: pointer;">
                                <span class="val-display banner-posy-val">50%</span>
                            </div>
                        </div>

                        <div class="crop-modes">
                            <button type="button" class="btn-secondary-dark" data-m="cover">Preencher</button>
                            <button type="button" class="btn-secondary-dark" data-m="contain">Imagem inteira</button>
                            <button type="button" class="btn-secondary-dark" data-m="reset">Centralizar</button>
                        </div>

                        <div class="crop-actions">
                            <button type="button" class="btn-secondary-dark crop-cancel">Cancelar</button>
                            <button type="button" class="btn-primary-gold crop-ok">Salvar & Aplicar</button>
                        </div>
                    </div>`;

                const cv = ov.querySelector("canvas");
                const ctx = cv.getContext("2d");
                const zoomRange = ov.querySelector(".banner-zoom-range");
                const zoomVal = ov.querySelector(".banner-zoom-val");
                const heightRange = ov.querySelector(".banner-height-range");
                const heightVal = ov.querySelector(".banner-height-val");
                const posyRange = ov.querySelector(".banner-posy-range");
                const posyVal = ov.querySelector(".banner-posy-val");
                const stage = ov.querySelector(".crop-stage-banner");
                const bg = "#0f1015";

                const draw = () => {
                    OUT_H = Math.round((bannerHeight / 220) * 440);
                    if (cv.height !== OUT_H) cv.height = OUT_H;
                    stageH = Math.round((bannerHeight / 220) * 190);
                    stage.style.height = `${stageH}px`;

                    const kW = OUT_W / STAGE_W;
                    const kH = OUT_H / stageH;
                    const w = img.width * scale * kW;
                    const h = img.height * scale * kH;

                    ctx.fillStyle = bg;
                    ctx.fillRect(0, 0, OUT_W, OUT_H);
                    ctx.drawImage(img, OUT_W / 2 + ox * kW - w / 2, OUT_H / 2 + oy * kH - h / 2, w, h);
                };

                const setScale = (v) => {
                    scale = Math.min(maxScale, Math.max(minScale, v));
                    zoomRange.value = scale;
                    zoomVal.textContent = `${Math.round((scale / cover) * 100)}%`;
                    draw();
                };

                const updatePosYFromRange = (pct) => {
                    const rangeY = Math.max(0, (img.height * scale - stageH));
                    oy = (0.5 - pct / 100) * rangeY;
                    posyVal.textContent = `${pct}%`;
                    draw();
                };

                const updateRangeFromOY = () => {
                    const rangeY = (img.height * scale - stageH);
                    let pct = 50;
                    if (rangeY > 0) {
                        pct = Math.round((0.5 - oy / rangeY) * 100);
                        pct = Math.max(0, Math.min(100, pct));
                    }
                    posyRange.value = pct;
                    posyVal.textContent = `${pct}%`;
                };

                const clamp = (v, maxV) => Math.max(-maxV, Math.min(maxV, v));

                const close = (result) => {
                    document.removeEventListener("keydown", onKey);
                    ov.classList.remove("show");
                    setTimeout(() => ov.remove(), 250);
                    if (isFile) URL.revokeObjectURL(url);
                    resolve(result);
                };

                const onKey = (e) => { if (e.key === "Escape") close(null); };

                stage.addEventListener("pointerdown", (e) => {
                    drag = { x: e.clientX - ox, y: e.clientY - oy };
                    stage.setPointerCapture(e.pointerId);
                    stage.classList.add("dragging");
                });

                stage.addEventListener("pointermove", (e) => {
                    if (!drag) return;
                    ox = clamp(e.clientX - drag.x, STAGE_W);
                    oy = clamp(e.clientY - drag.y, STAGE_W);
                    updateRangeFromOY();
                    draw();
                });

                ["pointerup", "pointercancel"].forEach(ev => stage.addEventListener(ev, () => {
                    drag = null;
                    stage.classList.remove("dragging");
                }));

                stage.addEventListener("wheel", (e) => {
                    e.preventDefault();
                    setScale(scale * (e.deltaY < 0 ? 1.05 : 0.95));
                }, { passive: false });

                zoomRange.addEventListener("input", () => setScale(parseFloat(zoomRange.value)));

                heightRange.addEventListener("input", () => {
                    bannerHeight = parseInt(heightRange.value, 10);
                    heightVal.textContent = `${bannerHeight}px`;
                    draw();
                });

                posyRange.addEventListener("input", () => {
                    updatePosYFromRange(parseInt(posyRange.value, 10));
                });

                ov.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
                    ox = oy = 0;
                    posyRange.value = 50;
                    posyVal.textContent = "50%";
                    if (b.dataset.m === "contain") setScale(contain);
                    else if (b.dataset.m === "cover") setScale(cover);
                    else setScale(cover);
                }));

                ov.querySelector(".crop-cancel").addEventListener("click", () => close(null));
                ov.querySelector(".crop-close-x").addEventListener("click", () => close(null));
                ov.addEventListener("click", (e) => { if (e.target === ov) close(null); });

                ov.querySelector(".crop-ok").addEventListener("click", () => {
                    cv.toBlob((blob) => {
                        if (!blob) { close(null); return; }
                        const file = new File([blob], "banner.jpg", { type: "image/jpeg" });
                        const pos = {
                            y: parseInt(posyRange.value, 10) || 50,
                            scale: Math.round((scale / cover) * 100),
                            height: bannerHeight
                        };
                        close({ blob, file, pos });
                    }, "image/jpeg", 0.92);
                });

                document.addEventListener("keydown", onKey);
                document.body.appendChild(ov);
                draw();
                requestAnimationFrame(() => ov.classList.add("show"));
            };
            img.src = url;
        });
    }

    async function saveAndApplyBanner(file, pos) {
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("Você precisa estar logado para salvar seu banner.");
            return;
        }

        const myId = session.user.id;
        const bannerContainer = document.getElementById("profile-banner-container");
        const bannerImg = document.getElementById("profile-banner-img");
        const bannerPlaceholder = document.getElementById("profile-banner-placeholder");
        const bannerActions = document.getElementById("profile-banner-actions");

        const previewUrl = URL.createObjectURL(file);
        if (bannerContainer) bannerContainer.style.height = `${pos?.height || 220}px`;
        if (bannerImg) {
            bannerImg.src = previewUrl;
            bannerImg.style.display = "block";
            bannerImg.style.objectPosition = `center ${pos?.y ?? 50}%`;
            bannerImg.style.transform = `scale(${(pos?.scale ?? 100) / 100})`;
        }
        if (bannerPlaceholder) bannerPlaceholder.style.display = "none";
        if (bannerActions) {
            bannerActions.style.display = "flex";
            const removeBtn = document.getElementById("btn-remove-banner");
            if (removeBtn) removeBtn.style.display = "inline-flex";
            const adjustBtn = document.getElementById("btn-adjust-banner");
            if (adjustBtn) adjustBtn.style.display = "inline-flex";
        }

        localStorage.setItem(`soundbpm_banner_${myId}`, JSON.stringify({ url: previewUrl, pos }));
        localStorage.setItem(`soundbpm_banner_pos_${myId}`, JSON.stringify(pos));

        try {
            const ext = "jpg";
            const filePath = `banner-${myId}-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, file, {
                upsert: true,
                contentType: "image/jpeg"
            });

            let finalUrl = previewUrl;
            if (!upErr) {
                const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
                if (pub?.publicUrl) finalUrl = pub.publicUrl;
            }

            localStorage.setItem(`soundbpm_banner_${myId}`, JSON.stringify({ url: finalUrl, pos }));

            let updatedFields = {
                banner_url: finalUrl,
                banner_pos: JSON.stringify(pos)
            };
            let { error } = await supabase.from("profiles").update(updatedFields).eq("id", myId);
            if (error) {
                console.warn("Aviso ao salvar banner no Supabase (colunas banner_url/banner_pos podem precisar ser criadas):", error.message);
            }

            if (typeof gameToast === "function") gameToast("Banner dimensionado e salvo com sucesso! ✨");
        } catch(err) {
            console.error("Erro ao salvar banner:", err);
            if (typeof gameToast === "function") gameToast("Banner dimensionado localmente! ✨");
        }
    }

    function wireBannerControls() {
        const fileInput = document.getElementById("profile-banner-file-input");
        const placeholder = document.getElementById("profile-banner-placeholder");
        const adjustBtn = document.getElementById("btn-adjust-banner");
        const removeBtn = document.getElementById("btn-remove-banner");
        const modalChooseBtn = document.getElementById("btn-modal-choose-banner");
        const modalAdjustBtn = document.getElementById("btn-modal-adjust-banner");
        const modalFileInput = document.getElementById("edit-profile-banner");
        const modalBannerName = document.getElementById("modal-banner-name");

        let pendingModalBannerFile = null;
        let pendingModalBannerPos = { y: 50, scale: 100, height: 220 };

        // Nova função de segurança: Verifica se a página carregada é o perfil do usuário logado
        async function isMyProfileViewing() {
            if (!supabase) return false;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return false;
            const profilePage = document.getElementById("profile-page");
            const loadedUserId = profilePage?.dataset?.userId || session.user.id;
            return loadedUserId === session.user.id;
        }

        if (placeholder) {
            placeholder.addEventListener("click", async () => {
                const isMine = await isMyProfileViewing();
                if (!isMine) return; // Bloqueia o clique se não for o próprio perfil

                if (fileInput) fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener("change", async () => {
                const isMine = await isMyProfileViewing();
                if (!isMine) { fileInput.value = ""; return; } // Bloqueio duplo

                const f = fileInput.files[0];
                if (!f) return;
                const result = await openBannerCropper(f);
                if (result) {
                    await saveAndApplyBanner(result.file, result.pos);
                }
                fileInput.value = "";
            });
        }

        if (adjustBtn) {
            adjustBtn.addEventListener("click", async () => {
                const isMine = await isMyProfileViewing();
                if (!isMine) return; // Bloqueia a ação se não for o próprio perfil

                const bannerImg = document.getElementById("profile-banner-img");
                const currentSrc = bannerImg?.getAttribute("src");
                if (!currentSrc) {
                    if (fileInput) fileInput.click();
                    return;
                }
                let currentPos = { y: 50, scale: 100, height: 220 };
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        const saved = JSON.parse(localStorage.getItem(`soundbpm_banner_pos_${session.user.id}`) || "null");
                        if (saved) currentPos = saved;
                    }
                } catch(e) {}

                const result = await openBannerCropper(currentSrc, currentPos);
                if (result) {
                    await saveAndApplyBanner(result.file, result.pos);
                }
            });
        }

        if (removeBtn) {
            removeBtn.addEventListener("click", async () => {
                const isMine = await isMyProfileViewing();
                if (!isMine) return; // Bloqueia a ação se não for o próprio perfil

                if (!confirm("Deseja realmente remover o banner do seu perfil?")) return;
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                const myId = session.user.id;

                localStorage.removeItem(`soundbpm_banner_${myId}`);
                localStorage.removeItem(`soundbpm_banner_pos_${myId}`);

                try {
                    await supabase.from("profiles").update({ banner_url: null, banner_pos: null }).eq("id", myId);
                } catch(e) {}

                const bannerImg = document.getElementById("profile-banner-img");
                const bannerPlaceholder = document.getElementById("profile-banner-placeholder");
                const bannerContainer = document.getElementById("profile-banner-container");
                if (bannerImg) { bannerImg.removeAttribute("src"); bannerImg.style.display = "none"; }
                if (bannerPlaceholder) bannerPlaceholder.style.display = "flex";
                if (bannerContainer) bannerContainer.style.height = "220px";
                removeBtn.style.display = "none";
                if (adjustBtn) adjustBtn.style.display = "none";

                if (typeof gameToast === "function") gameToast("Banner removido.");
            });
        }

        if (modalChooseBtn && modalFileInput) {
            modalChooseBtn.addEventListener("click", () => modalFileInput.click());
            modalFileInput.addEventListener("change", async () => {
                const f = modalFileInput.files[0];
                if (!f) return;
                const result = await openBannerCropper(f);
                if (result) {
                    pendingModalBannerFile = result.file;
                    pendingModalBannerPos = result.pos;
                    const dt = new DataTransfer();
                    dt.items.add(result.file);
                    modalFileInput.files = dt.files;
                    if (modalBannerName) modalBannerName.textContent = `✓ ${result.file.name} (${result.pos.height}px)`;
                    if (modalAdjustBtn) modalAdjustBtn.style.display = "inline-flex";

                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        localStorage.setItem(`soundbpm_banner_pos_${session.user.id}`, JSON.stringify(result.pos));
                    }
                }
            });
        }

        if (modalAdjustBtn && modalFileInput) {
            modalAdjustBtn.addEventListener("click", async () => {
                const f = modalFileInput.files[0] || pendingModalBannerFile;
                if (!f) return;
                const result = await openBannerCropper(f, pendingModalBannerPos);
                if (result) {
                    pendingModalBannerFile = result.file;
                    pendingModalBannerPos = result.pos;
                    const dt = new DataTransfer();
                    dt.items.add(result.file);
                    modalFileInput.files = dt.files;
                    if (modalBannerName) modalBannerName.textContent = `✓ ${result.file.name} (${result.pos.height}px)`;
                }
            });
        }

        // Trocar foto de perfil tocando diretamente na foto
        const avatarWrap = document.getElementById("profile-avatar-wrap");
        const directAvatarInput = document.getElementById("direct-avatar-file-input");

        if (avatarWrap && directAvatarInput) {
            avatarWrap.addEventListener("click", async (e) => {
                if (!supabase) return;
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const profilePage = document.getElementById("profile-page");
                const loadedUserId = profilePage?.dataset?.userId || session.user.id;
                if (loadedUserId !== session.user.id) return; // Aqui a segurança já estava correta

                directAvatarInput.click();
            });

            directAvatarInput.addEventListener("change", async () => {
                const file = directAvatarInput.files[0];
                if (!file) return;

                const croppedFile = await openAvatarCropper(file);
                if (!croppedFile) {
                    directAvatarInput.value = "";
                    return;
                }

                if (!supabase) return;
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                const myId = session.user.id;

                const avatarImg = document.getElementById("profile-avatar-img");
                const previewUrl = URL.createObjectURL(croppedFile);
                if (avatarImg) avatarImg.src = previewUrl;

                try {
                    const ext = "jpg";
                    const filePath = `${myId}-${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, croppedFile, {
                        upsert: true,
                        contentType: "image/jpeg"
                    });

                    let finalUrl = previewUrl;
                    if (!upErr) {
                        const { data: pub } = supabase.storage.from("avatars").getPublicUrl(filePath);
                        if (pub?.publicUrl) finalUrl = pub.publicUrl;
                    }

                    await supabase.from("profiles").update({ avatar_url: finalUrl }).eq("id", myId);

                    const localUser = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
                    localUser.avatar = finalUrl;
                    localStorage.setItem("soundbpm_user", JSON.stringify(localUser));

                    updateLoginButtonState();
                    if (typeof gameToast === "function") gameToast("Foto de perfil atualizada com sucesso! ✨");
                } catch(err) {
                    console.error("Erro ao atualizar foto de perfil:", err);
                    if (typeof gameToast === "function") gameToast("Foto atualizada localmente! ✨");
                }
                directAvatarInput.value = "";
            });
        }
    }

    wireBannerControls();
});