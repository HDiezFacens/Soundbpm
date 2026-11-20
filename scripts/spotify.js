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
    if (!window.SPOTIFY_ACCOUNT_CONNECT_ENABLED) return;
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
if (!window.SPOTIFY_ACCOUNT_CONNECT_ENABLED) return;
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
    if (!window.SPOTIFY_ACCOUNT_CONNECT_ENABLED) {
        if (typeof loadDashboardBacklog === 'function') await loadDashboardBacklog();
        return;
    }

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



// 7. Simulação e Web Player com Reprodução Real de Áudio e Spotify
const simulateBtn = document.getElementById("simulate-login-btn");
const webPlayer = document.getElementById("web-player");
if (simulateBtn && window.SPOTIFY_ACCOUNT_CONNECT_ENABLED) {
    simulateBtn.addEventListener("click", () => {
        localStorage.setItem("spotify_access_token", "simulated_token");
        if (modal) modal.classList.remove("active");
        updateLoginButtonState();
        navigateTo('dashboard');
        populateDashboard();
        if (webPlayer) webPlayer.classList.remove("hidden");
    });
}

let soundbpmAudio = null;
let isAudioPlaying = false;
let currentTrackData = null;
let previewPlaybackRequestId = 0;

function normalizePreviewText(value) {
    return String(value || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
        .replace(/\b(feat\.?|ft\.?|featuring|remaster(ed)?|deluxe edition|bonus track|explicit|radio edit)\b/g, " ")
        .replace(/\b(19|20)\d{2}\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function previewArtistMatches(candidateArtist, requestedArtist) {
    const candidate = normalizePreviewText(candidateArtist);
    const splitArtists = value => String(value || "")
        .split(/,|&|\b(?:feat|ft)\.?\s*|\bfeaturing\b|\band\b/i)
        .map(normalizePreviewText).filter(Boolean);
    const candidateArtists = splitArtists(candidateArtist);
    const requested = normalizePreviewText(requestedArtist);
    const requestedArtists = splitArtists(requestedArtist);
    return !!candidate && (candidate === requested || candidateArtists.some(artist => requestedArtists.includes(artist)));
}

function previewAlbumMatches(candidateAlbum, requestedAlbum) {
    const candidate = normalizePreviewText(candidateAlbum);
    const requested = normalizePreviewText(requestedAlbum);
    return !!candidate && !!requested && (candidate === requested || candidate.includes(requested) || requested.includes(candidate));
}

async function findITunesAlbumResult(albumName, artist) {
    const query = `${albumName} ${artist}`.trim();
    const results = await searchITunesResults(query, "album", 50);
    const candidates = results.filter(result =>
        result.collectionId && previewAlbumMatches(result.collectionName, albumName));
    const artistMatches = candidates.filter(result => previewArtistMatches(result.artistName, artist));
    const bestCandidates = artistMatches.length ? artistMatches : (candidates.length === 1 ? candidates : []);
    const result = bestCandidates
        .sort((a, b) => Number(normalizePreviewText(b.collectionName) === normalizePreviewText(albumName)) -
            Number(normalizePreviewText(a.collectionName) === normalizePreviewText(albumName)))[0] || null;
    if (result) return result;

    // IDs oficiais da Apple para os dois álbuns relatados; usados só quando a busca textual não encontra o álbum.
    const normalizedAlbum = normalizePreviewText(albumName);
    const isMatue = normalizePreviewText(artist).includes("matue");
    const knownAppleAlbumId = isMatue && normalizedAlbum.includes("xtranho")
        ? "1859250096"
        : isMatue && normalizedAlbum.includes("maquina do tempo")
            ? "1531375015"
            : "";
    return knownAppleAlbumId
        ? { collectionId: knownAppleAlbumId, collectionName: albumName, artistName: artist }
        : null;
}

async function searchITunesResults(term, entity, limit) {
    const results = [];
    for (const country of ["br", "us"]) {
        try {
            const url = `https://itunes.apple.com/search?country=${country}&term=${encodeURIComponent(term)}&entity=${entity}&limit=${limit}`;
            const response = await fetch(url);
            if (!response.ok) continue;
            const data = await response.json();
            results.push(...(data.results || []));
        } catch (error) {
            console.warn(`Busca do iTunes (${country}) falhou:`, error);
        }
    }
    return results;
}

async function lookupITunesAlbumTracks(collectionId) {
    let lastResults = [];
    for (const country of ["br", "us"]) {
        try {
            const response = await fetch(`https://itunes.apple.com/lookup?country=${country}&id=${encodeURIComponent(collectionId)}&entity=song`);
            if (!response.ok) continue;
            const data = await response.json();
            const results = data.results || [];
            if (results.some(result => result.wrapperType === "track" && result.previewUrl)) return results;
            if (results.length) lastResults = results;
        } catch (error) {
            console.warn(`Consulta do álbum no iTunes (${country}) falhou:`, error);
        }
    }
    return lastResults;
}

window.getITunesAlbumPreviews = async function(albumName, artist) {
    try {
        const album = await findITunesAlbumResult(albumName, artist);
        if (!album) return [];
        const tracks = (await lookupITunesAlbumTracks(album.collectionId))
            .filter(result => result.wrapperType === "track" && result.previewUrl);
        return tracks.map(track => ({
            previewUrl: track.previewUrl,
            trackName: track.trackName,
            artistName: track.artistName || album.artistName,
            collectionName: album.collectionName,
            collectionId: album.collectionId,
            trackNumber: track.trackNumber
        }));
    } catch (error) {
        console.warn("Não foi possível listar prévias dentro do álbum:", error);
        return [];
    }
};

window.findITunesAlbumPreview = async function(albumName, artist, preferredTrackNames = []) {
    const tracks = await window.getITunesAlbumPreviews(albumName, artist);
    const preferred = preferredTrackNames
        .map(name => tracks.find(track => normalizePreviewText(track.trackName) === normalizePreviewText(name)))
        .find(Boolean);
    const track = preferred || tracks[0];
    return track || null;
};

window.findITunesTrackPreview = async function(track, artist, albumName = "", trackNumber = null) {
    try {
        if (albumName) {
            const album = await findITunesAlbumResult(albumName, artist);
            if (album) {
                const albumData = await lookupITunesAlbumTracks(album.collectionId);
                const albumTracks = albumData.filter(result => result.wrapperType === "track" && result.previewUrl);
                const albumTrack = albumTracks.find(result =>
                    normalizePreviewText(result.trackName) === normalizePreviewText(track)
                ) || (trackNumber ? albumTracks.find(result => Number(result.trackNumber) === Number(trackNumber)) : null);
                if (albumTrack) return albumTrack.previewUrl;
            }
        }

        const query = `${track} ${artist}`.trim();
        const results = await searchITunesResults(query, "song", 50);
        const exactTracks = results.filter(result =>
            result.previewUrl &&
            normalizePreviewText(result.trackName) === normalizePreviewText(track) &&
            previewArtistMatches(result.artistName, artist)
        );
        const matchingAlbumTrack = albumName
            ? exactTracks.find(result => previewAlbumMatches(result.collectionName, albumName)) ||
                (exactTracks.length === 1 ? exactTracks[0] : null)
            : exactTracks[0];
        return matchingAlbumTrack?.previewUrl || null;
    } catch (error) {
        console.warn("Não foi possível localizar uma prévia exata no iTunes:", error);
        return null;
    }
};

window.playAlbumPreview = async function(collectionId, albumName, artist, image) {
    const requestId = ++previewPlaybackRequestId;
    try {
        // Usa a mesma lista de faixas que alimenta o seletor de música do vídeo.
        const tracks = await window.getITunesAlbumPreviews(albumName, artist);
        if (requestId !== previewPlaybackRequestId) return;
        const albumTrack = tracks[0];
        if (!albumTrack) {
            if (window.gameToast) window.gameToast("Não encontrei uma prévia desse álbum no iTunes.");
            return;
        }
        await window.playMockTrack(
            albumTrack.trackName,
            albumTrack.artistName || artist,
            image,
            albumTrack.previewUrl,
            albumTrack.collectionName || albumName
        );
    } catch (error) {
        if (requestId !== previewPlaybackRequestId) return;
        console.warn("Falha ao buscar faixa de prévia do álbum:", error);
        if (window.gameToast) window.gameToast("Não foi possível localizar uma prévia para este álbum.");
    }
};

window.playMockTrack = async function(track, artist, image, audioPreviewUrl = null, albumName = "", trackNumber = null) {
    const requestId = ++previewPlaybackRequestId;
    const playerTrack = document.getElementById("player-track");
    const playerArtist = document.getElementById("player-artist");
    const playerImg = document.getElementById("player-img");
    const playBtn = document.getElementById("player-play-btn");
    const spotifyLink = document.getElementById("player-spotify-link");
    
    if (webPlayer) webPlayer.classList.remove("hidden");
    if (playerTrack) playerTrack.textContent = track || "Faixa selecionada";
    if (playerArtist) playerArtist.textContent = artist || "Artista";
    if (playerImg && image) playerImg.src = image;

    const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent((track || '') + ' ' + (artist || ''))}`;
    if (spotifyLink) {
        spotifyLink.href = spotifySearchUrl;
        spotifyLink.title = `Ouvir "${track}" no Spotify`;
    }

    currentTrackData = { track, artist, image, spotifyUrl: spotifySearchUrl };

    // Se já havia áudio tocando, interrompe
    if (soundbpmAudio) {
        soundbpmAudio.pause();
        soundbpmAudio.src = "";
        soundbpmAudio = null;
        isAudioPlaying = false;
    }

    if (playBtn) playBtn.textContent = "⏳";

    let previewUrl = audioPreviewUrl;
    if (!previewUrl) previewUrl = await window.findITunesTrackPreview(track, artist, albumName, trackNumber);
    if (requestId !== previewPlaybackRequestId) return;

    if (previewUrl) {
        try {
            const audio = new Audio(previewUrl);
            soundbpmAudio = audio;
            audio.volume = 0.85;

            audio.onplay = () => {
                if (soundbpmAudio !== audio) return;
                isAudioPlaying = true;
                if (playBtn) playBtn.textContent = "⏸";
            };

            audio.onpause = () => {
                if (soundbpmAudio !== audio) return;
                isAudioPlaying = false;
                if (playBtn) playBtn.textContent = "▶";
            };

            audio.onended = () => {
                if (soundbpmAudio !== audio) return;
                isAudioPlaying = false;
                if (playBtn) playBtn.textContent = "▶";
            };

            audio.onerror = () => {
                if (soundbpmAudio !== audio) return;
                isAudioPlaying = false;
                if (playBtn) playBtn.textContent = "▶";
                if (window.gameToast) window.gameToast("Essa prévia não está tocando. Tente outra faixa ou abra no Spotify.");
            };

            await audio.play();
        } catch (playErr) {
            if (requestId !== previewPlaybackRequestId) return;
            console.log("Autoplay bloqueado pelo navegador ou erro:", playErr);
            isAudioPlaying = false;
            if (playBtn) playBtn.textContent = "▶";
            if (window.gameToast) window.gameToast("O navegador bloqueou a prévia. Toque novamente para tentar.");
        }
    } else {
        if (requestId !== previewPlaybackRequestId) return;
        if (playBtn) playBtn.textContent = "▶";
        if (window.gameToast) window.gameToast("Prévia de 30s não encontrada. Clique em 'Spotify' para ouvir completa! 🎧");
    }
};

// Configuração dos controles do Web Player
const playerPlayBtn = document.getElementById("player-play-btn");
const playerPrevBtn = document.getElementById("player-prev-btn");
const playerNextBtn = document.getElementById("player-next-btn");
const playerCloseBtn = document.getElementById("player-close-btn");

if (playerPlayBtn) {
    playerPlayBtn.addEventListener("click", () => {
        if (soundbpmAudio && soundbpmAudio.src) {
            if (isAudioPlaying) {
                soundbpmAudio.pause();
            } else {
                soundbpmAudio.play().catch(e => console.warn("Erro ao reproduzir:", e));
            }
        } else if (currentTrackData?.spotifyUrl) {
            window.open(currentTrackData.spotifyUrl, "_blank");
        }
    });
}

if (playerPrevBtn) {
    playerPrevBtn.addEventListener("click", () => {
        if (soundbpmAudio) {
            soundbpmAudio.currentTime = 0;
            soundbpmAudio.play().catch(e => console.warn(e));
        }
    });
}

if (playerNextBtn) {
    playerNextBtn.addEventListener("click", () => {
        if (soundbpmAudio) {
            soundbpmAudio.pause();
            soundbpmAudio.currentTime = 0;
            isAudioPlaying = false;
            if (playerPlayBtn) playerPlayBtn.textContent = "▶";
        }
    });
}

if (playerCloseBtn) {
    playerCloseBtn.addEventListener("click", () => {
        if (soundbpmAudio) {
            soundbpmAudio.pause();
            isAudioPlaying = false;
        }
        if (webPlayer) webPlayer.classList.add("hidden");
    });
}


