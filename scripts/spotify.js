var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Integração Spotify (OAuth PKCE, API e Web Player)
   ========================================================================== */


// 1. Funções de Criptografia PKCE
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


// 2. Fluxo de Autorização do Spotify
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

window.connectToSpotify = connectToSpotify;

// 3. Botões de Conexão com o Spotify
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


// 4. Tratamento do Callback do Spotify
window.handleSpotifyCallback = async function() {
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

};

// 5. Chamadas à API do Spotify
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


window.fetchFromSpotify = fetchFromSpotify;

// 6. Preenchimento do Dashboard Musical do Spotify
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



// 7. Simulação e Web Player
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



window.playMockTrack = function(track, artist, image) {
    const playerTrack = document.getElementById("player-track");
    const playerArtist = document.getElementById("player-artist");
    const playerImg = document.getElementById("player-img");
    
    if (playerTrack) playerTrack.textContent = track;
    if (playerArtist) playerArtist.textContent = artist;
    if (playerImg) playerImg.src = image;
};


