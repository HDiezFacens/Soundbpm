var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Sistema de Avaliações, Resenhas e Faixa a Faixa
   ========================================================================== */

var gameToast = window.gameToast;
var navigateTo = window.navigateTo;

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

