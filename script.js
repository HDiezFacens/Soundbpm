document.addEventListener("DOMContentLoaded", () => {
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
                    password: password
                });

                if (signUpError) {
                    alert("Erro ao criar conta: " + signUpError.message);
                    submitBtn.textContent = oldText;
                    submitBtn.disabled = false;
                    return;
                }

                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (signInError) {
                    alert("Conta criada, mas faça login para continuar.");
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

                alert("Login efetuado com sucesso!");
            }

            if (modal) modal.classList.remove("active");
            await checkSupabaseSession();
            await updateLoginButtonState();
            openUserProfile(); 
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
        const acclaimedMasterpieces = [
            { query: "the dark side of the moon pink floyd", synopsis: "Uma experiência sonora transcendental sobre o tempo, a loucura e a condição humana." },
            { query: "abbey road the beatles", synopsis: "O grande canto do cisne da banda, trazendo medleys lendários e produção impecável." },
            { query: "thriller michael jackson", synopsis: "O álbum mais vendido de todos os tempos, redefinindo o pop com genialidade e refrões eternos." },
            { query: "rumours fleetwood mac", synopsis: "Um clássico atemporal forjado no meio de corações partidos e harmonias vocais perfeitas." },
            { query: "nevermind nirvana", synopsis: "O trovão grunge que destruiu o hair metal e deu voz à angústia da Geração X." },
            { query: "ok computer radiohead", synopsis: "O marco do rock alternativo que previu com precisão a alienação e a ansiedade da era digital." },
            { query: "in rainbows radiohead", synopsis: "Quente, melancólico e ritmicamente complexo, um dos registros mais intimistas e brilhantes da banda." },
            { query: "back to black amy winehouse", synopsis: "Soul e R&B visceral com uma honestidade brutal e letras de cortar o coração." },
            { query: "discovery daft punk", synopsis: "Uma viagem nostálgica de french house e disco que moldou para sempre a música eletrônica moderna." },
            { query: "good kid maad city kendrick", synopsis: "Um curta-metragem sonoro magistral sobre a juventude, os perigos e as tentações nas ruas de Compton." },
            { query: "to pimp a butterfly kendrick", synopsis: "Um épico denso de jazz-rap que explora a cultura afro-americana, o racismo e o peso da fama." },
            { query: "blonde frank ocean", synopsis: "Uma obra-prima atmosférica, minimalista e introspectiva que redefiniu os limites do R&B contemporâneo." },
            { query: "igor tyler the creator", synopsis: "Uma jornada caótica, colorida e genial sobre desilusão amorosa, misturando neo-soul e sintetizadores." },
            { query: "renaissance beyonce", synopsis: "Uma celebração eufórica, vibrante e contínua da cultura dance, house e disco underground." },
            { query: "norman fucking rockwell lana del rey", synopsis: "O grande romance americano moderno contado através de baladas poéticas e melancólicas deslumbrantes." },
            { query: "melodrama lorde", synopsis: "Um retrato teatral, eufórico e dolorosamente honesto sobre a solidão das festas e o fim da juventude." },
            { query: "my beautiful dark twisted fantasy kanye", synopsis: "Um espetáculo maximalista e grandioso sobre o ego, a fama e a genialidade em colapso." },
            { query: "after hours the weeknd", synopsis: "Uma odisseia noturna e cinematográfica pelas luzes de neon, excessos e desilusões de Las Vegas." },
            { query: "astroworld travis scott", synopsis: "Um parque de diversões psicodélico do trap moderno com produções colossais e envolventes." },
            { query: "future nostalgia dua lipa", synopsis: "Uma aula magistral de pop contemporâneo com influências marcantes da disco music dos anos 80." },
            { query: "billie eilish when we all fall asleep", synopsis: "Pop sussurrado, sombrio e inovador gerado no quarto que conquistou o mundo." },
            { query: "hit me hard and soft billie eilish", synopsis: "Vocais delicados e arranjos expansivos que flutuam entre o lamento melancólico e o brilho pop." },
            { query: "brat charli xcx", synopsis: "Um mergulho frenético, clubber e hiperativo recheado de vulnerabilidade e batidas ácidas marcantes." },
            { query: "folklore taylor swift", synopsis: "Um refúgio indie-folk repleto de narrativas ficcionais, atmosferas acústicas e pura poesia." },
            { query: "punisher phoebe bridgers", synopsis: "Folk indie assombrado, melancólico e espirituoso, perfeito para madrugadas existenciais." },
            { query: "souvlaki slowdive", synopsis: "Paredes de guitarras enevoadas e vocais etéreos criando a essência definitiva do shoegaze." },
            { query: "homogenic bjork", synopsis: "A batida vulcânica da música eletrônica misturada com cordas sinfónicas numa carta de amor islandesa." },
            { query: "channel orange frank ocean", synopsis: "R&B alternativo inovador com narrativas urbanas profundas e texturas sonoras luxuosas." },
            { query: "blonde on blonde bob dylan", synopsis: "O cume poético do folk-rock com arranjos eletrizantes que mudaram a história da composição." },
            { query: "what s going on marvin gaye", synopsis: "Uma obra-prima atemporal de soul protesto que questiona a humanidade, a guerra e a paz." }
        ];
        
        const shuffled = acclaimedMasterpieces.sort(() => 0.5 - Math.random()).slice(0, 12);
        
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
                        <button class="action-icon-btn" title="Adicionar à Fila de Desejos" onclick="addToBacklog('${safeName}', '${safeArtist}', '${safeImage}')">＋</button>
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
    const allPages = ["dashboard", "albums-page", "profile-page", "people-page"];

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
                    const imageUrl = track.album.images[0] ? track.album.images[0].url : './Logo.png';
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
                    const imageUrl = track.album.images[0] ? track.album.images[0].url : './Logo.png';
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

        const usernameDisplay = document.getElementById("profile-username-display");
        const avatarImg = document.getElementById("profile-avatar-img");
        const bioDisplay = document.getElementById("profile-bio-display");
        const editBtn = document.getElementById("btn-edit-profile");

        if (editBtn) editBtn.style.display = isMyProfile ? "block" : "none";

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userIdToLoad).single();
        
        let displayName = profile?.username || "Usuário";
        let avatarUrl = profile?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces";
        let bioText = profile?.bio || (isMyProfile ? "Explorando o mundo da música." : "Membro do SoundBPM.");

        if (usernameDisplay) usernameDisplay.textContent = displayName;
        if (avatarImg) avatarImg.src = avatarUrl;
        if (bioDisplay) bioDisplay.textContent = bioText;

        const { data: favs } = await supabase.from('favorites').select('*').eq('user_id', userIdToLoad);
        const favGrid = document.getElementById("profile-favorites-grid");
        if (favGrid) {
            if (favs && favs.length > 0) {
                favGrid.innerHTML = favs.map(f => `
                    <div class="poster-card" style="width: 150px; position: relative;">
                        ${isMyProfile ? `<button onclick="removeProfileFavorite('${f.id}')" title="Remover favorito" style="position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.75); color: #fff; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; z-index: 2;">&times;</button>` : ''}
                        <img src="${f.cover_url}" alt="${f.album_name}" style="width: 100%; border-radius: 4px;">
                        <h4 style="font-size: 0.9rem; margin-top: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.album_name}</h4>
                    </div>
                `).join('');
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
                    return `
                    <div class="diary-item" style="background: var(--bg-card); padding: 1rem; border-radius: 6px; display: flex; gap: 1rem; align-items: flex-start; position: relative;">
                        <img src="${r.cover_url}" style="width: 60px; height: 60px; border-radius: 4px; object-fit: cover;">
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong>${r.album_name}</strong>
                                <span style="color: var(--accent-orange);">${stars} (${r.rating})</span>
                            </div>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">${r.artist_name} • ${date}</span>
                            <p style="margin-top: 0.5rem; font-style: italic; font-size: 0.9rem; white-space: pre-line;">"${r.review_text || 'Sem texto de resenha.'}"</p>
                        </div>
                        ${isMyProfile ? `<button onclick="removeProfileReview('${r.id}')" title="Excluir resenha" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.3rem;">&times;</button>` : ''}
                    </div>`;
                }).join('');
            } else {
                profileReviewsList.innerHTML = "<p style='color: var(--text-muted);'>Nenhuma resenha escrita ainda.</p>";
            }
        }

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
        if (!confirm("Tens a certeza de que pretendes excluir esta resenha?")) return;
        const { error } = await supabase.from('reviews').delete().eq('id', id);
        if (!error) {
            loadUserProfile();
        } else {
            alert("Erro ao excluir resenha: " + error.message);
        }
    };
   
    let allNewsItems = [];
    let showingAllNews = false;
    let allUpcomingItems = [];
    let showingAllUpcoming = false;

    async function loadNewsAndUpcoming() {
        const newsContainer = document.getElementById("news-grid-container");
        const viewAllNewsLink = document.getElementById("view-all-news-link");
        const upcomingContainer = document.getElementById("upcoming-grid-container");
        const viewMoreUpcomingLink = document.getElementById("view-more-upcoming-link");

        if (newsContainer) {
            try {
                const rssUrl = "https://g1.globo.com/rss/g1/pop-arte/musica/";
                const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
                const response = await fetch(apiUrl);
                const data = await response.json();
                
                if (data.status === "ok" && data.items && data.items.length > 0) {
                    allNewsItems = data.items;
                    renderNewsList(3);

                    if (viewAllNewsLink) {
                        viewAllNewsLink.addEventListener("click", (e) => {
                            e.preventDefault();
                            showingAllNews = !showingAllNews;
                            
                            if (showingAllNews) {
                                renderNewsList(allNewsItems.length);
                                viewAllNewsLink.textContent = "Mostrar menos ←";
                            } else {
                                renderNewsList(3);
                                viewAllNewsLink.textContent = "Ver todas as notícias →";
                            }

                            document.getElementById("news").scrollIntoView({ behavior: "smooth" });
                        });
                    }
                }
            } catch(e) {
                console.error("Erro ao carregar notícias:", e);
                newsContainer.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: var(--text-muted);'>Não foi possível carregar as notícias mais recentes.</p>";
            }
        }

        function renderNewsList(limit) {
            if (!newsContainer) return;
            newsContainer.innerHTML = allNewsItems.slice(0, limit).map(item => {
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

        if (upcomingContainer) {
            try {
                const randomQueryPool = [
                    "pop album 2026", "indie album 2026", "hip hop album 2026", 
                    "r&b album 2026", "rock album 2026", "electronic album 2026", 
                    "latin album 2026", "alternative album 2026", "soul album 2026",
                    "Taylor Swift 2026", "Sabrina Carpenter 2026", "Kendrick Lamar 2026",
                    "Billie Eilish 2026", "Charli XCX 2026", "new music hits 2026"
                ];

                const shuffledQueries = randomQueryPool.sort(() => 0.5 - Math.random()).slice(0, 6);

                const fetchPromises = shuffledQueries.map(q => 
                    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=album&limit=25&country=br`)
                        .then(r => r.json())
                        .catch(() => ({ results: [] }))
                );

                const responses = await Promise.all(fetchPromises);
                
                let allAlbums = [];
                responses.forEach(res => {
                    if (res && res.results) {
                        allAlbums.push(...res.results);
                    }
                });

                const uniqueMap = new Map();
                allAlbums.forEach(album => {
                    if (album.collectionName && !uniqueMap.has(album.collectionName)) {
                        uniqueMap.set(album.collectionName, album);
                    }
                });

                let rawItems = Array.from(uniqueMap.values());

                allUpcomingItems = rawItems.filter(album => {
                    if (!album.releaseDate) return false;
                    const year = new Date(album.releaseDate).getFullYear();
                    return year === 2026;
                });

                allUpcomingItems.sort((a, b) => {
                    const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date(0);
                    const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date(0);
                    return dateB - dateA;
                });

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
                upcomingContainer.innerHTML = "<p style='color: var(--text-muted); text-align: center; grid-column: 1/-1;'>Nenhum lançamento recente encontrado para 2026.</p>";
                upcomingContainer.style.display = "block";
                if (currentViewMoreBtn) currentViewMoreBtn.style.display = "none";
                return;
            }

            if (currentViewMoreBtn) {
                currentViewMoreBtn.style.display = "inline-block";
            }

            upcomingContainer.innerHTML = itemsToDisplay.map((a) => {
                const cover = a.artworkUrl100 ? a.artworkUrl100.replace("100x100bb", "300x300bb") : './Logo.png';
                const year = a.releaseDate ? new Date(a.releaseDate).getFullYear() : '2026';
                
                return `
                <div class="upcoming-card" style="display: flex; gap: 1rem; align-items: center; background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
                    <img src="${cover}" style="width: 75px; height: 75px; border-radius: 6px; object-fit: cover;">
                    <div class="upcoming-details" style="flex: 1; min-width: 0;">
                        <h4 style="margin: 0 0 0.2rem 0; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${a.collectionName}">${a.collectionName}</h4>
                        <span class="upcoming-artist" style="color: var(--text-muted); font-size: 0.85rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.artistName}</span>
                        <p style="margin: 0.3rem 0 0 0; font-size: 0.75rem; color: var(--accent-gold); font-weight: 600;">🔥 Lançamento Recente • ${year}</p>
                    </div>
                    <a href="${a.collectionViewUrl || '#'}" target="_blank" class="btn-notify" style="text-decoration: none; padding: 0.4rem 0.8rem; background: var(--bg-base); border: 1px solid var(--border-subtle); color: var(--text-main); border-radius: 4px; font-size: 0.8rem; white-space: nowrap;">Ouvir</a>
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
                const homeSections = ["explore", "trending", "news", "upcoming", "community"];
                
                if (homeSections.includes(targetId)) {
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
            backlogContainer.innerHTML = backlogItems.map(item => `
                <div class="backlog-item" style="background: var(--bg-card); padding: 1rem; border-radius: 8px; display: flex; align-items: center; gap: 1.5rem; border: 1px solid rgba(255,255,255,0.05);">
                    <img src="${item.cover_url || 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=100&h=100&fit=crop'}" style="width: 70px; height: 70px; border-radius: 6px; object-fit: cover;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; color: var(--text-main);">${item.album_name}</h4>
                        <span style="color: var(--text-muted); font-size: 0.9rem;">${item.artist_name}</span>
                    </div>
                    <div style="display: flex; gap: 0.75rem;">
                        <button onclick="removeFromBacklog('${item.id}')" class="btn-secondary-dark" style="padding: 0.5rem 1rem; font-size: 0.85rem; cursor: pointer; background: transparent; border: 1px solid var(--text-muted); color: var(--text-muted); border-radius: 4px;">Remover</button>
                    </div>
                </div>
            `).join('');
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
                    const avatar = r.requester?.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&h=60&fit=crop&crop=faces";
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

                if (!resultsDiv) return;
                if (!profiles || profiles.length === 0) {
                    resultsDiv.innerHTML = `<p style="color: var(--text-muted);">Nenhum usuário encontrado.</p>`;
                    return;
                }

                resultsDiv.innerHTML = profiles.map(p => {
                    if (p.id === myId) return "";
                    const avatar = p.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&h=60&fit=crop&crop=faces";
                    return `
                    <div style="display: flex; gap: 1rem; align-items: center; background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle); cursor: pointer;" onclick="openUserProfile('${p.id}')">
                        <img src="${avatar}" style="width:52px; height:52px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1;">
                            <strong style="color: var(--accent-gold);">${p.username || "Usuário"}</strong>
                            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.15rem 0 0 0;">${p.bio || ""}</p>
                        </div>
                        <button class="btn-notify" style="font-size:0.8rem; padding:0.4rem 0.8rem;" onclick="event.stopPropagation(); sendFriendRequest('${p.id}', this)">+ Adicionar</button>
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

});