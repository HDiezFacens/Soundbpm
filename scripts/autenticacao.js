var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Autenticação, Cadastro, Login e Sessão de Usuário
   ========================================================================== */

var gameToast = window.gameToast;
var fileToDataURL = window.fileToDataURL;

// RESOLUÇÃO DE HOISTING: Variáveis do modal movidas para o topo para evitar quebra no fluxo de autenticação
const modal = document.getElementById("login-modal");
const openLoginBtn = document.getElementById("open-login-modal");
const closeLoginBtn = document.getElementById("close-login-modal");

const tabLoginBtn = document.getElementById("tab-login-btn");
const tabRegisterBtn = document.getElementById("tab-register-btn");
const usernameFieldWrap = document.getElementById("username-field-wrap");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authForm = document.getElementById("auth-form");
const googleAuthBtn = document.getElementById("google-auth-btn");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");
const passwordRecoveryModal = document.getElementById("password-recovery-modal");
const passwordRecoveryForm = document.getElementById("password-recovery-form");
const saveNewPasswordBtn = document.getElementById("save-new-password-btn");
const linkGoogleBtn = document.getElementById("btn-link-google");
const googleLinkStatus = document.getElementById("google-link-status");
let isRegisterMode = false;
let googleProfileSetupOpenedForUserId = null;

function openGoogleProfileSetup(session, profile = null) {
    if (!session?.user || googleProfileSetupOpenedForUserId === session.user.id) return;
    googleProfileSetupOpenedForUserId = session.user.id;

    if (window.navigateTo) window.navigateTo("profile-page");
    const usernameInput = document.getElementById("edit-profile-username");
    const bioInput = document.getElementById("edit-profile-bio");
    if (usernameInput) usernameInput.value = profile?.username || session.user.user_metadata?.full_name || "";
    if (bioInput) bioInput.value = profile?.bio || "Explorando o mundo da música.";
    const editProfileModal = document.getElementById("edit-profile-modal");
    if (editProfileModal) editProfileModal.classList.add("active");
    if (window.loadUserProfile) window.loadUserProfile();
    if (window.gameToast) window.gameToast("Continue configurando seu perfil.");
}

async function refreshGoogleLinkStatus() {
    if (!supabase || !googleLinkStatus || !linkGoogleBtn) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        googleLinkStatus.textContent = "Entre na sua conta SoundBPM antes de associar o Google.";
        linkGoogleBtn.disabled = true;
        return;
    }
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
        googleLinkStatus.textContent = "Não foi possível verificar as contas vinculadas.";
        return;
    }
    const linked = data?.identities?.some(identity => identity.provider === "google");
    googleLinkStatus.textContent = linked
        ? "Uma conta Google já está vinculada a esta conta SoundBPM."
        : "Associe o Google para entrar nesta mesma conta SoundBPM.";
    linkGoogleBtn.textContent = linked ? "Google já vinculado" : "Vincular conta Google";
    linkGoogleBtn.disabled = linked;
}
window.refreshGoogleLinkStatus = refreshGoogleLinkStatus;

if (linkGoogleBtn) {
    linkGoogleBtn.addEventListener("click", async () => {
        if (!supabase) return alert("Supabase não inicializado.");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return alert("Entre primeiro na conta SoundBPM que deseja manter.");

        linkGoogleBtn.disabled = true;
        linkGoogleBtn.textContent = "Abrindo Google...";
        const redirectTo = `${window.location.origin}${window.location.pathname}?soundbpm_google_link=1`;
        const { error } = await supabase.auth.linkIdentity({
            provider: "google",
            options: { redirectTo }
        });
        if (error) {
            alert(`Não foi possível vincular o Google: ${error.message}. Se o projeto exigir vínculo manual, habilite essa opção nas configurações de autenticação do Supabase.`);
            await refreshGoogleLinkStatus();
        }
    });
}

async function startGoogleAuth(button) {
    if (!supabase) {
        alert("Supabase não inicializado.");
        return;
    }

    const originalText = button.querySelector("span")?.textContent || button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (button.querySelector("span")) button.querySelector("span").textContent = "Redirecionando...";

    localStorage.setItem("soundbpm_google_auth_pending", JSON.stringify({
        startedAt: Date.now(),
        intent: isRegisterMode ? "signup" : "signin"
    }));
    const redirectTo = `${window.location.origin}${window.location.pathname}?soundbpm_google_${isRegisterMode ? "signup" : "login"}=1`;
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo }
        });
        if (error) throw error;
    } catch (error) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        if (button.querySelector("span")) button.querySelector("span").textContent = originalText;
        alert(`Não foi possível continuar com Google: ${error.message}`);
    }
}

if (googleAuthBtn) googleAuthBtn.addEventListener("click", () => startGoogleAuth(googleAuthBtn));


// 1. Alternância entre Abas Login e Cadastro
if (tabLoginBtn && tabRegisterBtn) {
    tabLoginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        isRegisterMode = false;
        tabLoginBtn.style.color = "var(--accent-gold)";
        tabLoginBtn.style.fontWeight = "700";
        tabRegisterBtn.style.color = "var(--text-muted)";
        tabRegisterBtn.style.fontWeight = "600";
        if (usernameFieldWrap) usernameFieldWrap.style.display = "none";
        if (forgotPasswordBtn) forgotPasswordBtn.style.display = "block";
        if (authSubmitBtn) authSubmitBtn.textContent = "Entrar na Conta";
        const googleLabel = googleAuthBtn?.querySelector("span");
        if (googleLabel) googleLabel.textContent = "Continuar com Google";
    });

    tabRegisterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        isRegisterMode = true;
        tabRegisterBtn.style.color = "var(--accent-gold)";
        tabRegisterBtn.style.fontWeight = "700";
        tabLoginBtn.style.color = "var(--text-muted)";
        tabLoginBtn.style.fontWeight = "600";
        if (usernameFieldWrap) usernameFieldWrap.style.display = "block";
        if (forgotPasswordBtn) forgotPasswordBtn.style.display = "none";
        if (authSubmitBtn) authSubmitBtn.textContent = "Criar Conta Gratuita";
        const googleLabel = googleAuthBtn?.querySelector("span");
        if (googleLabel) googleLabel.textContent = "Criar conta com Google";
    });
}

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
        if (!supabase) return alert("Supabase não inicializado.");
        const emailInput = document.getElementById("auth-email");
        const emailMessage = document.getElementById("auth-email-message");
        const email = emailInput?.value.trim();
        if (!email) {
            if (emailMessage) emailMessage.textContent = "Digite seu e-mail aqui e clique em “Esqueci minha senha” novamente.";
            emailInput?.setAttribute("aria-invalid", "true");
            emailInput?.focus();
            return;
        }
        if (emailMessage) emailMessage.textContent = "";
        emailInput?.removeAttribute("aria-invalid");

        forgotPasswordBtn.disabled = true;
        const originalText = forgotPasswordBtn.textContent;
        forgotPasswordBtn.textContent = "Enviando link...";
        try {
            const redirectTo = `${window.location.origin}${window.location.pathname}?soundbpm_password_recovery=1`;
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            if (error) throw error;
            alert("Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
        } catch (error) {
            alert(`Não foi possível enviar o link de recuperação: ${error.message}`);
        } finally {
            forgotPasswordBtn.disabled = false;
            forgotPasswordBtn.textContent = originalText;
        }
    });
}

document.getElementById("auth-email")?.addEventListener("input", () => {
    const emailMessage = document.getElementById("auth-email-message");
    if (emailMessage) emailMessage.textContent = "";
    document.getElementById("auth-email")?.removeAttribute("aria-invalid");
});

if (passwordRecoveryForm) {
    passwordRecoveryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!supabase) return alert("Supabase não inicializado.");
        const password = document.getElementById("new-password").value;
        const confirmPassword = document.getElementById("confirm-new-password").value;
        if (password.length < 8) return alert("A senha precisa ter pelo menos 8 caracteres.");
        if (password !== confirmPassword) return alert("As senhas não coincidem.");

        saveNewPasswordBtn.disabled = true;
        saveNewPasswordBtn.textContent = "Salvando...";
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            passwordRecoveryModal?.classList.remove("active");
            try { await supabase.auth.signOut(); } catch (_) {}
            alert("Senha atualizada. Agora entre com sua nova senha.");
            if (modal) modal.classList.add("active");
        } catch (error) {
            alert(`Não foi possível atualizar a senha: ${error.message}`);
        } finally {
            saveNewPasswordBtn.disabled = false;
            saveNewPasswordBtn.textContent = "Salvar nova senha";
        }
    });
}


// 2. Persistência de Dados do Cadastro e Criação de Perfil
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

        const { data: profile, error: profileError } = await supabase.from("profiles").select("username, bio, avatar_url").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        const emailPrefix = (user.email || "").split("@")[0];
        const providerName = meta.username || meta.preferred_username || meta.user_name || meta.full_name || meta.name;
        const candidateName = providerName ? String(providerName).trim().slice(0, 24) : "";
        const generatedDefaultName = `Membro-${user.id.slice(0, 6)}`;
        const requestedUsername = pending?.username || (candidateName.length >= 2 ? candidateName : generatedDefaultName);
        const isPlaceholderName = !profile?.username || profile.username === emailPrefix || profile.username === generatedDefaultName;

        if (!profile || (pending?.username && pending.username !== profile.username) || (isPlaceholderName && requestedUsername !== profile?.username)) {
            await window.moderateProfileContent({
                action: "profile", username: requestedUsername, bio: meta.bio || "Explorando o mundo da música."
            });
        }

        if (!profile?.avatar_url && pending?.avatar) {
            const response = await fetch(pending.avatar);
            const blob = await response.blob();
            const imageFile = new File([blob], "signup-avatar.jpg", { type: blob.type || "image/jpeg" });
            await window.moderateProfileImage(imageFile, "avatar_url");
        }
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.error("ensureProfileFromSignup:", e);
        localStorage.removeItem(key);
        return false;
    }
}


// 3. Submissão do Formulário de Login / Cadastro
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
                // O apelido fica pendente no navegador até a validação autenticada pelo servidor.
                options: { emailRedirectTo: location.href.split(/[?#]/)[0], data: { bio: "Explorando o mundo da música." } }
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
                const profileReady = await ensureProfileFromSignup(session);
                if (!profileReady) {
                    submitBtn.textContent = oldText;
                    submitBtn.disabled = false;
                    alert("A conta foi criada, mas o nome ou a foto não passou pela validação. Entre novamente e escolha outro conteúdo.");
                    return;
                }
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
        if (window.openUserProfile) window.openUserProfile(); 
    });
}

if (openLoginBtn && modal) {
    openLoginBtn.addEventListener("click", async () => {
        if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                if (window.openUserProfile) window.openUserProfile();
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


// 4. Gerenciamento do Botão de Perfil / Entrar no Cabeçalho
async function updateLoginButtonState() {
    if (openLoginBtn) {
        const localUser = JSON.parse(localStorage.getItem("soundbpm_user") || "{}");
        const displayName = localUser.username || "Meu Perfil";
        const avatarUrl = localUser.avatar || "";

        openLoginBtn.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.6rem; background: transparent; border: none; padding: 0;">
                ${avatarHtml(avatarUrl, 28, "border:1px solid var(--accent-gold);")}
                <span style="font-weight: 600; color: var(--text-main);">${displayName}</span>
            </div>
        `;
        openLoginBtn.style.borderColor = "var(--accent-gold)";
        openLoginBtn.style.background = "var(--bg-card)";
        openLoginBtn.style.padding = "0.3rem 0.8rem";
        openLoginBtn.style.borderRadius = "20px";
    }
}


window.updateLoginButtonState = updateLoginButtonState;

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

window.resetLoginButtonState = resetLoginButtonState;

// 5. Verificação da Sessão no Supabase
async function checkSupabaseSession() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const url = new URL(window.location.href);
    let googleAuthPending = null;
    try { googleAuthPending = JSON.parse(localStorage.getItem("soundbpm_google_auth_pending") || "null"); } catch (_) {}
    const localGoogleAuthPending = Number(googleAuthPending?.startedAt) > 0 &&
        Date.now() - Number(googleAuthPending.startedAt) < 10 * 60 * 1000;
    const isGoogleSignupIntent = url.searchParams.has("soundbpm_google_signup") ||
        (localGoogleAuthPending && googleAuthPending.intent === "signup");
    const isGoogleAuthReturn = isGoogleSignupIntent || url.searchParams.has("soundbpm_google_login") || localGoogleAuthPending;
    if (!session && !isGoogleAuthReturn) localStorage.removeItem("soundbpm_google_auth_pending");

    if (session) {
        localStorage.removeItem("soundbpm_google_auth_pending");
        const createdAt = Date.parse(session.user.created_at || "");
        const lastSignInAt = Date.parse(session.user.last_sign_in_at || "");
        const authMetadata = session.user.app_metadata || {};
        const isGoogleAccount = authMetadata.provider === "google" ||
            authMetadata.providers?.includes("google") ||
            session.user.identities?.some(identity => identity.provider === "google");
        const isFreshGoogleUser = isGoogleAccount && Number.isFinite(createdAt) &&
            Number.isFinite(lastSignInAt) && Math.abs(lastSignInAt - createdAt) < 5 * 60 * 1000;
        if (isGoogleSignupIntent || isFreshGoogleUser) {
            openGoogleProfileSetup(session);
        }

        let existingProfile = null;
        if (isGoogleAuthReturn || isFreshGoogleUser) {
            const { data } = await supabase
                .from("profiles")
                .select("id, username, bio")
                .eq("id", session.user.id)
                .maybeSingle();
            existingProfile = data;
            const emailPrefix = (session.user.email || "").split("@")[0];
            const generatedName = `Membro-${session.user.id.slice(0, 6)}`;
            const isIncompleteGoogleProfile = !existingProfile || !existingProfile.username ||
                existingProfile.username === emailPrefix || existingProfile.username === generatedName ||
                !existingProfile.bio || existingProfile.bio === "Explorando o mundo da música.";
            if (isIncompleteGoogleProfile) openGoogleProfileSetup(session, existingProfile);
        }

        const profileReady = await ensureProfileFromSignup(session);
        if (!profileReady && window.gameToast) {
            window.gameToast("Sua conta entrou, mas não foi possível preparar o perfil. Tente atualizar a página.");
        }
        const { data: profile } = await supabase
            .from("profiles").select("username, avatar_url, bio").eq("id", session.user.id).maybeSingle();

        const username = profile?.username || session.user.email?.split("@")[0] || "Meu Perfil";
        const avatar   = profile?.avatar_url || "";

        localStorage.setItem("soundbpm_user", JSON.stringify({
            email: session.user.email,
            username: username,
            avatar: avatar
        }));
        await updateLoginButtonState();
        try { await refreshGoogleLinkStatus(); } catch (error) { console.warn("Não foi possível atualizar o estado do vínculo Google:", error); }

        url.searchParams.delete("soundbpm_google_signup");
        url.searchParams.delete("soundbpm_google_login");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } else {
        resetLoginButtonState();
    }

    if (url.searchParams.has("soundbpm_google_link")) {
        const { data: { session: returnedSession } } = await supabase.auth.getSession();
        const { data: identities } = returnedSession
            ? await supabase.auth.getUserIdentities()
            : { data: null };
        const linked = identities?.identities?.some(identity => identity.provider === "google");
        if (window.gameToast) {
            window.gameToast(linked
                ? "Google vinculado à sua conta SoundBPM."
                : "Não foi possível concluir o vínculo. Confira se o vínculo manual está habilitado no Supabase.");
        }
        url.searchParams.delete("soundbpm_google_link");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
}


window.checkSupabaseSession = checkSupabaseSession;

// OAuth pode restaurar a sessão depois da inicialização do cabeçalho.
// Atualize o botão assim que o Supabase confirmar a sessão, sem fazer consultas
// dentro do callback síncrono de onAuthStateChange.
if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" && session) {
            passwordRecoveryModal?.classList.add("active");
            return;
        }
        if (!session || !["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(event)) return;
        const pendingGoogleAuth = localStorage.getItem("soundbpm_google_auth_pending");
        window.setTimeout(async () => {
            try {
                if (event === "SIGNED_IN" && pendingGoogleAuth && window.checkSupabaseSession) {
                    await window.checkSupabaseSession();
                }
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("username, avatar_url")
                    .eq("id", session.user.id)
                    .maybeSingle();
                localStorage.setItem("soundbpm_user", JSON.stringify({
                    email: session.user.email,
                    username: profile?.username || session.user.email?.split("@")[0] || "Meu Perfil",
                    avatar: profile?.avatar_url || ""
                }));
                await updateLoginButtonState();
            } catch (error) {
                console.warn("Não foi possível atualizar o cabeçalho após autenticação:", error);
            }
        }, 0);
    });
}
