var supabase = window.supabaseClient;

/* ==========================================================================
   SoundBPM - Sistema Social: Notificações, Busca de Usuários e Amizades
   ========================================================================== */

var gameToast = window.gameToast;

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

window.loadPeoplePage = loadPeoplePage;
window.loadNotifications = loadNotifications;
