const token = localStorage.getItem("token");
const currentMobileNumber = localStorage.getItem("mobileNumber");
const currentName = localStorage.getItem("name");

if (!token || !currentMobileNumber) {
    localStorage.clear();
    window.location.href = "login.html";
}

// Update profile card details
document.getElementById("profileUsername").textContent = currentName;
const avatarEl = document.getElementById("userAvatar");
if (avatarEl) {
    avatarEl.innerHTML = `${currentName.substring(0, 2).toUpperCase()}<span class="status-dot"></span>`;
}

// Theme logic moved to theme.js

// Establish Socket connection
const socket = io({
    auth: { token }
});

// App states
let activeChatId = null;
let activeChatDetails = null; // populated from conversations list item
let activeSidebarTab = "chats"; // "chats", "contacts", "requests", or "search"
let cachedOnlineUsers = []; // complete list of users
let cachedConversations = []; // active chat list items
let cachedContacts = []; // saved contact items
let cachedRequests = { incoming: [], outgoing: [] }; // incoming/outgoing requests
let cachedSearchResults = []; // global search results
let typingUsers = new Set();
let typingTimeout = null;
let currentUserId = null;

// Modal states
let activeDeleteMessageId = null;
let activeDeleteIsMe = false;

// Request Browser Notification Permission on load
if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

// Synthesize dynamic beep audio for new messages (asset-free notification ding)
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 Note
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        // WhatsApp-like short high-frequency alert ding
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.16);
    } catch (e) {
        console.error("Audio block or context failed:", e);
    }
}

// Display HTML5 Browser Push Notification
function showBrowserNotification(title, message) {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState === "hidden") {
        try {
            new Notification(title, {
                body: message
            });
        } catch (err) {
            console.error("Browser notification failed:", err);
        }
    }
}

// Custom Toast alert system
function showToast(message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "";
    if (type === "success") {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
    } else if (type === "danger" || type === "error") {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
        `;
    } else {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
        `;
    }

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    setTimeout(() => {
        toast.classList.remove("show");
        toast.classList.add("hide");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Socket Connection Triggers
socket.on("connect", () => {
    console.log("Connected to Socket.IO successfully");
    showToast("Connected to AeroChat!", "success");
    // Retrieve initial states
    socket.emit("get-my-profile");
    socket.emit("get-conversations");
    socket.emit("get-contacts");
    socket.emit("get-chat-requests");
});

socket.on("connect_error", (err) => {
    console.error("Socket authentication failed:", err.message);
    showToast("Authentication Error. Redirecting...", "danger");
    logout();
});

// Log out user
function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// Mobile sidebar toggle removed (was toggleSidebar)

// Sidebar tab navigations
function switchSidebarTab(tabName) {
    activeSidebarTab = tabName;
    
    // Elements
    const chatsTab = document.getElementById("chatsTab");
    const contactsTab = document.getElementById("contactsTab");
    const requestsTab = document.getElementById("requestsTab");
    const searchTab = document.getElementById("searchTab");

    const chatsList = document.getElementById("conversationsList");
    const contactsList = document.getElementById("contactsList");
    const requestsList = document.getElementById("requestsList");
    const searchResultsList = document.getElementById("searchResultsList");
    const globalSearchBtn = document.getElementById("globalSearchBtn");
    const searchInput = document.getElementById("searchInput");

    // Reset tabs classes
    [chatsTab, contactsTab, requestsTab, searchTab].forEach(t => {
        if (t) t.classList.remove("active");
    });
    
    // Hide all lists
    [chatsList, contactsList, requestsList, searchResultsList].forEach(l => {
        if (l) l.style.display = "none";
    });

    if (globalSearchBtn) globalSearchBtn.style.display = "none";

    // Clear search
    if (searchInput) searchInput.value = "";

    // Activate selected tab
    if (tabName === "chats") {
        if (chatsTab) chatsTab.classList.add("active");
        if (chatsList) chatsList.style.display = "block";
        if (searchInput) searchInput.placeholder = "Search conversations...";
        socket.emit("get-conversations");
    } else if (tabName === "contacts") {
        if (contactsTab) contactsTab.classList.add("active");
        if (contactsList) contactsList.style.display = "block";
        if (searchInput) searchInput.placeholder = "Search saved contacts...";
        socket.emit("get-contacts");
    } else if (tabName === "requests") {
        if (requestsTab) requestsTab.classList.add("active");
        if (requestsList) requestsList.style.display = "block";
        if (searchInput) searchInput.placeholder = "Search requests...";
        socket.emit("get-chat-requests");
    } else if (tabName === "search") {
        if (searchTab) searchTab.classList.add("active");
        if (searchResultsList) searchResultsList.style.display = "block";
        if (globalSearchBtn) globalSearchBtn.style.display = "block";
        if (searchInput) searchInput.placeholder = "Search globally by name or mobile...";
        renderSearchResults(cachedSearchResults);
    }
}

// Filter lists dynamically based on search box input (local search)
function onSearchInput() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    if (activeSidebarTab === "chats") {
        const filtered = cachedConversations.filter(convo => {
            const convoName = getConversationName(convo);
            return convoName && convoName.toLowerCase().includes(query);
        });
        renderConversations(filtered);
    } else if (activeSidebarTab === "contacts") {
        const filtered = cachedContacts.filter(c => 
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.mobileNumber && c.mobileNumber.toLowerCase().includes(query))
        );
        renderContacts(filtered);
    } else if (activeSidebarTab === "requests") {
        const filteredIncoming = (cachedRequests.incoming || []).filter(r => 
            (r.sender.name && r.sender.name.toLowerCase().includes(query)) ||
            (r.sender.mobileNumber && r.sender.mobileNumber.toLowerCase().includes(query))
        );
        const filteredOutgoing = (cachedRequests.outgoing || []).filter(r => 
            (r.receiver.name && r.receiver.name.toLowerCase().includes(query)) ||
            (r.receiver.mobileNumber && r.receiver.mobileNumber.toLowerCase().includes(query))
        );
        renderRequests({ incoming: filteredIncoming, outgoing: filteredOutgoing });
    }
}

function triggerGlobalSearch() {
    const query = document.getElementById("searchInput").value.trim();
    if (!query) {
        showToast("Please enter a name or mobile number to search", "danger");
        return;
    }
    socket.emit("search-users", { query });
}

// Bind switchSidebarTab globally so HTML buttons work
window.switchSidebarTab = switchSidebarTab;
window.triggerGlobalSearch = triggerGlobalSearch;

// Helper to determine conversation card display name (with null checks)
function getConversationName(convo) {
    if (!convo) return "Chat";
    if (convo.isGroup) return convo.name || "Group Chat";
    // Find recipient (the participant who is NOT this user)
    const otherParticipant = convo.participants.find(p => p && p.mobileNumber && currentMobileNumber && p.mobileNumber !== currentMobileNumber);
    return otherParticipant ? (otherParticipant.name || otherParticipant.mobileNumber) : "Private Chat";
}

// Helper to render base64 or preset avatars
function renderAvatar(profilePicture, nameOrUsername, className = "avatar") {
    const initials = (nameOrUsername || "U").substring(0, 2).toUpperCase();
    if (!profilePicture) {
        return `<div class="${className} preset-coral">${initials}</div>`;
    }
    if (profilePicture.startsWith("preset:")) {
        const presetClass = profilePicture.replace(":", "-");
        return `<div class="${className} ${presetClass}">${initials}</div>`;
    }
    return `<div class="${className}"><img src="${profilePicture}" alt="Avatar"></div>`;
}

// Render active conversation cards list
function renderConversations(convos) {
    const container = document.getElementById("conversationsList");
    if (!container) return;

    container.innerHTML = "";

    if (convos.length === 0) {
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px;">
                No chats found
            </div>
        `;
        return;
    }

    convos.forEach(convo => {
        const isSelected = activeChatId === convo.id;
        const name = getConversationName(convo);
        const hasUnread = convo.unreadCount > 0;

        const item = document.createElement("div");
        item.className = `convo-item ${isSelected ? "active" : ""}`;
        item.onclick = () => selectChat(convo.id, convo);

        // Avatar
        let avatarHTML = "";
        if (convo.isGroup) {
            avatarHTML = `<div class="convo-avatar preset-teal">${name.substring(0, 2).toUpperCase()}</div>`;
        } else {
            const other = convo.participants.find(p => p && p.mobileNumber && currentMobileNumber && p.mobileNumber !== currentMobileNumber);
            avatarHTML = renderAvatar(other ? other.profilePicture : "", name, "convo-avatar");
        }
        
        const avatarWrapper = document.createElement("div");
        avatarWrapper.innerHTML = avatarHTML;
        const avatar = avatarWrapper.firstElementChild;

        // Details block
        const details = document.createElement("div");
        details.className = "convo-details";

        const title = document.createElement("div");
        title.className = "convo-name";
        title.textContent = name;
        details.appendChild(title);

        const preview = document.createElement("div");
        preview.className = "convo-preview";
        if (convo.lastMessage) {
            preview.textContent = `${convo.lastMessage.sender}: ${convo.lastMessage.message}`;
        } else {
            preview.textContent = "No messages yet";
            preview.style.fontStyle = "italic";
        }
        details.appendChild(preview);

        // Meta block
        const meta = document.createElement("div");
        meta.className = "convo-meta";

        const time = document.createElement("div");
        time.className = "convo-time";
        if (convo.lastMessage) {
            time.textContent = formatTimeShort(convo.lastMessage.createdAt);
        } else {
            time.textContent = "";
        }
        meta.appendChild(time);

        // Unread Badge
        if (hasUnread) {
            const badge = document.createElement("div");
            badge.className = "convo-badge";
            badge.textContent = convo.unreadCount;
            meta.appendChild(badge);
        }

        item.appendChild(avatar);
        item.appendChild(details);
        item.appendChild(meta);
        container.appendChild(item);
    });
}

// Render saved contacts (Phase D)
function renderContacts(contacts) {
    const listContainer = document.getElementById("contactsList");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    if (contacts.length === 0) {
        listContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px;">
                No contacts saved. Go to "Find Users" to search and save contacts.
            </div>
        `;
        return;
    }

    contacts.forEach(contact => {
        const item = document.createElement("div");
        item.className = "user-item";

        // Avatar
        const avatarHTML = renderAvatar(contact.profilePicture, contact.name || contact.mobileNumber, "user-item-avatar");
        const avatarWrapper = document.createElement("div");
        avatarWrapper.innerHTML = avatarHTML;
        const avatar = avatarWrapper.firstElementChild;
        
        if (contact.isOnline) {
            avatar.innerHTML += `<span class="status-dot"></span>`;
        }

        const details = document.createElement("div");
        details.className = "profile-details";

        const name = document.createElement("div");
        name.className = "user-item-name";
        name.textContent = contact.name;
        details.appendChild(name);

        const statusSub = document.createElement("div");
        statusSub.className = "chat-room-status";
        statusSub.textContent = `${contact.mobileNumber} • ` + (contact.isOnline ? "online" : `last seen ${formatLastSeen(contact.lastSeen)}`);
        statusSub.style.fontSize = "11.5px";
        details.appendChild(statusSub);

        // Action buttons
        const actions = document.createElement("div");
        actions.className = "search-item-actions";
        
        const chatBtn = document.createElement("button");
        chatBtn.className = "btn-list-action btn-list-action-success";
        chatBtn.textContent = "Chat";
        chatBtn.onclick = (e) => {
            e.stopPropagation();
            socket.emit("send-chat-request", { recipientId: contact.id });
            switchSidebarTab("chats");
            // toggleSidebar(); removed
        };
        actions.appendChild(chatBtn);

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn-list-action btn-list-action-danger";
        removeBtn.textContent = "Remove";
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Remove ${contact.name || contact.username} from your contacts?`)) {
                socket.emit("remove-from-contacts", { contactId: contact.id });
            }
        };
        actions.appendChild(removeBtn);

        item.appendChild(avatar);
        item.appendChild(details);
        item.appendChild(actions);
        listContainer.appendChild(item);
    });
}

// Render incoming/outgoing chat requests (Phase C)
function renderRequests({ incoming, outgoing }) {
    const container = document.getElementById("requestsList");
    if (!container) return;

    container.innerHTML = "";

    const incomingCount = incoming ? incoming.length : 0;
    const badge = document.getElementById("requestsCountBadge");
    if (badge) {
        if (incomingCount > 0) {
            badge.textContent = incomingCount;
            badge.style.display = "inline-flex";
        } else {
            badge.style.display = "none";
        }
    }

    if ((!incoming || incoming.length === 0) && (!outgoing || outgoing.length === 0)) {
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px;">
                No pending requests
            </div>
        `;
        return;
    }

    // Render Received Requests
    if (incoming && incoming.length > 0) {
        const sectionTitle = document.createElement("div");
        sectionTitle.className = "section-title";
        sectionTitle.innerHTML = `Received Requests <span class="online-badge">${incoming.length}</span>`;
        container.appendChild(sectionTitle);

        incoming.forEach(req => {
            const item = document.createElement("div");
            item.className = "user-item";

            const avatarHTML = renderAvatar(req.sender.profilePicture, req.sender.name, "user-item-avatar");
            const avatarWrapper = document.createElement("div");
            avatarWrapper.innerHTML = avatarHTML;
            const avatar = avatarWrapper.firstElementChild;

            const details = document.createElement("div");
            details.className = "profile-details";

            const name = document.createElement("div");
            name.className = "user-item-name";
            name.textContent = req.sender.name;
            details.appendChild(name);

            const status = document.createElement("div");
            status.className = "chat-room-status";
            status.textContent = req.sender.mobileNumber;
            status.style.fontSize = "11.5px";
            details.appendChild(status);

            const actions = document.createElement("div");
            actions.className = "search-item-actions";

            const acceptBtn = document.createElement("button");
            acceptBtn.className = "btn-list-action btn-list-action-success";
            acceptBtn.textContent = "Accept";
            acceptBtn.onclick = () => {
                socket.emit("respond-to-chat-request", { requestId: req.requestId, action: "accept" });
            };
            actions.appendChild(acceptBtn);

            const rejectBtn = document.createElement("button");
            rejectBtn.className = "btn-list-action btn-list-action-danger";
            rejectBtn.textContent = "Reject";
            rejectBtn.onclick = () => {
                socket.emit("respond-to-chat-request", { requestId: req.requestId, action: "reject" });
            };
            actions.appendChild(rejectBtn);

            item.appendChild(avatar);
            item.appendChild(details);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    // Render Sent Requests
    if (outgoing && outgoing.length > 0) {
        const sectionTitle = document.createElement("div");
        sectionTitle.className = "section-title";
        sectionTitle.innerHTML = `Sent Requests <span class="online-badge" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b;">${outgoing.length}</span>`;
        container.appendChild(sectionTitle);

        outgoing.forEach(req => {
            const item = document.createElement("div");
            item.className = "user-item";

            const avatarHTML = renderAvatar(req.receiver.profilePicture, req.receiver.name, "user-item-avatar");
            const avatarWrapper = document.createElement("div");
            avatarWrapper.innerHTML = avatarHTML;
            const avatar = avatarWrapper.firstElementChild;

            const details = document.createElement("div");
            details.className = "profile-details";

            const name = document.createElement("div");
            name.className = "user-item-name";
            name.textContent = req.receiver.name;
            details.appendChild(name);

            const status = document.createElement("div");
            status.className = "chat-room-status";
            status.textContent = req.receiver.mobileNumber;
            status.style.fontSize = "11.5px";
            details.appendChild(status);

            const actions = document.createElement("div");
            actions.className = "search-item-actions";

            const statusBadge = document.createElement("span");
            statusBadge.className = "relationship-badge pending_sent";
            statusBadge.textContent = "Pending";
            actions.appendChild(statusBadge);

            item.appendChild(avatar);
            item.appendChild(details);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }
}

// Render global user directory search results (Phase B)
function renderSearchResults(results) {
    const listContainer = document.getElementById("searchResultsList");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    if (results.length === 0) {
        listContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px;">
                Search users globally by typing name or mobile above.
            </div>
        `;
        return;
    }

    results.forEach(user => {
        const item = document.createElement("div");
        item.className = "user-item";

        // Avatar
        const avatarHTML = renderAvatar(user.profilePicture, user.name, "user-item-avatar");
        const avatarWrapper = document.createElement("div");
        avatarWrapper.innerHTML = avatarHTML;
        const avatar = avatarWrapper.firstElementChild;

        if (user.isOnline) {
            avatar.innerHTML += `<span class="status-dot"></span>`;
        }

        const details = document.createElement("div");
        details.className = "profile-details";

        const name = document.createElement("div");
        name.className = "user-item-name";
        name.textContent = user.name;
        details.appendChild(name);

        const statusSub = document.createElement("div");
        statusSub.className = "chat-room-status";
        statusSub.textContent = `Mob: ${user.mobileNumber}`;
        statusSub.style.fontSize = "11.5px";
        details.appendChild(statusSub);

        // Actions block
        const actions = document.createElement("div");
        actions.className = "search-item-actions";

        // 1. Add Contact Toggle
        if (!user.inContacts) {
            const addContactBtn = document.createElement("button");
            addContactBtn.className = "btn-list-action";
            addContactBtn.textContent = "Add Contact";
            addContactBtn.onclick = (e) => {
                e.stopPropagation();
                socket.emit("add-to-contacts", { contactId: user.id });
                user.inContacts = true;
                renderSearchResults(results);
            };
            actions.appendChild(addContactBtn);
        } else {
            const inContactBadge = document.createElement("span");
            inContactBadge.className = "relationship-badge accepted";
            inContactBadge.textContent = "In Contacts";
            actions.appendChild(inContactBadge);
        }

        // 2. Chat Request Gate
        if (!user.requestStatus) {
            const sendReqBtn = document.createElement("button");
            sendReqBtn.className = "btn-list-action btn-list-action-success";
            sendReqBtn.textContent = "Chat Request";
            sendReqBtn.onclick = (e) => {
                e.stopPropagation();
                socket.emit("send-chat-request", { recipientId: user.id });
                user.requestStatus = "pending_sent";
                renderSearchResults(results);
            };
            actions.appendChild(sendReqBtn);
        } else if (user.requestStatus === "pending_sent") {
            const pendingSentBadge = document.createElement("span");
            pendingSentBadge.className = "relationship-badge pending_sent";
            pendingSentBadge.textContent = "Sent";
            actions.appendChild(pendingSentBadge);
        } else if (user.requestStatus === "pending_received") {
            const acceptBtn = document.createElement("button");
            acceptBtn.className = "btn-list-action btn-list-action-success";
            acceptBtn.textContent = "Accept";
            acceptBtn.onclick = (e) => {
                e.stopPropagation();
                socket.emit("respond-to-chat-request", { requestId: user.requestId, action: "accept" });
                user.requestStatus = "accepted";
                renderSearchResults(results);
            };
            actions.appendChild(acceptBtn);
        } else if (user.requestStatus === "accepted") {
            const chatBtn = document.createElement("button");
            chatBtn.className = "btn-list-action btn-list-action-success";
            chatBtn.textContent = "Open";
            chatBtn.onclick = (e) => {
                e.stopPropagation();
                socket.emit("start-private-chat", { recipientMobile: user.mobileNumber });
                switchSidebarTab("chats");
                // toggleSidebar(); removed
            };
            actions.appendChild(chatBtn);
        }

        item.appendChild(avatar);
        item.appendChild(details);
        item.appendChild(actions);
        listContainer.appendChild(item);
    });
}

// Handle Chat Select room
function selectChat(chatId, convoDetails = null) {
    activeChatId = chatId;
    activeChatDetails = convoDetails;

    // Clear previews and emoji picker
    removeSelectedFile();
    const emojiPicker = document.getElementById("emojiPicker");
    if (emojiPicker) emojiPicker.style.display = "none";

    // Remove active markers in list and highlight selected convo
    const items = document.querySelectorAll(".convo-item");
    items.forEach(el => el.classList.remove("active"));
    
    // Clear page title unread counts badge
    updatePageTitleBadge();

    // Toggle input field area
    document.getElementById("chatInputArea").style.display = "block";
    
    // Reset message feed loading
    const messagesFeed = document.getElementById("messages");
    messagesFeed.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); font-size: 13.5px;">
            Loading message history...
        </div>
    `;

    // Fetch messages from room
    socket.emit("load-messages", { chatId });

    // Set Room Title & Headers
    const titleEl = document.getElementById("activeChatTitle");
    const statusEl = document.getElementById("activeChatStatus");
    const leaveBtn = document.getElementById("leaveGroupBtn");
    const groupInfoBtn = document.getElementById("groupInfoBtn");

    if (convoDetails) {
        const name = getConversationName(convoDetails);
        titleEl.textContent = name;

        // Restriction Check: "Only admins can send messages"
        const input = document.getElementById("message");
        const isAdmin = convoDetails.admin && currentUserId && convoDetails.admin.toString() === currentUserId.toString();
        const restrictMessaging = convoDetails.isGroup && convoDetails.onlyAdminsCanMessage && !isAdmin;

        if (restrictMessaging) {
            if (input) {
                input.disabled = true;
                input.placeholder = "Only admins can send messages in this group";
                input.value = "";
            }
            if (document.getElementById("emojiBtn")) document.getElementById("emojiBtn").style.display = "none";
            if (document.getElementById("attachmentBtn")) document.getElementById("attachmentBtn").style.display = "none";
            if (document.getElementById("voiceNoteBtn")) document.getElementById("voiceNoteBtn").style.display = "none";
            const sendBtn = document.querySelector("#chatForm .btn-send");
            if (sendBtn) sendBtn.style.display = "none";
        } else {
            if (input) {
                input.disabled = false;
                input.placeholder = "Type a message";
            }
            if (document.getElementById("emojiBtn")) document.getElementById("emojiBtn").style.display = "block";
            if (document.getElementById("attachmentBtn")) document.getElementById("attachmentBtn").style.display = "block";
            if (document.getElementById("voiceNoteBtn")) document.getElementById("voiceNoteBtn").style.display = "block";
            const sendBtn = document.querySelector("#chatForm .btn-send");
            if (sendBtn) sendBtn.style.display = "block";
        }

        if (convoDetails.isGroup) {
            leaveBtn.style.display = "block";
            if (groupInfoBtn) groupInfoBtn.style.display = "block";
            if (document.getElementById("videoCallBtn")) document.getElementById("videoCallBtn").style.display = "none";
            if (document.getElementById("audioCallBtn")) document.getElementById("audioCallBtn").style.display = "none";
            const memberNames = convoDetails.participants
                .filter(p => p && p.mobileNumber)
                .map(p => p.mobileNumber === currentMobileNumber ? "You" : p.name)
                .join(", ");
            statusEl.textContent = memberNames;
            statusEl.style.textOverflow = "ellipsis";
            statusEl.style.whiteSpace = "nowrap";
            statusEl.style.overflow = "hidden";
        } else {
            leaveBtn.style.display = "none";
            if (groupInfoBtn) groupInfoBtn.style.display = "none";
            if (document.getElementById("videoCallBtn")) document.getElementById("videoCallBtn").style.display = "block";
            if (document.getElementById("audioCallBtn")) document.getElementById("audioCallBtn").style.display = "block";
            const other = convoDetails.participants.find(p => p && p.mobileNumber && currentMobileNumber && p.mobileNumber !== currentMobileNumber);
            if (other) {
                statusEl.textContent = other.isOnline ? "online" : `last seen ${formatLastSeen(other.lastSeen)}`;
            } else {
                statusEl.textContent = "online";
            }
        }
    }

    // Mark as read in client conversation caches
    const convoIndex = cachedConversations.findIndex(c => c.id === chatId);
    if (convoIndex !== -1) {
        cachedConversations[convoIndex].unreadCount = 0;
        renderConversations(cachedConversations);
    }

    // Open chat pane on mobile
    openChat(chatId);
}

// True WhatsApp Mobile Screen Navigation
function openChat(chatId) {
    if (window.innerWidth <= 768) {
        const chatListScreen = document.getElementById("ChatListScreen");
        const chatScreen = document.getElementById("ChatScreen");
        
        if (chatListScreen) chatListScreen.style.display = "none";
        if (chatScreen) chatScreen.style.display = "flex";
    }
}

function backToChatList() {
    activeChatId = null;
    activeChatDetails = null;
    
    // Remove active markers in list
    const items = document.querySelectorAll(".convo-item");
    items.forEach(el => el.classList.remove("active"));
    
    // Reset Header
    document.getElementById("activeChatTitle").textContent = "Select a Conversation";
    document.getElementById("activeChatStatus").textContent = "Choose a contact to begin messaging";
    
    // Hide input area
    document.getElementById("chatInputArea").style.display = "none";

    // Navigate to ChatListScreen
    if (window.innerWidth <= 768) {
        const chatListScreen = document.getElementById("ChatListScreen");
        const chatScreen = document.getElementById("ChatScreen");
        
        if (chatListScreen) chatListScreen.style.display = "flex";
        if (chatScreen) chatScreen.style.display = "none";
    }
}

window.backToChatList = backToChatList;

// Leave group chat
function leaveActiveGroup() {
    if (activeChatId && activeChatDetails && activeChatDetails.isGroup) {
        if (confirm(`Are you sure you want to leave group "${activeChatDetails.name}"?`)) {
            socket.emit("leave-group", { chatId: activeChatId });
        }
    }
}

// Modal creation triggers
function openGroupModal() {
    const modal = document.getElementById("groupModal");
    const listEl = document.getElementById("groupParticipantsList");
    if (modal) modal.classList.add("show");

    // Populate participant checks
    if (listEl) {
        listEl.innerHTML = "";
        
        // Remove ourselves from selection list
        const selectables = cachedContacts.filter(c => c && c.mobileNumber && currentMobileNumber && c.mobileNumber !== currentMobileNumber);

        if (selectables.length === 0) {
            listEl.innerHTML = `<div style="font-size:13px; color:var(--text-secondary); text-align:center; padding:10px;">No contacts saved to add</div>`;
            return;
        }

        selectables.forEach(user => {
            const item = document.createElement("div");
            item.className = "checkbox-item";

            const input = document.createElement("input");
            input.type = "checkbox";
            input.id = `check_${user.mobileNumber}`;
            input.value = user.mobileNumber;

            const label = document.createElement("label");
            label.htmlFor = `check_${user.mobileNumber}`;
            label.textContent = user.name + " (" + user.mobileNumber + ")" + (user.isOnline ? " (online)" : "");

            item.appendChild(input);
            item.appendChild(label);
            listEl.appendChild(item);
        });
    }
}

function closeGroupModal() {
    const modal = document.getElementById("groupModal");
    if (modal) modal.classList.remove("show");
    
    // Clear inputs
    document.getElementById("groupNameInput").value = "";
}

function submitCreateGroup() {
    const nameInput = document.getElementById("groupNameInput");
    const groupName = nameInput.value.trim();

    if (!groupName) {
        showToast("Please enter a group name", "danger");
        return;
    }

    // Get checked boxes
    const checkedBoxes = document.querySelectorAll("#groupParticipantsList input[type='checkbox']:checked");
    const participantMobiles = Array.from(checkedBoxes).map(box => box.value);

    socket.emit("create-group", { groupName, participantMobiles });
    closeGroupModal();
}

// Global selected file state
let selectedFile = null;
let replyingTo = null; // { id, text, senderName }

function handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast("File size must be under 5MB for instant attachment.", "danger");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFile = {
            data: e.target.result,
            mimeType: file.type,
            name: file.name
        };
        const preview = document.getElementById("filePreviewContainer");
        if (preview) preview.style.display = "flex";
        const previewName = document.getElementById("filePreviewName");
        if (previewName) previewName.textContent = file.name;
    };
    reader.readAsDataURL(file);
}

function removeSelectedFile() {
    selectedFile = null;
    const input = document.getElementById("mediaInput");
    if (input) input.value = "";
    const preview = document.getElementById("filePreviewContainer");
    if (preview) preview.style.display = "none";
}

// Send message scoped by room ID
function sendMessage() {
    const input = document.getElementById("message");
    if (!activeChatId) return;

    const messageText = input ? input.value.trim() : "";
    
    if (!messageText && !selectedFile) return;

    socket.emit("chat-message", {
        chatId: activeChatId,
        message: messageText,
        file: selectedFile || undefined,
        replyTo: replyingTo || undefined
    });
    
    stopTyping();
    if (input) {
        input.value = "";
        input.focus();
    }
    removeSelectedFile();
    clearReply();
}

function initReply(messageId, text, senderName) {
    replyingTo = { id: messageId, text, senderName };
    const preview = document.getElementById("replyPreviewContainer");
    if (preview) {
        document.getElementById("replyPreviewName").textContent = senderName;
        document.getElementById("replyPreviewText").textContent = text;
        preview.style.display = "flex";
    }
    const input = document.getElementById("message");
    if (input) input.focus();
}

function clearReply() {
    replyingTo = null;
    const preview = document.getElementById("replyPreviewContainer");
    if (preview) preview.style.display = "none";
}

// Scoped Typing status triggers
const inputField = document.getElementById("message");
if (inputField) {
    inputField.addEventListener("input", () => {
        if (!activeChatId) return;
        socket.emit("typing", { chatId: activeChatId, isTyping: true });

        if (typingTimeout) clearTimeout(typingTimeout);

        typingTimeout = setTimeout(() => {
            stopTyping();
        }, 1500);
    });

    inputField.addEventListener("blur", () => {
        stopTyping();
    });
}

function stopTyping() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
    if (activeChatId) {
        socket.emit("typing", { chatId: activeChatId, isTyping: false });
    }
}

// Open Delete message modal options (for me / everyone)
function openDeleteModal(messageId, isMe) {
    activeDeleteMessageId = messageId;
    activeDeleteIsMe = isMe;

    const modal = document.getElementById("deleteModal");
    const deleteEveryoneBtn = document.getElementById("deleteEveryoneBtn");

    if (modal) modal.classList.add("show");

    if (deleteEveryoneBtn) {
        if (isMe) {
            deleteEveryoneBtn.style.display = "block";
        } else {
            deleteEveryoneBtn.style.display = "none";
        }
    }
}

function closeDeleteModal() {
    const modal = document.getElementById("deleteModal");
    if (modal) modal.classList.remove("show");
    activeDeleteMessageId = null;
    activeDeleteIsMe = false;
}

function confirmDelete(deleteType) {
    if (activeDeleteMessageId) {
        socket.emit("delete-message", {
            messageId: activeDeleteMessageId,
            deleteType: deleteType
        });
    }
    closeDeleteModal();
}

// Append chat messages inside the feed (XSS-safe DOM construction)
function appendMessage(data, isHistory = false) {
    const container = document.getElementById("messages");
    if (!container) return;

    // Check if it is a system message
    const isSystem = data.name === "System";

    const isMe = data.mobileNumber && currentMobileNumber && data.mobileNumber === currentMobileNumber;

    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${isSystem ? "system" : (isMe ? "sent" : "received")}`;
    if (data.id) {
        wrapper.id = `msg-${data.id}`;
    }

    if (isSystem) {
        const sysBubble = document.createElement("div");
        sysBubble.className = "system-message";
        sysBubble.textContent = data.message;
        wrapper.appendChild(sysBubble);
        container.appendChild(wrapper);
        if (!isHistory) scrollToBottom();
        return;
    }

    const bubbleContainer = document.createElement("div");
    bubbleContainer.className = "message-bubble-container";

    // Long-press detection for mobile menu
    let pressTimer;
    const startPress = (e) => {
        if (e.touches && e.touches.length > 1) return;
        pressTimer = setTimeout(() => {
            if (window.navigator.vibrate) navigator.vibrate(50);
            openMobileMessageMenu(data, isMe, bubbleContainer);
        }, 500);
        bubbleContainer.classList.add("pressing");
    };
    const cancelPress = () => {
        clearTimeout(pressTimer);
        bubbleContainer.classList.remove("pressing");
    };
    bubbleContainer.addEventListener("touchstart", startPress, { passive: true });
    bubbleContainer.addEventListener("touchend", cancelPress);
    bubbleContainer.addEventListener("touchmove", cancelPress, { passive: true });
    bubbleContainer.addEventListener("touchcancel", cancelPress);

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    // Received bubble: show sender name
    if (!isMe) {
        const nameLabel = document.createElement("span");
        nameLabel.className = "sender-name";
        nameLabel.textContent = data.name || data.mobileNumber || "Unknown";
        bubble.appendChild(nameLabel);
    }

    // Render Quoted Reply if present
    if (data.replyTo && data.replyTo.text) {
        const replyBlock = document.createElement("div");
        replyBlock.className = "message-quoted-reply";
        replyBlock.innerHTML = `
            <div class="quoted-sender">${data.replyTo.senderName || "Unknown"}</div>
            <div class="quoted-text">${data.replyTo.text}</div>
        `;
        bubble.appendChild(replyBlock);
    }

    // Media file rendering block
    if (data.file && data.file.data) {
        const mime = data.file.mimeType || "";
        const mediaContainer = document.createElement("div");
        mediaContainer.className = "message-media-container";

        if (data.file.isVoiceNote) {
            // Voice Note custom player
            const playIconSVG = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            `;
            const pauseIconSVG = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
            `;

            bubble.className += " voice-note";
            const vnDiv = document.createElement("div");
            vnDiv.className = "voice-note-bubble";
            
            // Build waves HTML
            let waveBarsHTML = "";
            for (let i = 0; i < 15; i++) {
                const heightPct = 30 + Math.floor(Math.random() * 70); // simulated random wave height
                waveBarsHTML += `<div class="vn-wave-bar" style="height: ${heightPct}%;"></div>`;
            }

            vnDiv.innerHTML = `
                <button type="button" class="btn-play-pause">${playIconSVG}</button>
                <div class="vn-waveform">${waveBarsHTML}</div>
                <span class="vn-time">0:00</span>
                <audio src="${data.file.data}" style="display: none;"></audio>
            `;
            bubble.appendChild(vnDiv);
        } else if (mime.startsWith("image/")) {
            const img = document.createElement("img");
            img.className = "message-media-image";
            img.src = data.file.data;
            img.alt = data.file.name || "Image";
            img.onclick = (e) => openLightbox(e.target.src);
            mediaContainer.appendChild(img);
            bubble.appendChild(mediaContainer);
        } else if (mime.startsWith("video/")) {
            const video = document.createElement("video");
            video.className = "message-media-video";
            video.src = data.file.data;
            video.controls = true;
            mediaContainer.appendChild(video);
            bubble.appendChild(mediaContainer);
        } else if (mime.startsWith("audio/")) {
            const audio = document.createElement("audio");
            audio.className = "message-media-audio";
            audio.src = data.file.data;
            audio.controls = true;
            mediaContainer.appendChild(audio);
            bubble.appendChild(mediaContainer);
        } else {
            // General Document download card
            const docLink = document.createElement("a");
            docLink.className = "message-media-doc";
            docLink.href = data.file.data;
            docLink.download = data.file.name || "file";
            
            const sizeFormatted = data.file.size ? formatBytes(data.file.size) : "Unknown size";
            docLink.innerHTML = `
                <div class="doc-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                </div>
                <div class="doc-meta">
                    <div class="doc-name">${data.file.name || "Attachment"}</div>
                    <div class="doc-size">${sizeFormatted}</div>
                </div>
            `;
            bubble.appendChild(docLink);
        }
    }

    if (data.message) {
        const textNode = document.createElement("span");
        textNode.className = "message-text";
        textNode.textContent = data.message;
        bubble.appendChild(textNode);
    }

    const footer = document.createElement("div");
    footer.className = "message-footer";

    const timeSpan = document.createElement("span");
    timeSpan.className = "message-time";
    timeSpan.textContent = formatTimeShort(data.createdAt);
    footer.appendChild(timeSpan);

    if (isMe) {
        const tickSpan = document.createElement("span");
        const isRead = data.status === "read";
        const isDelivered = data.status === "delivered" || isRead;

        tickSpan.className = `wa-ticks ${isRead ? "read" : ""}`;

        if (isDelivered) {
            tickSpan.innerHTML = `
                <svg width="16" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                    <polyline points="24 6 13 17 8 12"></polyline>
                </svg>
            `;
        } else {
            tickSpan.innerHTML = `
                <svg width="16" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        }
        footer.appendChild(tickSpan);
    }

    bubble.appendChild(footer);

    // Render Reactions display list
    const reactionsList = document.createElement("div");
    reactionsList.className = "message-reactions-list";
    
    if (data.reactions && data.reactions.length > 0) {
        // Group reactions by emoji
        const counts = {};
        const userReacted = {};
        
        data.reactions.forEach(r => {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
            if (r.userId && currentUserId && r.userId.toString() === currentUserId.toString()) {
                userReacted[r.emoji] = true;
            }
        });

        Object.keys(counts).forEach(emoji => {
            const pill = document.createElement("div");
            pill.className = `reaction-pill ${userReacted[emoji] ? "reacted" : ""}`;
            pill.innerHTML = `<span>${emoji}</span><span>${counts[emoji]}</span>`;
            
            const usersWhoReacted = data.reactions
                .filter(r => r.emoji === emoji)
                .map(r => (currentUserId && r.userId && r.userId.toString() === currentUserId.toString()) ? "You" : r.userName)
                .join(", ");
            pill.title = usersWhoReacted;
            
            pill.onclick = (e) => {
                e.stopPropagation();
                socket.emit("react-message", {
                    chatId: activeChatId,
                    messageId: data.id,
                    emoji: emoji
                });
            };
            reactionsList.appendChild(pill);
        });
    }
    bubble.appendChild(reactionsList);

    bubbleContainer.appendChild(bubble);

    // Hover actions bar
    if (data.id) {
        const hoverActions = document.createElement("div");
        hoverActions.className = "message-hover-actions";

        // 0. Reply Button
        const replyBtn = document.createElement("button");
        replyBtn.type = "button";
        replyBtn.className = "btn-bubble-action";
        replyBtn.title = "Reply to message";
        replyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 17 4 12 9 7"></polyline>
                <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
            </svg>
        `;
        replyBtn.onclick = (e) => {
            e.stopPropagation();
            initReply(data.id, data.message || (data.file ? "Media" : "Message"), data.name || data.mobileNumber || "Unknown");
        };
        hoverActions.appendChild(replyBtn);

        // 1. React Button
        const reactBtn = document.createElement("button");
        reactBtn.type = "button";
        reactBtn.className = "btn-bubble-action";
        reactBtn.title = "React to message";
        reactBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
            </svg>
        `;
        
        reactBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll(".reactions-popover").forEach(p => p.remove());

            const popover = document.createElement("div");
            popover.className = "reactions-popover";
            
            const emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
            emojis.forEach(emoji => {
                const opt = document.createElement("span");
                opt.className = "reaction-option";
                opt.textContent = emoji;
                opt.onclick = () => {
                    socket.emit("react-message", {
                        chatId: activeChatId,
                        messageId: data.id,
                        emoji: emoji
                    });
                    popover.remove();
                };
                popover.appendChild(opt);
            });

            bubbleContainer.appendChild(popover);
            
            const closeHandler = () => {
                popover.remove();
                document.removeEventListener("click", closeHandler);
            };
            setTimeout(() => document.addEventListener("click", closeHandler), 0);
        };
        hoverActions.appendChild(reactBtn);

        // 2. Forward Button
        const forwardBtn = document.createElement("button");
        forwardBtn.type = "button";
        forwardBtn.className = "btn-bubble-action";
        forwardBtn.title = "Forward message";
        forwardBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
        `;
        forwardBtn.onclick = () => openForwardModal(data);
        hoverActions.appendChild(forwardBtn);

        // 3. Delete Button
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn-bubble-action";
        deleteBtn.title = "Delete Message";
        deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        `;
        deleteBtn.onclick = () => openDeleteModal(data.id, isMe);
        hoverActions.appendChild(deleteBtn);

        bubbleContainer.appendChild(hoverActions);
    }

    wrapper.appendChild(bubbleContainer);
    container.appendChild(wrapper);

    // Custom Voice Note Player wiring
    if (data.file && data.file.isVoiceNote) {
        const playIconSVG = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
        const pauseIconSVG = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
        `;
        const playBtn = bubble.querySelector(".btn-play-pause");
        const audio = bubble.querySelector("audio");
        const waveBars = bubble.querySelectorAll(".vn-wave-bar");
        const timeEl = bubble.querySelector(".vn-time");

        if (playBtn && audio) {
            playBtn.onclick = () => {
                if (audio.paused) {
                    document.querySelectorAll("audio").forEach(a => {
                        if (a !== audio) {
                            a.pause();
                            const otherPlayBtn = a.parentElement.querySelector(".btn-play-pause");
                            if (otherPlayBtn) otherPlayBtn.innerHTML = playIconSVG;
                        }
                    });
                    audio.play();
                    playBtn.innerHTML = pauseIconSVG;
                } else {
                    audio.pause();
                    playBtn.innerHTML = playIconSVG;
                }
            };

            audio.ontimeupdate = () => {
                const pct = audio.currentTime / audio.duration || 0;
                const activeCount = Math.floor(pct * waveBars.length);
                waveBars.forEach((bar, idx) => {
                    if (idx < activeCount) {
                        bar.classList.add("active");
                    } else {
                        bar.classList.remove("active");
                    }
                });
                timeEl.textContent = formatTimeDuration(audio.currentTime);
            };

            audio.onloadedmetadata = () => {
                timeEl.textContent = formatTimeDuration(audio.duration);
            };

            audio.onended = () => {
                playBtn.innerHTML = playIconSVG;
                waveBars.forEach(bar => bar.classList.remove("active"));
                audio.currentTime = 0;
                timeEl.textContent = formatTimeDuration(audio.duration);
            };
        }
    }

    if (!isHistory) {
        scrollToBottom();
    }
}

function scrollToBottom() {
    const container = document.getElementById("messages");
    if (container) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 0);
    }
}

// Time formattings helpers
function formatTimeShort(dateStr) {
    try {
        const date = dateStr ? new Date(dateStr) : new Date();
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
        return "";
    }
}

// Time formattings helpers
function formatLastSeen(dateStr) {
    if (!dateStr) return "recently";
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffHrs = diffMs / (1000 * 60 * 60);

        if (diffHrs < 24 && date.getDate() === now.getDate()) {
            return `today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        } else if (diffHrs < 48 && now.getDate() - date.getDate() === 1) {
            return `yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        } else {
            return date.toLocaleDateString([], { month: "short", day: "numeric" });
        }
    } catch (e) {
        return "recently";
    }
}

// Dynamic Title count badge updates
function updatePageTitleBadge() {
    let totalUnread = 0;
    cachedConversations.forEach(c => {
        if (c.id !== activeChatId) {
            totalUnread += c.unreadCount || 0;
        }
    });

    if (totalUnread > 0) {
        document.title = `(${totalUnread}) AeroChat`;
    } else {
        document.title = "AeroChat";
    }
}

// Socket Response Events List
socket.on("conversations-list", (convos) => {
    cachedConversations = convos;
    renderConversations(convos);
    updatePageTitleBadge();

    // Re-resolve active details if open
    if (activeChatId) {
        const currentConvo = convos.find(c => c.id === activeChatId);
        if (currentConvo) {
            activeChatDetails = currentConvo;
            // update header
            const titleEl = document.getElementById("activeChatTitle");
            const statusEl = document.getElementById("activeChatStatus");
            titleEl.textContent = getConversationName(currentConvo);
            
            if (currentConvo.isGroup) {
                const memberNames = currentConvo.participants
                    .filter(p => p && p.mobileNumber)
                    .map(p => p.mobileNumber === currentMobileNumber ? "You" : p.name)
                    .join(", ");
                statusEl.textContent = memberNames;
            } else {
                const other = currentConvo.participants.find(p => p && p.mobileNumber && currentMobileNumber && p.mobileNumber !== currentMobileNumber);
                if (other) {
                    statusEl.textContent = other.isOnline ? "online" : `last seen ${formatLastSeen(other.lastSeen)}`;
                }
            }
        }
    }
});

socket.on("messages-read", ({ chatId, readerId }) => {
    if (chatId !== activeChatId) return;
    if (currentUserId && readerId !== currentUserId) {
        // Change all ticks of my sent messages to blue read ticks
        const tickSpans = document.querySelectorAll(".message-wrapper.sent .wa-ticks");
        tickSpans.forEach(span => {
            span.classList.add("read");
            // If it is currently a single tick, change to double tick
            if (span.querySelectorAll("polyline").length === 1) {
                span.innerHTML = `
                    <svg width="16" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                        <polyline points="24 6 13 17 8 12"></polyline>
                    </svg>
                `;
            }
        });
    }
});

socket.on("users-list", (users) => {
    console.log("📥 Received users-list event:", users);
    cachedOnlineUsers = users;
});

socket.on("my-profile", (profile) => {
    if (!profile) return;
    currentUserId = profile._id || profile.id;
    document.getElementById("profileUsername").textContent = profile.name;
    const avatarEl = document.getElementById("userAvatar");
    if (avatarEl) {
        if (profile.profilePicture && !profile.profilePicture.startsWith("preset:")) {
            avatarEl.innerHTML = `<img src="${profile.profilePicture}" alt="Avatar"><span class="status-dot"></span>`;
            avatarEl.className = "avatar";
        } else {
            const presetClass = profile.profilePicture ? profile.profilePicture.replace(":", "-") : "preset-coral";
            avatarEl.innerHTML = `${profile.name.substring(0, 2).toUpperCase()}<span class="status-dot"></span>`;
            avatarEl.className = `avatar ${presetClass}`;
        }
    }
});

socket.on("contacts-list", (contacts) => {
    cachedContacts = contacts || [];
    if (activeSidebarTab === "contacts") {
        renderContacts(cachedContacts);
    }
});

socket.on("chat-requests-list", (data) => {
    const incoming = (data && data.incoming) ? data.incoming : [];
    const outgoing = (data && data.outgoing) ? data.outgoing : [];
    cachedRequests = { incoming, outgoing };
    
    const incomingCount = incoming.length;
    const badge = document.getElementById("requestsCountBadge");
    if (badge) {
        if (incomingCount > 0) {
            badge.textContent = incomingCount;
            badge.style.display = "inline-flex";
        } else {
            badge.style.display = "none";
        }
    }
    if (activeSidebarTab === "requests") {
        renderRequests({ incoming, outgoing });
    }
});

socket.on("search-users-result", (results) => {
    cachedSearchResults = results || [];
    if (activeSidebarTab === "search") {
        renderSearchResults(cachedSearchResults);
    }
});

socket.on("new-incoming-request", ({ requestId, sender }) => {
    showToast(`New chat request from ${sender.name}`, "info");
    playNotificationSound();
    showBrowserNotification("New Chat Request", `${sender.name} wants to chat with you.`);
    socket.emit("get-chat-requests");
});

socket.on("chat-request-accepted-alert", ({ requestId, receiverId }) => {
    showToast("Your chat request was accepted!", "success");
    playNotificationSound();
    socket.emit("get-chat-requests");
    socket.emit("get-conversations");
    socket.emit("get-contacts");
});

socket.on("chat-request-sent", ({ recipientId, status, requestId }) => {
    showToast("Chat request sent successfully", "success");
    socket.emit("get-chat-requests");
    triggerGlobalSearch();
});

socket.on("chat-request-responded", ({ requestId, status }) => {
    if (status === "accepted") {
        showToast("Chat request accepted!", "success");
    } else {
        showToast("Chat request declined", "info");
    }
    socket.emit("get-chat-requests");
    socket.emit("get-conversations");
    socket.emit("get-contacts");
});

socket.on("new-chat", ({ chatId }) => {
    socket.emit("get-conversations");
    socket.emit("get-contacts");
});

socket.on("left-chat", ({ chatId }) => {
    if (activeChatId === chatId) {
        activeChatId = null;
        activeChatDetails = null;
        document.getElementById("chatInputArea").style.display = "none";
        document.getElementById("leaveGroupBtn").style.display = "none";
        document.getElementById("activeChatTitle").textContent = "Select a Conversation";
        document.getElementById("activeChatStatus").textContent = "Choose a contact to begin messaging";
        document.getElementById("messages").innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); text-align: center; gap: 10px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--wa-green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p style="font-size: 15px; font-weight: 500;">Left Group Chat</p>
                <p style="font-size: 13px; max-width: 250px;">Select another conversation in the sidebar.</p>
            </div>
        `;
    }
    socket.emit("get-conversations");
});

socket.on("message-history", ({ chatId, messages }) => {
    if (activeChatId !== chatId) return;
    const container = document.getElementById("messages");
    if (container) container.innerHTML = "";
    
    messages.forEach(msg => appendMessage(msg, true));
    scrollToBottom();
});

socket.on("chat-message", (data) => {
    const isTargetingActiveChat = activeChatId === data.chatId;
    if (isTargetingActiveChat) {
        appendMessage(data, false);
        socket.emit("mark-read", { chatId: activeChatId });
    } else {
        const idx = cachedConversations.findIndex(c => c.id === data.chatId);
        if (idx !== -1) {
            cachedConversations[idx].unreadCount = (cachedConversations[idx].unreadCount || 0) + 1;
            cachedConversations[idx].lastMessage = {
                sender: data.name,
                message: data.message,
                createdAt: data.createdAt
            };
            cachedConversations.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
            renderConversations(cachedConversations);
            updatePageTitleBadge();
        } else {
            socket.emit("get-conversations");
        }
        playNotificationSound();
        showBrowserNotification(`${data.name} (AeroChat)`, data.message);
    }
});

socket.on("message-deleted", ({ messageId, deleteType }) => {
    const msgEl = document.getElementById(`msg-${messageId}`);
    if (msgEl) {
        msgEl.classList.add("deleting");
        setTimeout(() => {
            msgEl.remove();
        }, 300);
    }
    if (deleteType === "everyone") {
        showToast("Message was deleted for everyone", "info");
    } else {
        showToast("Message was deleted for you", "info");
    }
    socket.emit("get-conversations");
});

socket.on("unread-updated", ({ chatId, unreadCount }) => {
    const idx = cachedConversations.findIndex(c => c.id === chatId);
    if (idx !== -1) {
        cachedConversations[idx].unreadCount = unreadCount;
        renderConversations(cachedConversations);
        updatePageTitleBadge();
    }
});

socket.on("presence-change", (data) => {
    if (!data || !data.mobileNumber) return;
    
    // Update cached online lists
    const userIdx = cachedOnlineUsers.findIndex(u => u && u.mobileNumber && data.mobileNumber && u.mobileNumber === data.mobileNumber);
    if (userIdx !== -1) {
        cachedOnlineUsers[userIdx].isOnline = data.isOnline;
        cachedOnlineUsers[userIdx].lastSeen = data.lastSeen;
    } else {
        cachedOnlineUsers.push({
            name: data.name,
            mobileNumber: data.mobileNumber,
            isOnline: data.isOnline,
            lastSeen: data.lastSeen
        });
    }

    // Update contacts list if user is a contact
    const contactIdx = cachedContacts.findIndex(c => c.mobileNumber && data.mobileNumber && c.mobileNumber === data.mobileNumber);
    if (contactIdx !== -1) {
        cachedContacts[contactIdx].isOnline = data.isOnline;
        cachedContacts[contactIdx].lastSeen = data.lastSeen;
        if (activeSidebarTab === "contacts") {
            renderContacts(cachedContacts);
        }
    }

    // Update search results list if present
    const searchIdx = cachedSearchResults.findIndex(s => s.mobileNumber && data.mobileNumber && s.mobileNumber === data.mobileNumber);
    if (searchIdx !== -1) {
        cachedSearchResults[searchIdx].isOnline = data.isOnline;
        cachedSearchResults[searchIdx].lastSeen = data.lastSeen;
        if (activeSidebarTab === "search") {
            renderSearchResults(cachedSearchResults);
        }
    }

    // If active chat is with this user and they went online, update single ticks to double ticks
    if (activeChatDetails && !activeChatDetails.isGroup) {
        const other = activeChatDetails.participants.find(p => p && p.mobileNumber && currentMobileNumber && p.mobileNumber !== currentMobileNumber);
        if (other && other.mobileNumber === data.mobileNumber && data.isOnline) {
            const singleTicks = document.querySelectorAll(".message-wrapper.sent .wa-ticks:not(.read)");
            singleTicks.forEach(span => {
                if (span.querySelectorAll("polyline").length === 1) {
                    span.innerHTML = `
                        <svg width="16" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                            <polyline points="24 6 13 17 8 12"></polyline>
                        </svg>
                    `;
                }
            });
        }
    }

    // Refresh conversation participant presences
    socket.emit("get-conversations");
});

socket.on("typing", (data) => {
    if (data.chatId !== activeChatId) return;

    const statusEl = document.getElementById("activeChatStatus");
    if (!statusEl) return;

    if (data.isTyping) {
        typingUsers.add(data.name);
    } else {
        typingUsers.delete(data.name);
    }

    if (typingUsers.size > 0) {
        statusEl.style.color = "var(--wa-green)";
        if (typingUsers.size === 1) {
            statusEl.textContent = `${Array.from(typingUsers)[0]} is typing...`;
        } else if (typingUsers.size === 2) {
            const arr = Array.from(typingUsers);
            statusEl.textContent = `${arr[0]} and ${arr[1]} are typing...`;
        } else {
            statusEl.textContent = "Multiple users are typing...";
        }
    } else {
        statusEl.style.color = "var(--text-secondary)";
        // Restore status text based on chat details
        if (activeChatDetails) {
            if (activeChatDetails.isGroup) {
                const memberNames = activeChatDetails.participants
                    .filter(p => p && p.mobileNumber)
                    .map(p => p.mobileNumber === currentMobileNumber ? "You" : p.name)
                    .join(", ");
                statusEl.textContent = memberNames;
            } else {
                const other = activeChatDetails.participants.find(p => p && p.mobileNumber && currentMobileNumber && p.mobileNumber !== currentMobileNumber);
                if (other) {
                    statusEl.textContent = other.isOnline ? "online" : `last seen ${formatLastSeen(other.lastSeen)}`;
                } else {
                    statusEl.textContent = "online";
                }
            }
        }
    }
});

/* ==========================================================================
   Phases G, H, I Logic Integration (Media, Emojis, Reactions, Forward, Group Info)
   ========================================================================== */

// 1. Emoji Picker keyboard integration
const emojiCategories = {
    "😀": ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","😈","👿","👹","👺","🤡","💩","👻","💀","☠️","👽","👾","🤖","🎃"],
    "👋": ["👋","🤚","🖐️","✋","🖖","👌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🧠","🦷","🦴","👀","👁️","👅","👄","💋","🩸"],
    "🐱": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦢","🦉","🦅","🦎","🐍","🐢","🐙","🦑","🦐","lobster","螃蟹","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🐘","🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🐐","🐕","🐩","🐈","🐓","🦃","🦚","parrot","蜜蜂","🐛","🦋","🐌","🐞","🐜","🕷️","🕸️","🦂"],
    "🍎": ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🍄","🥜","栗子","🍞","🥐","🥖","🫓","🥨","🥯","🥞","🧇","🧀","🍖","🍗","🥩","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🍳","🥘","🍲","🥣","🥗","🍿","🧈","🧂","🥫","🍱","🍙","🍚","🍛","🍜","🍝","🍣","🍤","🍡"," dumpling","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🍫","🍬","🍭","🍯","🍼","🥛","☕","🍵","🥤","🧋","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🍾"],
    "🚗": ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🚲","🛴","🛹","🚨","✈️","🛫","🛬","🚁","🛸","🛰️","⛵","🚤","🛳️","⛴️","🚢","⚓","🛟","🚀"],
    "💡": ["⌚","📱","📲","💻","⌨️","🖱️","🖨️","🖥️","🕯️","💡","🔦","🏮","🪙","💵","💵","💳","💎","⚖️","🔧","🔨","🛠️","⛏️","⚙️","🧱","⛓️","🪚","🔩","🧲","🔫","💣","🪓","🔪","🗡️","🛡️","🔮","📿","🔑","🗝️","🚪","🪞","🧼","🧽","🪥","🪒","🧺","🧻","🛁","🚿","🚽","🛌","🧸","🖼️","🛍️","🎁","🎈","🎏","✉️","📦","📊","📈","📉","📚","📎","🖇️","✂️","📍","📌","📅","📆","🗓️","🗑️","🔒","🔓","🔐"]
};

function toggleEmojiPicker() {
    const picker = document.getElementById("emojiPicker");
    if (!picker) return;

    if (picker.style.display === "none") {
        picker.style.display = "flex";
        if (picker.children.length === 0) {
            renderEmojiPicker();
        }
    } else {
        picker.style.display = "none";
    }
}

function renderEmojiPicker() {
    const picker = document.getElementById("emojiPicker");
    picker.innerHTML = "";

    // 1. Tab headers
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "emoji-picker-tabs";

    // 2. Grid container
    const grid = document.createElement("div");
    grid.className = "emoji-picker-grid";

    let firstCategory = true;
    Object.keys(emojiCategories).forEach(cat => {
        const tabBtn = document.createElement("button");
        tabBtn.type = "button";
        tabBtn.className = `emoji-tab-btn ${firstCategory ? "active" : ""}`;
        tabBtn.textContent = cat;
        
        tabBtn.onclick = () => {
            document.querySelectorAll(".emoji-tab-btn").forEach(b => b.classList.remove("active"));
            tabBtn.classList.add("active");
            loadEmojiCategory(cat, grid);
        };
        
        tabsContainer.appendChild(tabBtn);
        if (firstCategory) {
            loadEmojiCategory(cat, grid);
            firstCategory = false;
        }
    });

    picker.appendChild(tabsContainer);
    picker.appendChild(grid);
}

function loadEmojiCategory(category, gridElement) {
    gridElement.innerHTML = "";
    const list = emojiCategories[category] || [];
    list.forEach(emoji => {
        const item = document.createElement("span");
        item.className = "emoji-item";
        item.textContent = emoji;
        item.onclick = () => {
            insertEmoji(emoji);
        };
        gridElement.appendChild(item);
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById("message");
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const val = input.value;
    input.value = val.substring(0, start) + emoji + val.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
}

// 2. File Attachment helper overrides
function handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        selectedFile = {
            data: e.target.result,
            name: file.name,
            mimeType: file.type,
            size: file.size
        };
        // Update attachment preview bar
        document.getElementById("filePreviewName").textContent = `${file.name} (${formatBytes(file.size)})`;
        document.getElementById("filePreviewContainer").style.display = "flex";
    };
    reader.readAsDataURL(file);
}

function removeSelectedFile() {
    selectedFile = null;
    const input = document.getElementById("mediaInput");
    if (input) input.value = "";
    const preview = document.getElementById("filePreviewContainer");
    if (preview) preview.style.display = "none";
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 3. Audio Voice recorder controls
let mediaRecorder = null;
let audioChunks = [];
let recordingInterval = null;
let secondsRecorded = 0;
let isRecording = false;

async function toggleVoiceRecording() {
    const recordBtn = document.getElementById("voiceNoteBtn");
    const input = document.getElementById("message");
    if (!recordBtn || !input) return;

    if (!isRecording) {
        // Start Voice Recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            
            // Webm is standard for MediaRecorder
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                const reader = new FileReader();
                reader.onload = function(e) {
                    selectedFile = {
                        data: e.target.result,
                        name: "VoiceNote.webm",
                        mimeType: "audio/webm",
                        size: audioBlob.size,
                        isVoiceNote: true
                    };
                    // Instantly send voice note when recording stops
                    sendMessage();
                };
                reader.readAsDataURL(audioBlob);
                
                // Stop microphone capture stream tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            secondsRecorded = 0;
            
            // UI change: blinking red icon or custom style
            recordBtn.style.color = "var(--danger)";
            recordBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="16" height="16"></rect>
                </svg>
            `;

            input.disabled = true;
            input.value = "";
            input.placeholder = `Recording voice note... [0:00]`;

            recordingInterval = setInterval(() => {
                secondsRecorded++;
                input.placeholder = `Recording voice note... [${formatTimeDuration(secondsRecorded)}]`;
            }, 1000);

        } catch (err) {
            console.error("Microphone access failed:", err);
            showToast("Microphone access is required to record voice notes", "error");
        }
    } else {
        // Stop recording
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        
        isRecording = false;
        clearInterval(recordingInterval);
        
        // Reset record button icon
        recordBtn.style.color = "var(--text-secondary)";
        recordBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
        `;

        input.disabled = false;
        input.placeholder = "Type a message";
        input.focus();
    }
}

function formatTimeDuration(secs) {
    if (isNaN(secs) || secs === Infinity) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// 4. Image lightbox actions
function openLightbox(src) {
    const modal = document.getElementById("lightboxModal");
    const img = document.getElementById("lightboxImg");
    if (modal && img) {
        img.src = src;
        modal.style.display = "flex";
    }
}

function closeLightbox(event) {
    const modal = document.getElementById("lightboxModal");
    if (modal) {
        modal.style.display = "none";
    }
}

// 5. Message Forward modal selection logic
let messageToForward = null;
let cachedForwardTargets = [];

function openForwardModal(msgData) {
    messageToForward = msgData;
    const modal = document.getElementById("forwardModal");
    if (modal) {
        modal.classList.add("show");
        document.getElementById("forwardSearch").value = "";
        loadForwardList();
    }
}

function closeForwardModal() {
    const modal = document.getElementById("forwardModal");
    if (modal) modal.classList.remove("show");
    messageToForward = null;
}

function loadForwardList() {
    const container = document.getElementById("forwardList");
    container.innerHTML = "";

    // Forward targets compile conversations AND contacts
    const targets = [];

    // Add group/active conversations
    cachedConversations.forEach(c => {
        targets.push({
            id: c.id,
            name: getConversationName(c),
            isGroup: c.isGroup
        });
    });

    // Add contacts that don't have active conversations yet
    cachedContacts.forEach(contact => {
        const exists = cachedConversations.some(c => !c.isGroup && c.participants.some(p => p.mobileNumber === contact.mobileNumber));
        if (!exists) {
            targets.push({
                id: `contact-${contact.mobileNumber}`,
                name: contact.name,
                isGroup: false,
                mobileNumber: contact.mobileNumber
            });
        }
    });

    cachedForwardTargets = targets;
    renderForwardList(targets);
}

function renderForwardList(list) {
    const container = document.getElementById("forwardList");
    container.innerHTML = "";

    if (list.length === 0) {
        container.innerHTML = `<div style="text-align:center;font-size:12px;color:var(--text-secondary);padding:10px;">No matches found</div>`;
        return;
    }

    list.forEach(target => {
        const item = document.createElement("label");
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "10px";
        item.style.cursor = "pointer";
        item.style.color = "var(--text-primary)";
        item.style.fontSize = "13.5px";
        item.style.padding = "4px 0";

        item.innerHTML = `
            <input type="checkbox" value="${target.id}" data-is-group="${target.isGroup}" data-mobile="${target.mobileNumber || ''}" style="width:16px;height:16px;accent-color:var(--wa-green);cursor:pointer;">
            <span>${target.name} ${target.isGroup ? '(Group)' : ''}</span>
        `;
        container.appendChild(item);
    });
}

function filterForwardList(event) {
    const query = event.target.value.toLowerCase().trim();
    if (!query) {
        renderForwardList(cachedForwardTargets);
        return;
    }
    const filtered = cachedForwardTargets.filter(t => t.name.toLowerCase().includes(query));
    renderForwardList(filtered);
}

async function submitForward() {
    const checkboxes = document.querySelectorAll("#forwardList input[type='checkbox']:checked");
    if (checkboxes.length === 0) {
        showToast("Please select at least one contact or chat to forward to", "info");
        return;
    }

    if (!messageToForward) return;

    for (const box of checkboxes) {
        const targetVal = box.value;
        const isGroup = box.getAttribute("data-is-group") === "true";
        const mobile = box.getAttribute("data-mobile");

        if (targetVal.startsWith("contact-")) {
            // Must start chat first
            socket.emit("start-private-chat", { recipientMobile: mobile });
            // Give socket a minor tick delay to ensure room creation and join
            await new Promise(r => setTimeout(r, 200));
            // Find created conversation id
            const convo = cachedConversations.find(c => !c.isGroup && c.participants.some(p => p.mobileNumber === mobile));
            if (convo) {
                socket.emit("chat-message", {
                    chatId: convo.id,
                    message: messageToForward.message,
                    file: messageToForward.file || undefined
                });
            }
        } else {
            // Send directly to existing room
            socket.emit("chat-message", {
                chatId: targetVal,
                message: messageToForward.message,
                file: messageToForward.file || undefined
            });
        }
    }

    showToast("Message forwarded successfully", "success");
    closeForwardModal();
}

// 6. Sliding Group Info sidebar controls
function openGroupInfo() {
    if (!activeChatDetails || !activeChatDetails.isGroup) return;

    const panel = document.getElementById("groupInfoPanel");
    if (!panel) return;

    // Fill metadata details
    const avatar = document.getElementById("groupInfoAvatar");
    const name = document.getElementById("groupInfoName");
    const count = document.getElementById("groupInfoCount");

    avatar.textContent = activeChatDetails.name.substring(0, 2).toUpperCase();
    name.textContent = activeChatDetails.name;
    count.textContent = `${activeChatDetails.participants.length} participants`;

    // Toggle admin options features display
    const adminParticipant = activeChatDetails.participants.find(p => p.id && activeChatDetails.admin && p.id.toString() === activeChatDetails.admin.toString());
    const isAdmin = adminParticipant && adminParticipant.mobileNumber === currentMobileNumber;
    const adminSection = document.getElementById("adminSettingsSection");
    if (adminSection) {
        adminSection.style.display = isAdmin ? "block" : "none";
    }

    const restrictCheckbox = document.getElementById("restrictMessagingCheckbox");
    if (restrictCheckbox) {
        restrictCheckbox.checked = !!activeChatDetails.onlyAdminsCanMessage;
    }

    renderGroupMembersList(activeChatDetails.participants, activeChatDetails.admin);

    panel.classList.add("open");
}

function closeGroupInfo() {
    const panel = document.getElementById("groupInfoPanel");
    if (panel) panel.classList.remove("open");
}

function renderGroupMembersList(members, adminId) {
    const container = document.getElementById("groupMembersList");
    if (!container) return;
    container.innerHTML = "";

    const currentAdminIdStr = adminId ? adminId.toString() : "";
    const adminParticipant = members.find(p => p.id && p.id.toString() === currentAdminIdStr);
    const isMeAdmin = adminParticipant && adminParticipant.mobileNumber === currentMobileNumber;

    members.forEach(p => {
        const item = document.createElement("div");
        item.className = "member-item";

        const isThisMemberAdmin = p.id && p.id.toString() === currentAdminIdStr;
        const isMeMember = p.mobileNumber === currentMobileNumber;

        let avatarHTML = renderAvatar(p.profilePicture, p.name, "member-avatar");

        const info = document.createElement("div");
        info.className = "member-info";
        info.innerHTML = `
            <div class="member-name">${p.name} ${isMeMember ? '(You)' : ''}</div>
            ${isThisMemberAdmin ? `<span class="member-role">Group Admin</span>` : ''}
        `;

        const actions = document.createElement("div");
        actions.className = "member-actions";

        // Admin actions visible only if Me is admin AND action target is NOT me
        if (isMeAdmin && !isMeMember) {
            // Kick Member Action
            const kickBtn = document.createElement("button");
            kickBtn.className = "btn-member-action btn-member-action-danger";
            kickBtn.textContent = "Kick";
            kickBtn.onclick = () => {
                if (confirm(`Remove ${p.name} from this group?`)) {
                    socket.emit("manage-group-members", {
                        chatId: activeChatId,
                        action: "remove",
                        targetUserId: p.id
                    });
                }
            };
            actions.appendChild(kickBtn);

            // Make Admin Action
            if (!isThisMemberAdmin) {
                const makeAdminBtn = document.createElement("button");
                makeAdminBtn.className = "btn-member-action";
                makeAdminBtn.textContent = "Make Admin";
                makeAdminBtn.onclick = () => {
                    if (confirm(`Delegate admin privileges to ${p.name}? You will lose owner status.`)) {
                        socket.emit("manage-group-members", {
                            chatId: activeChatId,
                            action: "make-admin",
                            targetUserId: p.id
                        });
                    }
                };
                actions.appendChild(makeAdminBtn);
            }
        }

        const avatarWrapper = document.createElement("div");
        avatarWrapper.innerHTML = avatarHTML;
        const avatarEl = avatarWrapper.firstElementChild;

        item.appendChild(avatarEl);
        item.appendChild(info);
        item.appendChild(actions);
        container.appendChild(item);
    });
}

function toggleGroupRestriction(event) {
    if (!activeChatId) return;
    socket.emit("update-group-settings", {
        chatId: activeChatId,
        onlyAdminsCanMessage: event.target.checked
    });
}

function addGroupMember() {
    const input = document.getElementById("addGroupMemberMobile");
    if (!input || !activeChatId) return;
    const mobile = input.value.trim();
    if (!mobile) return;

    socket.emit("manage-group-members", {
        chatId: activeChatId,
        action: "add",
        targetMobile: mobile
    });
    input.value = "";
    const suggestionsContainer = document.getElementById("addGroupMemberSuggestions");
    if (suggestionsContainer) suggestionsContainer.style.display = "none";
}

window.handleAddGroupMemberSearch = function(event) {
    const input = event.target;
    const suggestionsContainer = document.getElementById("addGroupMemberSuggestions");
    if (!suggestionsContainer) return;

    const query = input.value.trim().toLowerCase();
    if (!query) {
        suggestionsContainer.style.display = "none";
        return;
    }

    const existingMobiles = activeChatDetails && activeChatDetails.participants ? activeChatDetails.participants.map(p => p.mobileNumber) : [];
    
    const matchingContacts = cachedContacts.filter(c => 
        !existingMobiles.includes(c.mobileNumber) && 
        (c.name.toLowerCase().includes(query) || (c.mobileNumber && c.mobileNumber.includes(query)))
    );

    if (matchingContacts.length === 0) {
        suggestionsContainer.style.display = "none";
        return;
    }

    suggestionsContainer.innerHTML = "";
    matchingContacts.forEach(contact => {
        const item = document.createElement("div");
        item.style.padding = "8px 12px";
        item.style.cursor = "pointer";
        item.style.borderBottom = "1px solid var(--border-color)";
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "10px";
        item.style.transition = "background-color 0.2s ease";
        
        item.onmouseenter = () => item.style.backgroundColor = "var(--bg-hover)";
        item.onmouseleave = () => item.style.backgroundColor = "transparent";
        
        item.onclick = () => {
            input.value = contact.mobileNumber;
            suggestionsContainer.style.display = "none";
            // Optional: you can call addGroupMember() here automatically if preferred
            // addGroupMember();
        };

        const avatarHTML = renderAvatar(contact.profilePicture, contact.name, "member-avatar");
        
        item.innerHTML = `
            <div style="transform: scale(0.85); transform-origin: left center; margin-right: -5px;">${avatarHTML}</div>
            <div style="flex: 1;">
                <div style="font-size: 13px; color: var(--text-primary); font-weight: 500;">${contact.name}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">${contact.mobileNumber}</div>
            </div>
        `;
        suggestionsContainer.appendChild(item);
    });

    suggestionsContainer.style.display = "block";
};

document.addEventListener("click", (e) => {
    const suggestionsContainer = document.getElementById("addGroupMemberSuggestions");
    if (suggestionsContainer && !e.target.closest("#addGroupMemberMobile") && !e.target.closest("#addGroupMemberSuggestions")) {
        suggestionsContainer.style.display = "none";
    }
});

// 7. Extra Client Side Sockets bindings
socket.on("group-settings-updated", ({ chatId, onlyAdminsCanMessage }) => {
    // Update caches
    const convoIndex = cachedConversations.findIndex(c => c.id === chatId);
    if (convoIndex !== -1) {
        cachedConversations[convoIndex].onlyAdminsCanMessage = onlyAdminsCanMessage;
    }

    if (activeChatId === chatId && activeChatDetails) {
        activeChatDetails.onlyAdminsCanMessage = onlyAdminsCanMessage;
        
        // Lock/unlock input area dynamically
        const input = document.getElementById("message");
        const isAdmin = activeChatDetails.admin && currentUserId && activeChatDetails.admin.toString() === currentUserId.toString();
        const restrictMessaging = onlyAdminsCanMessage && !isAdmin;

        if (restrictMessaging) {
            if (input) {
                input.disabled = true;
                input.placeholder = "Only admins can send messages in this group";
                input.value = "";
            }
            if (document.getElementById("emojiBtn")) document.getElementById("emojiBtn").style.display = "none";
            if (document.getElementById("attachmentBtn")) document.getElementById("attachmentBtn").style.display = "none";
            if (document.getElementById("voiceNoteBtn")) document.getElementById("voiceNoteBtn").style.display = "none";
            const sendBtn = document.querySelector("#chatForm .btn-send");
            if (sendBtn) sendBtn.style.display = "none";
        } else {
            if (input) {
                input.disabled = false;
                input.placeholder = "Type a message";
            }
            if (document.getElementById("emojiBtn")) document.getElementById("emojiBtn").style.display = "block";
            if (document.getElementById("attachmentBtn")) document.getElementById("attachmentBtn").style.display = "block";
            if (document.getElementById("voiceNoteBtn")) document.getElementById("voiceNoteBtn").style.display = "block";
            const sendBtn = document.querySelector("#chatForm .btn-send");
            if (sendBtn) sendBtn.style.display = "block";
        }

        const restrictCheckbox = document.getElementById("restrictMessagingCheckbox");
        if (restrictCheckbox) {
            restrictCheckbox.checked = !!onlyAdminsCanMessage;
        }
    }
});

socket.on("group-members-updated", ({ chatId, participants, admin }) => {
    // Update caches
    const convoIndex = cachedConversations.findIndex(c => c.id === chatId);
    if (convoIndex !== -1) {
        cachedConversations[convoIndex].participants = participants;
        cachedConversations[convoIndex].admin = admin;
    }

    if (activeChatId === chatId && activeChatDetails) {
        activeChatDetails.participants = participants;
        activeChatDetails.admin = admin;
        
        // Refresh sidebar view
        const titleEl = document.getElementById("activeChatTitle");
        const statusEl = document.getElementById("activeChatStatus");
        const leaveBtn = document.getElementById("leaveGroupBtn");
        const groupInfoBtn = document.getElementById("groupInfoBtn");

        const adminParticipant = participants.find(p => p.id && admin && p.id.toString() === admin.toString());
        const isAdmin = adminParticipant && adminParticipant.mobileNumber === currentMobileNumber;
        const restrictMessaging = activeChatDetails.onlyAdminsCanMessage && !isAdmin;

        // Re-check restricted input lock
        const input = document.getElementById("message");
        if (restrictMessaging) {
            if (input) {
                input.disabled = true;
                input.placeholder = "Only admins can send messages in this group";
                input.value = "";
            }
            if (document.getElementById("emojiBtn")) document.getElementById("emojiBtn").style.display = "none";
            if (document.getElementById("attachmentBtn")) document.getElementById("attachmentBtn").style.display = "none";
            if (document.getElementById("voiceNoteBtn")) document.getElementById("voiceNoteBtn").style.display = "none";
            const sendBtn = document.querySelector("#chatForm .btn-send");
            if (sendBtn) sendBtn.style.display = "none";
        } else {
            if (input) {
                input.disabled = false;
                input.placeholder = "Type a message";
            }
            if (document.getElementById("emojiBtn")) document.getElementById("emojiBtn").style.display = "block";
            if (document.getElementById("attachmentBtn")) document.getElementById("attachmentBtn").style.display = "block";
            if (document.getElementById("voiceNoteBtn")) document.getElementById("voiceNoteBtn").style.display = "block";
            const sendBtn = document.querySelector("#chatForm .btn-send");
            if (sendBtn) sendBtn.style.display = "block";
        }

        const memberNames = participants
            .filter(p => p && p.mobileNumber)
            .map(p => p.mobileNumber === currentMobileNumber ? "You" : p.name)
            .join(", ");
        statusEl.textContent = memberNames;

        const countEl = document.getElementById("groupInfoCount");
        if (countEl) countEl.textContent = `${participants.length} participants`;

        // Update settings visibility toggle
        const adminSection = document.getElementById("adminSettingsSection");
        if (adminSection) adminSection.style.display = isAdmin ? "block" : "none";

        const restrictCheckbox = document.getElementById("restrictMessagingCheckbox");
        if (restrictCheckbox) restrictCheckbox.checked = !!activeChatDetails.onlyAdminsCanMessage;

        renderGroupMembersList(participants, admin);
    }
});

socket.on("message-reacted", ({ chatId, messageId, reactions }) => {
    // If active chat is target, update DOM element reactions list
    if (chatId === activeChatId) {
        const msgEl = document.getElementById(`msg-${messageId}`);
        if (!msgEl) return;
        const bubble = msgEl.querySelector(".message-bubble");
        if (!bubble) return;

        let reactionsList = bubble.querySelector(".message-reactions-list");
        if (!reactionsList) {
            reactionsList = document.createElement("div");
            reactionsList.className = "message-reactions-list";
            bubble.appendChild(reactionsList);
        }

        reactionsList.innerHTML = "";

        if (reactions && reactions.length > 0) {
            const counts = {};
            const userReacted = {};
            
            reactions.forEach(r => {
                counts[r.emoji] = (counts[r.emoji] || 0) + 1;
                if (r.userId && currentUserId && r.userId.toString() === currentUserId.toString()) {
                    userReacted[r.emoji] = true;
                }
            });

            Object.keys(counts).forEach(emoji => {
                const pill = document.createElement("div");
                pill.className = `reaction-pill ${userReacted[emoji] ? "reacted" : ""}`;
                pill.innerHTML = `<span>${emoji}</span><span>${counts[emoji]}</span>`;
                
                const usersWhoReacted = reactions
                    .filter(r => r.emoji === emoji)
                    .map(r => (currentUserId && r.userId && r.userId.toString() === currentUserId.toString()) ? "You" : r.userName)
                    .join(", ");
                pill.title = usersWhoReacted;
                
                pill.onclick = (e) => {
                    e.stopPropagation();
                    socket.emit("react-message", {
                        chatId: activeChatId,
                        messageId: messageId,
                        emoji: emoji
                    });
                };
                reactionsList.appendChild(pill);
            });
        }
    }
});

// ============================================================================
// WEBRTC CALLING SYSTEM
// ============================================================================

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentCallTargetId = null;
let currentCallType = "audio"; // "audio" or "video"
let isCallInitiator = false;
let iceCandidateQueue = [];

let ringtoneInterval = null;
let ringtoneAudioCtx = null;

function startRinging() {
    if (ringtoneInterval) return;
    try {
        ringtoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const playRing = () => {
            if (!ringtoneAudioCtx) return;
            const osc1 = ringtoneAudioCtx.createOscillator();
            const osc2 = ringtoneAudioCtx.createOscillator();
            const gain = ringtoneAudioCtx.createGain();
            
            osc1.type = "sine";
            osc1.frequency.value = 440;
            osc2.type = "sine";
            osc2.frequency.value = 480;
            
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ringtoneAudioCtx.destination);
            
            const now = ringtoneAudioCtx.currentTime;
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.linearRampToValueAtTime(0, now + 0.4);
            
            gain.gain.linearRampToValueAtTime(0.2, now + 0.6);
            gain.gain.linearRampToValueAtTime(0, now + 0.95);
            
            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 1.0);
            osc2.stop(now + 1.0);
        };

        playRing();
        ringtoneInterval = setInterval(playRing, 3000); 
    } catch (e) {
        console.error("Audio context failed to start ringing:", e);
    }
}

function stopRinging() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
    if (ringtoneAudioCtx) {
        try { ringtoneAudioCtx.close(); } catch(e){}
        ringtoneAudioCtx = null;
    }
}

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

function createDummyStream() {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    
    // Animate to force WebRTC to continuously send frames
    function draw() {
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff";
        ctx.font = "30px Arial";
        ctx.fillText("No Camera (Fallback)", 150, 240);
        ctx.font = "20px Arial";
        ctx.fillText(new Date().toLocaleTimeString(), 150, 280);
        requestAnimationFrame(draw);
    }
    draw();
    
    return canvas.captureStream(30);
}

// 1. Initiate Call
async function initiateCall(type) {
    if (!activeChatDetails || activeChatDetails.isGroup) return;
    
    const otherParticipant = activeChatDetails.participants.find(
        p => p && p.mobileNumber && p.mobileNumber !== currentMobileNumber
    );
    if (!otherParticipant) return;
    
    currentCallTargetId = otherParticipant._id || otherParticipant.id;
    currentCallType = type;
    isCallInitiator = true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === "video"
        });
        
        // Show Active Call Interface with Local Stream
        showActiveCallInterface(type, otherParticipant, true);

        // Notify server
        socket.emit("call-user", {
            recipientId: currentCallTargetId,
            type: type,
            callerName: currentName,
            callerAvatar: "", 
            callerMobile: currentMobileNumber
        });
        
        startRinging(); 
    } catch (err) {
        console.warn("Failed to get media devices, falling back to dummy stream for local testing.", err);
        // Fallback to dummy stream for local testing
        const videoStream = createDummyStream();
        
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        const oscillator = audioCtx.createOscillator();
        oscillator.connect(dest);
        const audioStream = dest.stream;
        
        localStream = new MediaStream([...videoStream.getTracks(), ...audioStream.getTracks()]);
        
        document.getElementById("localVideo").srcObject = localStream;

        socket.emit("call-user", {
            recipientId: currentCallTargetId,
            type: type,
            callerName: currentName,
            callerAvatar: "", 
            callerMobile: currentMobileNumber
        });
        
        startRinging();
    }
}

// 2. Handle Incoming Call
socket.on("incoming-call", ({ callerId, callerName, callerAvatar, callerMobile, type }) => {
    currentCallTargetId = callerId;
    currentCallType = type;
    isCallInitiator = false;

    // Show Incoming Call Modal
    const modal = document.getElementById("incomingCallModal");
    const nameEl = document.getElementById("callerName");
    const typeEl = document.getElementById("callTypeText");
    const avatarEl = document.getElementById("callerAvatar");

    nameEl.textContent = callerName || callerMobile;
    typeEl.textContent = `Incoming ${type === "video" ? "Video" : "Voice"} Call...`;
    
    const initials = (callerName || "U").substring(0, 2).toUpperCase();
    avatarEl.innerHTML = initials;
    avatarEl.className = "call-avatar preset-teal";

    modal.style.display = "flex";
    startRinging();
});

// 3. Accept Incoming Call
async function acceptIncomingCall() {
    stopRinging();
    document.getElementById("incomingCallModal").style.display = "none";
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: currentCallType === "video"
        });

        // Dummy participant object for UI
        const dummyParticipant = { name: document.getElementById("callerName").textContent };
        showActiveCallInterface(currentCallType, dummyParticipant, false);

        socket.emit("call-response", { callerId: currentCallTargetId, status: "accepted" });
        setupWebRTC();
    } catch (err) {
        console.warn("Failed to get media devices, falling back to dummy stream for local testing.", err);
        // Fallback to dummy stream for local testing
        const videoStream = createDummyStream();
        
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        const audioStream = dest.stream;
        
        localStream = new MediaStream([...videoStream.getTracks(), ...audioStream.getTracks()]);
        
        const dummyParticipant = { name: document.getElementById("callerName").textContent };
        showActiveCallInterface(currentCallType, dummyParticipant, false);

        socket.emit("call-response", { callerId: currentCallTargetId, status: "accepted" });
        setupWebRTC();
    }
}

// 4. Reject Incoming Call
function rejectIncomingCall() {
    stopRinging();
    document.getElementById("incomingCallModal").style.display = "none";
    socket.emit("call-response", { callerId: currentCallTargetId, status: "rejected" });
    cleanupCall();
}

// 5. Call Response Handlers
socket.on("call-accepted", ({ responderId }) => {
    if (responderId.toString() === currentCallTargetId.toString()) {
        stopRinging();
        showToast("Call Accepted", "success");
        setupWebRTC();
        createWebRTCOffer();
    }
});

socket.on("call-rejected", ({ reason }) => {
    stopRinging();
    showToast(`Call Declined: ${reason}`, "danger");
    cleanupCall();
});

// 6. Setup WebRTC Peer Connection
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            const remoteVideo = document.getElementById("remoteVideo");
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.play().catch(e => console.log("Video autoplay blocked:", e));
            }
        }
        
        // Prevent duplicate tracks
        if (!remoteStream.getTracks().find(t => t.id === event.track.id)) {
            remoteStream.addTrack(event.track);
        }
        
        if (event.track.kind === "video") {
            currentCallType = "video";
            const audioPlaceholder = document.getElementById("audioCallPlaceholder");
            const remoteVideo = document.getElementById("remoteVideo");
            const localVideo = document.getElementById("localVideo");
            if (audioPlaceholder) audioPlaceholder.style.display = "none";
            if (remoteVideo) remoteVideo.style.display = "block";
            if (localVideo) {
                localVideo.style.display = "block";
                localVideo.srcObject = localStream;
            }
        }
        
        // Once connected, update audio placeholder text
        if (currentCallType === "audio") {
            const statusEl = document.getElementById("activeCallStatus");
            if (statusEl) statusEl.textContent = "00:01 Connected";
        }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("webrtc-signal", {
                targetId: currentCallTargetId,
                signalData: { type: "ice-candidate", candidate: event.candidate }
            });
        }
    };
    
    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log("WebRTC State:", peerConnection.connectionState);
        if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
            cleanupCall();
        }
    };
}

async function processIceQueue() {
    while (iceCandidateQueue.length > 0) {
        const candidate = iceCandidateQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error("Error adding queued ice candidate", e);
        }
    }
}

// 7. WebRTC Signaling Flow
async function createWebRTCOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("webrtc-signal", {
            targetId: currentCallTargetId,
            signalData: { type: "offer", offer: offer }
        });
    } catch (err) {
        console.error("Error creating offer:", err);
    }
}

socket.on("webrtc-signal", async ({ senderId, signalData }) => {
    if (senderId.toString() !== currentCallTargetId.toString() || !peerConnection) return;

    try {
        if (signalData.type === "offer") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit("webrtc-signal", {
                targetId: currentCallTargetId,
                signalData: { type: "answer", answer: answer }
            });
            processIceQueue();
        } else if (signalData.type === "answer") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.answer));
            processIceQueue();
        } else if (signalData.type === "ice-candidate") {
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.candidate));
            } else {
                iceCandidateQueue.push(signalData.candidate);
            }
        }
    } catch (err) {
        console.error("WebRTC Signaling Error:", err);
    }
});

// 8. End Call and Cleanup
function endActiveCall() {
    if (currentCallTargetId) {
        socket.emit("end-call", { targetId: currentCallTargetId });
    }
    cleanupCall();
}

socket.on("call-ended", ({ senderId }) => {
    if (currentCallTargetId && senderId.toString() === currentCallTargetId.toString()) {
        showToast("Call Ended", "info");
        cleanupCall();
    }
});

function cleanupCall() {
    stopRinging();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    currentCallTargetId = null;
    isCallInitiator = false;
    iceCandidateQueue = [];

    // Reset UI
    const incomingModal = document.getElementById("incomingCallModal");
    const activeInterface = document.getElementById("activeCallInterface");
    if(incomingModal) incomingModal.style.display = "none";
    if(activeInterface) activeInterface.style.display = "none";
    
    const remoteVideo = document.getElementById("remoteVideo");
    const localVideo = document.getElementById("localVideo");
    if(remoteVideo) remoteVideo.srcObject = null;
    if(localVideo) localVideo.srcObject = null;
}

// 9. UI Helpers for Call Interface
function showActiveCallInterface(type, participant, isInitiator) {
    const activeInterface = document.getElementById("activeCallInterface");
    const localVideo = document.getElementById("localVideo");
    const audioPlaceholder = document.getElementById("audioCallPlaceholder");
    const remoteVideo = document.getElementById("remoteVideo");
    
    activeInterface.style.display = "flex";
    
    if (type === "video") {
        localVideo.style.display = "block";
        audioPlaceholder.style.display = "none";
        remoteVideo.style.display = "block";
        localVideo.srcObject = localStream;
    } else {
        localVideo.style.display = "none";
        remoteVideo.style.display = "none";
        audioPlaceholder.style.display = "flex";
        
        document.getElementById("activeCallName").textContent = participant.name || "User";
        document.getElementById("activeCallStatus").textContent = isInitiator ? "Calling..." : "Connecting...";
        
        const avatarEl = document.getElementById("activeCallAvatar");
        avatarEl.innerHTML = (participant.name || "U").substring(0,2).toUpperCase();
        avatarEl.className = "call-avatar preset-blue";
    }
}

// Toggle Mute
function toggleCallMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById("toggleMuteBtn");
            if (!audioTrack.enabled) {
                btn.style.background = "#ef4444";
                showToast("Microphone Muted", "info");
            } else {
                btn.style.background = "rgba(255,255,255,0.1)";
                showToast("Microphone Unmuted", "info");
            }
        }
    }
}

// Toggle Video
async function toggleCallVideo() {
    if (!localStream) return;
    
    const btn = document.getElementById("toggleVideoBtn");

    if (currentCallType === "audio") {
        // WhatsApp style: request upgrade from other user
        socket.emit("video-upgrade-request", { targetId: currentCallTargetId });
        showToast("Requesting video upgrade...", "info");
    } else {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            if (!videoTrack.enabled) {
                btn.style.background = "#ef4444";
                showToast("Camera Disabled", "info");
            } else {
                btn.style.background = "rgba(255,255,255,0.1)";
                showToast("Camera Enabled", "info");
            }
        }
    }
}

// ============================================================================
// VIDEO UPGRADE LOGIC
// ============================================================================

socket.on("video-upgrade-request", ({ senderId }) => {
    if (currentCallTargetId && senderId.toString() === currentCallTargetId.toString()) {
        const modal = document.getElementById("videoUpgradeModal");
        if (modal) modal.style.display = "flex";
        playNotificationSound();
    }
});

async function acceptVideoUpgrade() {
    document.getElementById("videoUpgradeModal").style.display = "none";
    
    try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = newStream.getVideoTracks()[0];
        localStream.addTrack(videoTrack);
        
        if (peerConnection) {
            peerConnection.addTrack(videoTrack, localStream);
            // Let the original requester create the offer to avoid glare and race conditions
        }
        
        currentCallType = "video";
        
        document.getElementById("audioCallPlaceholder").style.display = "none";
        document.getElementById("localVideo").style.display = "block";
        document.getElementById("localVideo").srcObject = localStream;
        document.getElementById("remoteVideo").style.display = "block";
        document.getElementById("toggleVideoBtn").style.background = "rgba(255,255,255,0.1)";
        
        socket.emit("video-upgrade-response", { targetId: currentCallTargetId, status: "accepted" });
    } catch (err) {
        console.warn("Failed to get camera during upgrade, falling back to dummy stream.", err);
        const videoStream = createDummyStream();
        const videoTrack = videoStream.getVideoTracks()[0];
        localStream.addTrack(videoTrack);
        
        if (peerConnection) {
            peerConnection.addTrack(videoTrack, localStream);
        }
        
        currentCallType = "video";
        document.getElementById("audioCallPlaceholder").style.display = "none";
        document.getElementById("localVideo").style.display = "block";
        document.getElementById("localVideo").srcObject = localStream;
        document.getElementById("remoteVideo").style.display = "block";
        document.getElementById("toggleVideoBtn").style.background = "rgba(255,255,255,0.1)";
        
        socket.emit("video-upgrade-response", { targetId: currentCallTargetId, status: "accepted" });
    }
}

function rejectVideoUpgrade() {
    document.getElementById("videoUpgradeModal").style.display = "none";
    socket.emit("video-upgrade-response", { targetId: currentCallTargetId, status: "rejected" });
}

socket.on("video-upgrade-response", async ({ senderId, status }) => {
    if (currentCallTargetId && senderId.toString() === currentCallTargetId.toString()) {
        if (status === "accepted") {
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const videoTrack = newStream.getVideoTracks()[0];
                
                // Update UI first so it never fails if WebRTC throws
                currentCallType = "video";
                document.getElementById("audioCallPlaceholder").style.display = "none";
                document.getElementById("localVideo").style.display = "block";
                document.getElementById("remoteVideo").style.display = "block";
                document.getElementById("toggleVideoBtn").style.background = "rgba(255,255,255,0.1)";
                
                try {
                    localStream.addTrack(videoTrack);
                    document.getElementById("localVideo").srcObject = localStream;
                    if (peerConnection) {
                        peerConnection.addTrack(videoTrack, localStream);
                        createWebRTCOffer(); 
                    }
                } catch (webrtcErr) {
                    console.error("WebRTC addTrack error:", webrtcErr);
                }
                
                showToast("Video upgrade accepted", "success");
            } catch (err) {
                console.warn("Failed to get camera during upgrade response, falling back to dummy stream.", err);
                
                // Update UI first
                currentCallType = "video";
                document.getElementById("audioCallPlaceholder").style.display = "none";
                document.getElementById("localVideo").style.display = "block";
                document.getElementById("remoteVideo").style.display = "block";
                document.getElementById("toggleVideoBtn").style.background = "rgba(255,255,255,0.1)";
                
                try {
                    const videoStream = createDummyStream();
                    const videoTrack = videoStream.getVideoTracks()[0];
                    
                    if (videoTrack) {
                        localStream.addTrack(videoTrack);
                        document.getElementById("localVideo").srcObject = localStream;
                        if (peerConnection) {
                            peerConnection.addTrack(videoTrack, localStream);
                            createWebRTCOffer();
                        }
                    }
                } catch (canvasErr) {
                    console.error("Dummy stream creation failed:", canvasErr);
                }
                
                showToast("Video upgrade accepted (Fallback)", "success");
            }
        } else {
            showToast("Video request declined", "info");
        }
    }
});

// Mobile Message Long-Press Menu
function openMobileMessageMenu(data, isMe, containerEl) {
    // Remove any existing
    const existing = document.getElementById("mobileMessageMenu");
    if (existing) existing.remove();
    const existingBackdrop = document.querySelector(".mobile-message-backdrop");
    if (existingBackdrop) existingBackdrop.remove();

    const menu = document.createElement("div");
    menu.id = "mobileMessageMenu";
    menu.className = "mobile-message-menu";
    
    // Backdrop
    const backdrop = document.createElement("div");
    backdrop.className = "mobile-message-backdrop";
    backdrop.onclick = () => { menu.remove(); backdrop.remove(); };
    
    const content = document.createElement("div");
    content.className = "mobile-message-content";

    // Emojis row
    const emojiRow = document.createElement("div");
    emojiRow.className = "mobile-menu-emojis";
    const emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
    emojis.forEach(emoji => {
        const btn = document.createElement("span");
        btn.textContent = emoji;
        btn.onclick = () => {
            socket.emit("react-message", {
                chatId: activeChatId,
                messageId: data.id,
                emoji: emoji
            });
            menu.remove(); backdrop.remove();
        };
        emojiRow.appendChild(btn);
    });
    content.appendChild(emojiRow);

    // Reply
    const replyBtn = document.createElement("button");
    replyBtn.className = "mobile-menu-btn";
    replyBtn.innerHTML = `Reply`;
    replyBtn.onclick = () => {
        initReply(data.id, data.message || (data.file ? "Media" : "Message"), data.name || data.mobileNumber || "Unknown");
        menu.remove(); backdrop.remove();
    };
    content.appendChild(replyBtn);

    // Forward
    const fwdBtn = document.createElement("button");
    fwdBtn.className = "mobile-menu-btn";
    fwdBtn.innerHTML = `Forward`;
    fwdBtn.onclick = () => {
        openForwardModal(data);
        menu.remove(); backdrop.remove();
    };
    content.appendChild(fwdBtn);

    // Delete
    const delBtn = document.createElement("button");
    delBtn.className = "mobile-menu-btn delete";
    delBtn.innerHTML = `Delete`;
    delBtn.onclick = () => {
        openDeleteModal(data.id, isMe);
        menu.remove(); backdrop.remove();
    };
    content.appendChild(delBtn);

    menu.appendChild(content);
    document.body.appendChild(backdrop);
    document.body.appendChild(menu);

    // Trigger animation
    setTimeout(() => {
        menu.classList.add("show");
        backdrop.classList.add("show");
    }, 10);
}

// Ensure offline status when user closes tab or navigates away
window.addEventListener("beforeunload", () => {
    if (socket && socket.connected) {
        socket.emit("explicit-disconnect");
    }
});