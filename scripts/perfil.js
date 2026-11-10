var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Perfil do Usuário, Estatísticas, Banner e Avatar Personalizados
   ========================================================================== */

var gameToast = window.gameToast;
var fileToDataURL = window.fileToDataURL;
var getHighResImage = window.getHighResImage;
var updateLoginButtonState = window.updateLoginButtonState;

// 1. Carregamento do Perfil do Usuário e Ações
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
                        ${reviewBodyHtml(r.review_text, 'margin-top: 0.5rem; font-style: italic; font-size: 0.9rem; white-space: pre-line;')}
                        
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


// 2. Modal de Edição de Perfil
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


// 3. Recorte e Ajuste de Avatar e Banner Personalizados
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
            const STAGE_W = 560;
            let bannerHeight = initialPos?.height || 380;
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
            console.warn("Aviso ao salvar banner no Supabase:", error.message);
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
            if (!isMine) return;
            if (fileInput) fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", async () => {
            const isMine = await isMyProfileViewing();
            if (!isMine) { fileInput.value = ""; return; }

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
            if (!isMine) return;

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
            if (!isMine) return;

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

    const avatarWrap = document.getElementById("profile-avatar-wrap");
    const directAvatarInput = document.getElementById("direct-avatar-file-input");

    if (avatarWrap && directAvatarInput) {
        directAvatarInput.addEventListener("click", (e) => e.stopPropagation());

        avatarWrap.addEventListener("click", async (e) => {
            if (e.target === directAvatarInput) return;

            if (!supabase) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const profilePage = document.getElementById("profile-page");
            const loadedUserId = profilePage?.dataset?.userId || session.user.id;
            if (loadedUserId !== session.user.id) return;

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

window.openAvatarCropper = openAvatarCropper;
window.openBannerCropper = openBannerCropper;
window.saveAndApplyBanner = saveAndApplyBanner;
window.wireBannerControls = wireBannerControls;
