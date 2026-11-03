/* ==========================================================================
   SoundBPM - Autenticação, Cadastro, Login e Sessão de Usuário
   ========================================================================== */

var supabase = window.supabaseClient || window.supabase;
var gameEsc = window.gameEsc;
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
let isRegisterMode = false;


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
                options: { emailRedirectTo: location.href.split(/[?#]/)[0], data: { username: username, bio: "Explorando o mundo da música." } }
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


// 4. Gerenciamento do Botão de Perfil / Entrar no Cabeçalho
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


window.checkSupabaseSession = checkSupabaseSession;
