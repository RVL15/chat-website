const token = localStorage.getItem("token");
const currentUsername = localStorage.getItem("username");

if (!token || !currentUsername) {
    localStorage.clear();
    window.location.href = "login.html";
}

// Update local profile widget details
document.getElementById("profileUsername").textContent = currentUsername;
const avatarEl = document.getElementById("userAvatar");
if (avatarEl) {
    // Preserve status dot while setting avatar initials
    avatarEl.innerHTML = `${currentUsername.substring(0, 2).toUpperCase()}<span class="status-dot"></span>`;
}

// Establish Socket.io connection with auth token
const socket = io({
    auth: { token }
});

// Set of usernames currently typing
const typingUsers = new Set();
let typingTimeout = null;

// Socket connection validation
socket.on("connect", () => {
    console.log("Connected to Socket.IO successfully");
});

socket.on("connect_error", (err) => {
    console.error("Socket authentication failed:", err.message);
    logout();
});

// Log out user
function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

// Send message
function sendMessage() {
    const input = document.getElementById("message");
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    // Send via socket
    socket.emit("chat-message", message);
    
    // Reset typing status immediately
    stopTyping();
    input.value = "";
    input.focus();
}

// Notify server about typing status
const inputField = document.getElementById("message");
if (inputField) {
    inputField.addEventListener("input", () => {
        socket.emit("typing", true);

        // Reset inactivity timer
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
    socket.emit("typing", false);
}

// Format message timestamp
function formatTime(dateStr) {
    try {
        const date = dateStr ? new Date(dateStr) : new Date();
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
        return "";
    }
}

// Append a message to UI safely (XSS-free)
function appendMessage(data, isHistory = false) {
    const container = document.getElementById("messages");
    if (!container) return;

    const isMe = data.username.toLowerCase() === currentUsername.toLowerCase();

    // Create wrapper node
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${isMe ? "sent" : "received"}`;

    // Add avatar block for received messages
    if (!isMe) {
        const avatar = document.createElement("div");
        avatar.className = "user-item-avatar";
        avatar.style.width = "36px";
        avatar.style.height = "36px";
        avatar.style.marginRight = "4px";
        avatar.textContent = data.username.substring(0, 2).toUpperCase();
        wrapper.appendChild(avatar);
    }

    // Create container for bubble and meta
    const bubbleContainer = document.createElement("div");
    bubbleContainer.className = "message-bubble-container";

    // Create message bubble
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = data.message; // textContent prevents XSS injection

    // Create meta time details
    const meta = document.createElement("div");
    meta.className = "message-meta";
    
    const timeString = formatTime(data.createdAt);
    if (isMe) {
        meta.textContent = timeString;
    } else {
        meta.textContent = `${data.username} • ${timeString}`;
    }

    bubbleContainer.appendChild(bubble);
    bubbleContainer.appendChild(meta);
    wrapper.appendChild(bubbleContainer);

    container.appendChild(wrapper);

    if (!isHistory) {
        scrollToBottom();
    }
}

// Scroll to bottom of message list
function scrollToBottom() {
    const container = document.getElementById("messages");
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// Socket Events Listeners
socket.on("message-history", (history) => {
    const container = document.getElementById("messages");
    if (container) container.innerHTML = ""; // Clean loading state
    
    history.forEach(msg => appendMessage(msg, true));
    scrollToBottom();
});

socket.on("chat-message", (data) => {
    appendMessage(data, false);
});

socket.on("online-users", (users) => {
    const listContainer = document.getElementById("usersList");
    const countBadge = document.getElementById("onlineCount");
    if (!listContainer || !countBadge) return;

    // Update count
    countBadge.textContent = users.length;

    // Rebuild online user items list
    listContainer.innerHTML = "";

    users.forEach(user => {
        const userItem = document.createElement("div");
        userItem.className = "user-item";

        const avatar = document.createElement("div");
        avatar.className = "user-item-avatar";
        avatar.textContent = user.substring(0, 2).toUpperCase();

        const name = document.createElement("div");
        name.className = "user-item-name";
        name.textContent = user + (user.toLowerCase() === currentUsername.toLowerCase() ? " (You)" : "");

        userItem.appendChild(avatar);
        userItem.appendChild(name);
        listContainer.appendChild(userItem);
    });
});

socket.on("typing", (data) => {
    const typingBar = document.getElementById("typingStatus");
    if (!typingBar) return;

    if (data.isTyping) {
        typingUsers.add(data.username);
    } else {
        typingUsers.delete(data.username);
    }

    // Render text
    if (typingUsers.size === 0) {
        typingBar.textContent = "";
    } else if (typingUsers.size === 1) {
        typingBar.textContent = `${Array.from(typingUsers)[0]} is typing...`;
    } else if (typingUsers.size === 2) {
        const arr = Array.from(typingUsers);
        typingBar.textContent = `${arr[0]} and ${arr[1]} are typing...`;
    } else {
        typingBar.textContent = "Multiple users are typing...";
    }
});