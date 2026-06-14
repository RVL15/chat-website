require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const authRoutes = require("./routes/auth");
const User = require("./models/User");
const Message = require("./models/Message");
const Chat = require("./models/Chat");
const ChatRequest = require("./models/ChatRequest");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 5e6, // 5MB
    pingTimeout: 10000,
    pingInterval: 5000
});

/* MongoDB Connection */
mongoose.connect(process.env.MONGO_URI);

// Initialize Global Lounge room chat
async function initGlobalLounge() {
    try {
        let globalChat = await Chat.findOne({ name: "Global Lounge", isGroup: true });
        if (!globalChat) {
            globalChat = new Chat({
                name: "Global Lounge",
                isGroup: true,
                participants: []
            });
            await globalChat.save();
            console.log("⭐ Global Lounge Chat initialized");
        }
    } catch (err) {
        console.error("Failed to initialize Global Lounge chat:", err);
    }
}

// Enroll user in Global Lounge participants list
async function enrollInGlobalLounge(userId) {
    try {
        const globalChat = await Chat.findOne({ name: "Global Lounge", isGroup: true });
        if (globalChat) {
            if (!globalChat.participants.includes(userId)) {
                globalChat.participants.push(userId);
                await globalChat.save();
                console.log(`User ${userId} enrolled in Global Lounge`);
            }
        }
    } catch (err) {
        console.error("Enrolling in Global Lounge failed:", err);
    }
}

mongoose.connection.once("open", async () => {
    console.log("✅ MongoDB Connected");
    try {
        // Defensive check: ensure legacy users have name and mobileNumber
        const legacyUsers = await User.find({
            $or: [
                { name: { $exists: false } },
                { mobileNumber: { $exists: false } }
            ]
        });
        for (const u of legacyUsers) {
            let needsUpdate = false;
            if (!u.name) {
                u.name = "Legacy User";
                needsUpdate = true;
            }
            if (!u.mobileNumber) {
                u.mobileNumber = `N/A-${u._id}`;
                needsUpdate = true;
            }
            if (needsUpdate) {
                await u.save();
            }
        }
        if (legacyUsers.length > 0) {
            console.log(`Defensively updated ${legacyUsers.length} legacy users`);
        }

        await User.syncIndexes();
        console.log("✅ User Indexes Synced");
        await initGlobalLounge();
    } catch (err) {
        console.log("Startup Error:", err);
    }
});

mongoose.connection.on("error", (err) => {
    console.log("❌ MongoDB Error:", err);
});

/* Middleware */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Disable caching for admin files to fix browser cache issues
app.use((req, res, next) => {
    if (req.path.endsWith(".html") || req.path.endsWith(".js") || req.path.includes("admin") || req.path.includes("dashboard")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
    }
    next();
});

app.use(express.static("public"));

// Force redirect portal.html to dashboard.html
app.get("/portal.html", (req, res) => {
    res.redirect("/dashboard.html");
});

/* Authentication Routes */
app.use("/api/auth", authRoutes);

/* Track active connections (UserId -> Set of socket.ids) */
const onlineSockets = new Map();

// Admin API endpoint to fetch users via standard HTTP
app.get("/api/admin/users", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "No token provided" });
        }
        const token = authHeader.split(" ")[1];
        
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const isAdmin = decoded && (decoded.isAdmin || decoded.mobileNumber === "0000000000");
        if (!isAdmin) {
            return res.status(403).json({ message: "Not authorized" });
        }

        const users = await User.find({}, "name mobileNumber isOnline lastLogin createdAt").sort({ createdAt: -1 }).lean().maxTimeMS(5000);
        
        // Auto-backfill lastLogin for older users that don't have it
        const now = new Date();
        const userObjs = users.map(u => {
            const uObj = u.toObject();
            uObj.isAdmin = (uObj.mobileNumber === "0000000000");
            
            // Fix race condition: Overlay real-time synchronous online status from memory!
            if (onlineSockets.has(u._id.toString()) && onlineSockets.get(u._id.toString()).size > 0) {
                uObj.isOnline = true;
            }

            // If lastLogin is completely missing, give them a timestamp now so it doesn't say "Never"
            if (!uObj.lastLogin) {
                uObj.lastLogin = now;
                // Optional: Fire and forget DB update to save it permanently
                User.updateOne({ _id: u._id }, { lastLogin: now }).catch(e => console.log(e));
            }
            
            return uObj;
        });

        res.json(userObjs);
    } catch (err) {
        console.error("API error fetching users:", err);
        res.status(500).json({ message: "Server error: " + err.message });
    }
});

/* Socket.IO Authentication Middleware */
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication error: No token provided"));
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return next(new Error("Authentication error: Invalid token"));
        }
        socket.user = decoded;
        next();
    });
});

// Helper to establish a private chat room once request accepted
async function createPrivateChat(userAId, userBId) {
    try {
        let chat = await Chat.findOne({
            isGroup: false,
            participants: { $all: [userAId, userBId], $size: 2 }
        });

        if (!chat) {
            chat = new Chat({
                isGroup: false,
                participants: [userAId, userBId]
            });
            await chat.save();
        }

        // Automatically add each other to contacts upon request acceptance
        await User.findByIdAndUpdate(userAId, { $addToSet: { contacts: userBId } });
        await User.findByIdAndUpdate(userBId, { $addToSet: { contacts: userAId } });

        // Join online user sockets to new chat room
        [userAId, userBId].forEach(uId => {
            const uSockets = onlineSockets.get(uId.toString());
            if (uSockets) {
                uSockets.forEach(sId => {
                    const s = io.sockets.sockets.get(sId);
                    if (s) s.join(chat._id.toString());
                });
            }
        });

        // Notify both users in real-time
        io.to(chat._id.toString()).emit("new-chat", { chatId: chat._id });
        
        // Notify both of contacts/conversations reload
        [userAId, userBId].forEach(uId => {
            const uSockets = onlineSockets.get(uId.toString());
            if (uSockets) {
                uSockets.forEach(sId => {
                    const s = io.sockets.sockets.get(sId);
                    if (s) {
                        s.emit("get-conversations");
                        s.emit("get-contacts");
                    }
                });
            }
        });
    } catch (e) {
        console.error("Failed to create private chat:", e);
    }
}


// Helper to determine message status (sent = 1 tick, delivered = 2 ticks, read = 2 blue ticks)
function getMessageStatus(msg, chat, senderId) {
    if (!chat || !chat.participants) return "sent";
    const senderIdStr = senderId.toString();
    const otherParticipants = chat.participants.filter(p => p && p._id && p._id.toString() !== senderIdStr);

    if (otherParticipants.length === 0) {
        return "read";
    }

    // Check if read by all other participants (either via DB lastRead or by checking their active socket state)
    let allRead = true;
    for (const p of otherParticipants) {
        const pIdStr = p._id.toString();

        // Check if this participant currently has this chat active
        let isActivelyViewing = false;
        if (onlineSockets.has(pIdStr)) {
            const sockets = onlineSockets.get(pIdStr);
            for (const socketId of sockets) {
                const s = io.sockets.sockets.get(socketId);
                if (s && s.activeChatId && s.activeChatId.toString() === chat._id.toString()) {
                    isActivelyViewing = true;
                    break;
                }
            }
        }

        if (isActivelyViewing) {
            continue; // This participant has the chat active, so they read it instantly!
        }

        const lastReadTime = (chat.lastRead && typeof chat.lastRead.get === "function") ? chat.lastRead.get(pIdStr) : null;
        if (!lastReadTime || new Date(lastReadTime) < new Date(msg.createdAt)) {
            allRead = false;
            break;
        }
    }

    if (allRead) {
        return "read";
    }

    // Check if delivered (at least one other participant is online)
    let anyOnline = false;
    for (const p of otherParticipants) {
        const pIdStr = p._id.toString();
        if (onlineSockets.has(pIdStr) && onlineSockets.get(pIdStr).size > 0) {
            anyOnline = true;
            break;
        }
    }

    return anyOnline ? "delivered" : "sent";
}

/* Socket.IO Connections */
io.on("connection", async (socket) => {
    const mobileNumber = socket.user.mobileNumber;
    const name = socket.user.name;
    const userId = socket.user.id;

    console.log(`🟢 Socket Connected: ${name} (${mobileNumber}) (${socket.id})`);

    // Track active socket
    if (!onlineSockets.has(userId)) {
        onlineSockets.set(userId, new Set());
    }
    const userSockets = onlineSockets.get(userId);
    userSockets.add(socket.id);

    // Update status to online in database if it is the first tab connecting
    if (userSockets.size === 1) {
        try {
            await User.findByIdAndUpdate(userId, { isOnline: true });
            // Broadcast status change to everyone
            io.emit("presence-change", {
                userId,
                name,
                mobileNumber,
                isOnline: true
            });
        } catch (err) {
            console.error("Failed to update user presence to online:", err);
        }
    }

    // Enroll user in Global Lounge
    await enrollInGlobalLounge(userId);

    // Get my profile details
    socket.on("get-my-profile", async () => {
        try {
            const u = await User.findById(userId, "name mobileNumber profilePicture");
            socket.emit("my-profile", u);
        } catch (err) {
            console.error("Error in get-my-profile:", err);
        }
    });

    // Join room for all chats user participates in
    try {
        const chats = await Chat.find({ participants: userId });
        chats.forEach(chat => {
            socket.join(chat._id.toString());
        });
    } catch (err) {
        console.error("Error joining rooms on connect:", err);
    }

    // Retrieve full list of users with online presence details
    socket.on("get-users-list", async () => {
        console.log(`📥 get-users-list requested by: ${name} (${mobileNumber})`);
        try {
            const allUsers = await User.find({}, "name mobileNumber profilePicture isOnline lastSeen").lean();
            console.log(`📤 Sending users-list to ${name}:`, allUsers.length, "users");
            socket.emit("users-list", allUsers);
        } catch (err) {
            console.error("❌ get-users-list DB Error:", err);
        }
    });

    // ----------------------------------------
    // USER SEARCH & GATED CHAT REQUEST SYSTEM SOCKET LISTENERS
    // ----------------------------------------

    // Search users globally by name or mobile number (Phase B)
    socket.on("search-users", async ({ query }) => {
        try {
            const cleanedQuery = (query || "").trim();
            if (!cleanedQuery) {
                return socket.emit("search-users-result", []);
            }

            const users = await User.find({
                $or: [
                    { name: { $regex: cleanedQuery, $options: "i" } },
                    { mobileNumber: { $regex: cleanedQuery, $options: "i" } }
                ],
                _id: { $ne: userId }
            }, "name mobileNumber profilePicture isOnline lastSeen");

            const currentUserDoc = await User.findById(userId);
            const contactIds = (currentUserDoc.contacts || []).map(c => c.toString());

            const requests = await ChatRequest.find({
                $or: [
                    { sender: userId },
                    { receiver: userId }
                ]
            });

            const result = users.map(user => {
                const uIdStr = user._id.toString();
                const inContacts = contactIds.includes(uIdStr);

                const req = requests.find(r => 
                    (r.sender.toString() === userId && r.receiver.toString() === uIdStr) ||
                    (r.sender.toString() === uIdStr && r.receiver.toString() === userId)
                );

                let requestStatus = null;
                let requestId = null;
                if (req) {
                    requestId = req._id;
                    if (req.status === "accepted") {
                        requestStatus = "accepted";
                    } else if (req.status === "pending") {
                        requestStatus = (req.sender.toString() === userId) ? "pending_sent" : "pending_received";
                    } else if (req.status === "rejected") {
                        requestStatus = "rejected";
                    }
                }

                return {
                    id: user._id,
                    name: user.name,
                    mobileNumber: user.mobileNumber || "N/A",
                    profilePicture: user.profilePicture || "",
                    isOnline: user.isOnline,
                    lastSeen: user.lastSeen,
                    inContacts,
                    requestStatus,
                    requestId
                };
            });

            socket.emit("search-users-result", result);
        } catch (err) {
            console.error("Error searching users:", err);
            socket.emit("error-message", "Failed to search users");
        }
    });

    // Send a new chat request (Phase C)
    socket.on("send-chat-request", async ({ recipientId }) => {
        try {
            if (!recipientId || recipientId === userId) return;

            let req = await ChatRequest.findOne({
                $or: [
                    { sender: userId, receiver: recipientId },
                    { sender: recipientId, receiver: userId }
                ]
            });

            if (req) {
                if (req.status === "accepted") {
                    return socket.emit("error-message", "Chat request already accepted.");
                } else if (req.status === "pending" && req.sender.toString() === userId) {
                    return socket.emit("error-message", "Chat request is already pending.");
                } else if (req.status === "pending" && req.receiver.toString() === userId) {
                    // Accept automatically
                    req.status = "accepted";
                    await req.save();
                    await createPrivateChat(userId, recipientId);
                    return;
                } else if (req.status === "rejected") {
                    req.status = "pending";
                    req.sender = userId;
                    req.receiver = recipientId;
                    await req.save();
                }
            } else {
                req = new ChatRequest({
                    sender: userId,
                    receiver: recipientId,
                    status: "pending"
                });
                await req.save();
            }

            // Notify recipient if online
            const recipientSockets = onlineSockets.get(recipientId);
            if (recipientSockets) {
                const senderInfo = await User.findById(userId, "name mobileNumber profilePicture");
                recipientSockets.forEach(sId => {
                    io.to(sId).emit("new-incoming-request", {
                        requestId: req._id,
                        sender: {
                            id: userId,
                            name: senderInfo.name,
                            mobileNumber: senderInfo.mobileNumber,
                            profilePicture: senderInfo.profilePicture || ""
                        }
                    });
                });
            }

            socket.emit("chat-request-sent", { recipientId, status: "pending_sent", requestId: req._id });
        } catch (err) {
            console.error("Error sending chat request:", err);
            socket.emit("error-message", "Failed to send chat request");
        }
    });

    // Respond to chat request (Phase C)
    socket.on("respond-to-chat-request", async ({ requestId, action }) => {
        try {
            if (!requestId || !action) return;

            const req = await ChatRequest.findById(requestId);
            if (!req) return socket.emit("error-message", "Request not found");

            if (req.receiver.toString() !== userId) {
                return socket.emit("error-message", "Unauthorized action");
            }

            if (action === "accept") {
                req.status = "accepted";
                await req.save();

                await createPrivateChat(req.sender.toString(), req.receiver.toString());

                socket.emit("chat-request-responded", { requestId, status: "accepted" });

                // Notify sender if online
                const senderSockets = onlineSockets.get(req.sender.toString());
                if (senderSockets) {
                    senderSockets.forEach(sId => {
                        io.to(sId).emit("chat-request-accepted-alert", {
                            requestId: req._id,
                            receiverId: userId
                        });
                    });
                }
            } else if (action === "reject") {
                await ChatRequest.findByIdAndDelete(requestId);
                socket.emit("chat-request-responded", { requestId, status: "rejected" });
            }

            socket.emit("get-chat-requests");
            socket.emit("get-conversations");
            socket.emit("get-contacts");
        } catch (err) {
            console.error("Error responding to chat request:", err);
            socket.emit("error-message", "Failed to respond to chat request");
        }
    });

    // Get incoming and outgoing chat requests (Phase C)
    socket.on("get-chat-requests", async () => {
        try {
            const incoming = await ChatRequest.find({ receiver: userId, status: "pending" })
                .populate("sender", "name profilePicture mobileNumber");

            const outgoing = await ChatRequest.find({ sender: userId, status: "pending" })
                .populate("receiver", "name profilePicture mobileNumber");

            socket.emit("chat-requests-list", {
                incoming: incoming.map(r => ({
                    requestId: r._id,
                    sender: {
                        id: r.sender._id,
                        name: r.sender.name,
                        profilePicture: r.sender.profilePicture || "",
                        mobileNumber: r.sender.mobileNumber || ""
                    }
                })),
                outgoing: outgoing.map(r => ({
                    requestId: r._id,
                    receiver: {
                        id: r.receiver._id,
                        name: r.receiver.name,
                        profilePicture: r.receiver.profilePicture || "",
                        mobileNumber: r.receiver.mobileNumber || ""
                    }
                }))
            });
        } catch (err) {
            console.error("Error fetching chat requests:", err);
        }
    });

    // Get saved contact list (Phase D)
    socket.on("get-contacts", async () => {
        try {
            const userDoc = await User.findById(userId).populate("contacts", "name mobileNumber profilePicture isOnline lastSeen");
            if (!userDoc) return;

            const list = userDoc.contacts.map(c => ({
                id: c._id,
                name: c.name,
                mobileNumber: c.mobileNumber || "",
                profilePicture: c.profilePicture || "",
                isOnline: c.isOnline,
                lastSeen: c.lastSeen
            }));

            socket.emit("contacts-list", list);
        } catch (err) {
            console.error("Error fetching contacts:", err);
        }
    });

    // Add user to contacts manual (Phase D)
    socket.on("add-to-contacts", async ({ contactId }) => {
        try {
            if (!contactId || contactId === userId) return;

            await User.findByIdAndUpdate(userId, {
                $addToSet: { contacts: contactId }
            });

            const userDoc = await User.findById(userId).populate("contacts", "name mobileNumber profilePicture isOnline lastSeen");
            const list = userDoc.contacts.map(c => ({
                id: c._id,
                name: c.name,
                mobileNumber: c.mobileNumber || "",
                profilePicture: c.profilePicture || "",
                isOnline: c.isOnline,
                lastSeen: c.lastSeen
            }));

            socket.emit("contacts-list", list);
            socket.emit("contact-added", { contactId });
        } catch (err) {
            console.error("Error adding contact:", err);
        }
    });

    // Remove user from contacts manual (Phase D)
    socket.on("remove-from-contacts", async ({ contactId }) => {
        try {
            if (!contactId) return;

            await User.findByIdAndUpdate(userId, {
                $pull: { contacts: contactId }
            });

            const userDoc = await User.findById(userId).populate("contacts", "name mobileNumber profilePicture isOnline lastSeen");
            const list = userDoc.contacts.map(c => ({
                id: c._id,
                name: c.name,
                mobileNumber: c.mobileNumber || "",
                profilePicture: c.profilePicture || "",
                isOnline: c.isOnline,
                lastSeen: c.lastSeen
            }));

            socket.emit("contacts-list", list);
            socket.emit("contact-removed", { contactId });
        } catch (err) {
            console.error("Error removing contact:", err);
        }
    });

    // Retrieve active conversation/chats list
    socket.on("get-conversations", async () => {
        try {
            console.time(`get-conversations-${userId}`);
            const chats = await Chat.find({ participants: userId })
                .populate("participants", "name mobileNumber profilePicture isOnline lastSeen")
                .sort({ lastMessageAt: -1 })
                .lean();

            const conversationsBasic = chats.map(chat => ({
                id: chat._id,
                isGroup: chat.isGroup,
                name: chat.name,
                participants: chat.participants.map(p => ({
                    id: p._id,
                    name: p.name,
                    mobileNumber: p.mobileNumber,
                    profilePicture: p.profilePicture || "",
                    isOnline: p.isOnline,
                    lastSeen: p.lastSeen
                })),
                admin: chat.admin,
                onlyAdminsCanMessage: chat.onlyAdminsCanMessage,
                lastMessage: null,
                unreadCount: 0
            }));

            // Stage 1: Emit basic chats instantly
            socket.emit("conversations-list", conversationsBasic);
            console.timeEnd(`get-conversations-${userId}`);

            // Stage 2: Fetch latest chat previews and unread counts in background
            Promise.all(chats.map(async (chat) => {
                try {
                    const lastMsg = await Message.findOne({
                        chat: chat._id,
                        deletedFor: { $ne: userId }
                    }).populate("sender", "name mobileNumber").sort({ createdAt: -1 }).lean();

                    const lastReadTime = chat.lastRead && chat.lastRead[userId.toString()] ? new Date(chat.lastRead[userId.toString()]) : new Date(0);
                    const unreadCount = await Message.countDocuments({
                        chat: chat._id,
                        createdAt: { $gt: lastReadTime },
                        sender: { $ne: userId },
                        deletedFor: { $ne: userId }
                    });

                    return {
                        id: chat._id,
                        lastMessage: lastMsg ? {
                            sender: lastMsg.sender ? lastMsg.sender.name : "System",
                            senderMobile: lastMsg.sender ? lastMsg.sender.mobileNumber : "",
                            message: lastMsg.message,
                            createdAt: lastMsg.createdAt
                        } : null,
                        unreadCount
                    };
                } catch (err) {
                    return null;
                }
            })).then(updates => {
                const validUpdates = updates.filter(u => u !== null);
                socket.emit("conversations-previews", validUpdates);
            });

        } catch (err) {
            console.error("Error loading conversations list:", err);
        }
    });

    // Start 1-to-1 Private Chat
    socket.on("start-private-chat", async ({ recipientMobile }) => {
        try {
            const recipient = await User.findOne({ mobileNumber: recipientMobile.trim() });
            if (!recipient) return socket.emit("error-message", "Recipient not found");

            // Don't start a private chat with yourself
            if (recipient._id.toString() === userId.toString()) return;

            // Check if 1-to-1 chat already exists
            let chat = await Chat.findOne({
                isGroup: false,
                participants: { $all: [userId, recipient._id], $size: 2 }
            });

            if (!chat) {
                chat = new Chat({
                    isGroup: false,
                    participants: [userId, recipient._id]
                });
                await chat.save();
            }

            // Make initiator sockets join the room
            const initiatorSockets = onlineSockets.get(userId.toString());
            if (initiatorSockets) {
                initiatorSockets.forEach(sId => {
                    const s = io.sockets.sockets.get(sId);
                    if (s) s.join(chat._id.toString());
                });
            }

            // Make recipient sockets join the room
            const recipientSockets = onlineSockets.get(recipient._id.toString());
            if (recipientSockets) {
                recipientSockets.forEach(sId => {
                    const s = io.sockets.sockets.get(sId);
                    if (s) s.join(chat._id.toString());
                });
            }

            io.to(chat._id.toString()).emit("new-chat", { chatId: chat._id });
        } catch (err) {
            console.error("Error starting private chat:", err);
        }
    });

    // Create Group Chat
    socket.on("create-group", async ({ groupName, participantMobiles }) => {
        try {
            if (!groupName || !groupName.trim()) return;

            const participants = await User.find({
                mobileNumber: { $in: participantMobiles.map(m => m.trim()) }
            }).lean();
            const participantIds = participants.map(p => p._id);

            // Add creator ID
            if (!participantIds.some(id => id.toString() === userId.toString())) {
                participantIds.push(userId);
            }

            const chat = new Chat({
                isGroup: true,
                name: groupName.trim(),
                participants: participantIds,
                admin: userId
            });
            await chat.save();

            // Join all sockets for online participants to the room
            participantIds.forEach(pId => {
                const pSockets = onlineSockets.get(pId.toString());
                if (pSockets) {
                    pSockets.forEach(sId => {
                        const s = io.sockets.sockets.get(sId);
                        if (s) s.join(chat._id.toString());
                    });
                }
            });

            io.to(chat._id.toString()).emit("new-chat", { chatId: chat._id });
            console.log(`👥 Group created: ${groupName} by admin ${name} (${mobileNumber})`);
        } catch (err) {
            console.error("Error creating group:", err);
        }
    });

    // Leave Group
    socket.on("leave-group", async ({ chatId }) => {
        try {
            socket.activeChatId = null;
            const chat = await Chat.findById(chatId);
            if (!chat || !chat.isGroup) return;

            // Remove participant
            chat.participants = chat.participants.filter(p => p.toString() !== userId);

            if (chat.participants.length === 0) {
                await Chat.findByIdAndDelete(chatId);
                await Message.deleteMany({ chat: chatId });
            } else {
                // Re-assign admin if owner left
                if (chat.admin && chat.admin.toString() === userId) {
                    chat.admin = chat.participants[0];
                }
                await chat.save();

                // Save system broadcast notification message
                const msg = new Message({
                    chat: chatId,
                    sender: userId, // system identifier
                    message: `${name} left the group`
                });
                await msg.save();

                io.to(chatId).emit("chat-message", {
                    chatId: chatId,
                    id: msg._id,
                    name: "System",
                    mobileNumber: "",
                    message: msg.message,
                    createdAt: msg.createdAt
                });
            }

            socket.leave(chatId);
            socket.emit("left-chat", { chatId });
            io.to(chatId).emit("new-chat", { chatId });
        } catch (err) {
            console.error("Error leaving group:", err);
        }
    });

    // Scoped Update Group Settings (restricted messaging toggles)
    socket.on("update-group-settings", async ({ chatId, onlyAdminsCanMessage }) => {
        try {
            const chat = await Chat.findById(chatId);
            if (!chat || !chat.isGroup) return;

            // Verify admin rights
            if (!chat.admin || chat.admin.toString() !== userId.toString()) {
                return socket.emit("error-message", "Only admins can update group settings");
            }

            chat.onlyAdminsCanMessage = !!onlyAdminsCanMessage;
            await chat.save();

            // Emit update to room
            io.to(chatId).emit("group-settings-updated", {
                chatId,
                onlyAdminsCanMessage: chat.onlyAdminsCanMessage
            });

            // Save system notification
            const systemMsg = new Message({
                chat: chatId,
                sender: userId, // system identifier
                message: `Admin ${name} changed settings: ${chat.onlyAdminsCanMessage ? "Only Admins can send messages" : "All members can send messages"}`
            });
            await systemMsg.save();

            io.to(chatId).emit("chat-message", {
                chatId: chatId,
                id: systemMsg._id,
                name: "System",
                mobileNumber: "",
                message: systemMsg.message,
                createdAt: systemMsg.createdAt
            });
        } catch (err) {
            console.error("Error updating group settings:", err);
        }
    });

    // Scoped Manage Group Members (add, kick, make admin)
    socket.on("manage-group-members", async ({ chatId, action, targetUserId, targetMobile }) => {
        try {
            const chat = await Chat.findById(chatId).populate("participants", "name mobileNumber");
            if (!chat || !chat.isGroup) return;

            // Verify admin rights
            if (!chat.admin || chat.admin.toString() !== userId.toString()) {
                return socket.emit("error-message", "Only admins can manage group members");
            }

            let systemAlertText = "";

            if (action === "add") {
                if (!targetMobile || !targetMobile.trim()) return;
                const targetUser = await User.findOne({ mobileNumber: targetMobile.trim() });
                if (!targetUser) {
                    return socket.emit("error-message", "User with this mobile number not found");
                }

                if (chat.participants.some(p => p._id.toString() === targetUser._id.toString())) {
                    return socket.emit("error-message", "User is already in this group");
                }

                chat.participants.push(targetUser._id);
                await chat.save();

                // Enroll target user sockets to the room
                const targetSockets = onlineSockets.get(targetUser._id.toString());
                if (targetSockets) {
                    targetSockets.forEach(sId => {
                        const s = io.sockets.sockets.get(sId);
                        if (s) {
                            s.join(chatId.toString());
                            s.emit("get-conversations");
                        }
                    });
                }

                systemAlertText = `${name} added ${targetUser.name}`;

            } else if (action === "remove") {
                if (!targetUserId) return;
                if (targetUserId.toString() === userId.toString()) {
                    return socket.emit("error-message", "Admin cannot remove themselves");
                }

                const targetUser = await User.findById(targetUserId);
                if (!targetUser) return;

                chat.participants = chat.participants.filter(p => p._id.toString() !== targetUserId.toString());
                if (chat.admin.toString() === targetUserId.toString()) {
                    chat.admin = chat.participants[0] ? chat.participants[0]._id : null;
                }
                await chat.save();

                // Make target user sockets leave room
                const targetSockets = onlineSockets.get(targetUserId.toString());
                if (targetSockets) {
                    targetSockets.forEach(sId => {
                        const s = io.sockets.sockets.get(sId);
                        if (s) {
                            s.leave(chatId.toString());
                            s.emit("left-chat", { chatId });
                            s.emit("get-conversations");
                        }
                    });
                }

                systemAlertText = `${name} removed ${targetUser.name}`;

            } else if (action === "make-admin") {
                if (!targetUserId) return;
                const targetUser = await User.findById(targetUserId);
                if (!targetUser) return;

                if (!chat.participants.some(p => p._id.toString() === targetUserId.toString())) {
                    return socket.emit("error-message", "User is not a participant in this group");
                }

                chat.admin = targetUserId;
                await chat.save();

                systemAlertText = `${targetUser.name} is now a group admin`;
            }

            // Save system broadcast notification
            if (systemAlertText) {
                const alertMsg = new Message({
                    chat: chatId,
                    sender: userId,
                    message: systemAlertText
                });
                await alertMsg.save();

                io.to(chatId).emit("chat-message", {
                    chatId: chatId,
                    id: alertMsg._id,
                    name: "System",
                    mobileNumber: "",
                    message: alertMsg.message,
                    createdAt: alertMsg.createdAt
                });
            }

            // Repopulate participants
            const updatedChat = await Chat.findById(chatId).populate("participants", "name mobileNumber profilePicture isOnline lastSeen");
            io.to(chatId).emit("group-members-updated", {
                chatId,
                participants: updatedChat.participants.map(p => ({
                    id: p._id,
                    name: p.name,
                    mobileNumber: p.mobileNumber,
                    profilePicture: p.profilePicture || "",
                    isOnline: p.isOnline,
                    lastSeen: p.lastSeen
                })),
                admin: updatedChat.admin
            });

        } catch (err) {
            console.error("Error managing group members:", err);
        }
    });

    // Load Chat Message History
    socket.on("load-messages", async ({ chatId }) => {
        try {
            console.time(`load-messages-${chatId}`);
            socket.activeChatId = chatId;
            const chat = await Chat.findOne({ _id: chatId, participants: userId })
                .populate("participants", "name mobileNumber");
            if (!chat) return;

            // Mark read
            if (!chat.lastRead) chat.lastRead = new Map();
            chat.lastRead.set(userId, new Date());
            await chat.save();

            // Broadcast read receipt update
            socket.to(chatId).emit("messages-read", { chatId, readerId: userId });

            const messages = await Message.find({
                chat: chatId,
                deletedFor: { $ne: userId }
            })
            .populate("sender", "name mobileNumber")
            .sort({ createdAt: 1 })
            .limit(20)
            .lean();

            const list = messages.map(msg => {
                const senderId = msg.sender ? msg.sender._id : null;
                const status = senderId ? getMessageStatus(msg, chat, senderId) : "read";
                return {
                    id: msg._id,
                    name: msg.sender ? msg.sender.name : "System",
                    mobileNumber: msg.sender ? msg.sender.mobileNumber : "",
                    message: msg.message,
                    createdAt: msg.createdAt,
                    status,
                    file: msg.file,
                    reactions: msg.reactions || [],
                    replyTo: msg.replyTo
                };
            });

            socket.emit("message-history", { chatId, messages: list });
            socket.emit("unread-updated", { chatId, unreadCount: 0 });
            console.timeEnd(`load-messages-${chatId}`);
        } catch (err) {
            console.error("Error loading messages:", err);
        }
    });

    // Scoped Chat Message Send
    socket.on("chat-message", async ({ chatId, message, file, replyTo }) => {
        if (!chatId) return;
        const trimmedMsg = message ? message.trim() : "";
        if (!trimmedMsg && !file) return;

        try {
            const chat = await Chat.findOne({ _id: chatId, participants: userId })
                .populate("participants", "name mobileNumber");
            if (!chat) return;

            // Restricted messaging check
            if (chat.onlyAdminsCanMessage && chat.admin && chat.admin.toString() !== userId.toString()) {
                socket.emit("error-message", "Only admins can send messages in this group");
                return;
            }

            const msg = new Message({
                chat: chatId,
                sender: userId,
                message: trimmedMsg,
                file: file || undefined,
                replyTo: replyTo || undefined
            });
            await msg.save();

            // Update chat meta
            chat.lastMessageAt = Date.now();
            if (!chat.lastRead) chat.lastRead = new Map();
            chat.lastRead.set(userId, new Date());
            await chat.save();

            const status = getMessageStatus(msg, chat, userId);

            io.to(chatId).emit("chat-message", {
                chatId: chatId,
                id: msg._id,
                name: name,
                mobileNumber: mobileNumber,
                message: trimmedMsg,
                createdAt: msg.createdAt,
                status,
                file: msg.file,
                reactions: [],
                replyTo: msg.replyTo
            });
        } catch (err) {
            console.error("Error sending scoped message:", err);
        }
    });

    // Scoped React Message
    socket.on("react-message", async ({ chatId, messageId, emoji }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) return;

            // Find existing reaction from this user
            const existingIdx = message.reactions.findIndex(r => r.userId.toString() === userId.toString());

            if (existingIdx !== -1) {
                if (message.reactions[existingIdx].emoji === emoji || !emoji) {
                    // Remove reaction if same emoji or empty emoji
                    message.reactions.splice(existingIdx, 1);
                } else {
                    // Update reaction emoji
                    message.reactions[existingIdx].emoji = emoji;
                }
            } else if (emoji) {
                // Add new reaction
                message.reactions.push({
                    userId: userId,
                    userName: name,
                    emoji: emoji
                });
            }

            await message.save();

            // Broadcast reaction update
            io.to(chatId).emit("message-reacted", {
                chatId,
                messageId,
                reactions: message.reactions
            });
        } catch (err) {
            console.error("Error reacting to message:", err);
        }
    });

    // Scoped Mark Message as Read
    socket.on("mark-read", async ({ chatId }) => {
        try {
            socket.activeChatId = chatId;
            const chat = await Chat.findOne({ _id: chatId, participants: userId });
            if (!chat) return;
            if (!chat.lastRead) chat.lastRead = new Map();
            chat.lastRead.set(userId, new Date());
            await chat.save();
            socket.emit("unread-updated", { chatId, unreadCount: 0 });
            
            // Broadcast read receipt update
            io.to(chatId).emit("messages-read", { chatId, readerId: userId });
        } catch (err) {
            console.error(err);
        }
    });

    // Scoped Typing Indicator status
    socket.on("typing", ({ chatId, isTyping }) => {
        socket.to(chatId).emit("typing", {
            chatId,
            name,
            mobileNumber,
            isTyping: !!isTyping
        });
    });

    // Scoped Deletion
    socket.on("delete-message", async ({ messageId, deleteType }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) return;

            if (deleteType === "everyone") {
                if (message.sender.toString() !== userId) {
                    console.log(`⚠️ User ${name} (${mobileNumber}) unauthorized delete-for-everyone attempt`);
                    return;
                }

                await Message.findByIdAndDelete(messageId);
                io.to(message.chat.toString()).emit("message-deleted", { messageId, deleteType: "everyone" });
                console.log(`🗑️ Deleted everyone message: ${messageId}`);
            } else if (deleteType === "me") {
                if (!message.deletedFor.includes(userId)) {
                    message.deletedFor.push(userId);
                    await message.save();
                }
                socket.emit("message-deleted", { messageId, deleteType: "me" });
                console.log(`🗑️ Deleted me message: ${messageId}`);
            }
        } catch (err) {
            console.error("Error deleting message:", err);
        }
    });

    // ----------------------------------------
    // WEBRTC CALLING SYSTEM
    // ----------------------------------------

    // Initiate Call
    socket.on("call-user", ({ recipientId, type, callerName, callerAvatar, callerMobile }) => {
        const recipientSockets = onlineSockets.get(recipientId.toString());
        if (recipientSockets) {
            recipientSockets.forEach(sId => {
                io.to(sId).emit("incoming-call", {
                    callerId: userId,
                    callerName,
                    callerAvatar,
                    callerMobile,
                    type
                });
            });
        } else {
            // Recipient is offline
            socket.emit("call-rejected", { reason: "User is offline" });
        }
    });

    // Respond to Call
    socket.on("call-response", ({ callerId, status, reason }) => {
        const callerSockets = onlineSockets.get(callerId.toString());
        if (callerSockets) {
            callerSockets.forEach(sId => {
                if (status === "accepted") {
                    io.to(sId).emit("call-accepted", { responderId: userId });
                } else {
                    io.to(sId).emit("call-rejected", { reason: reason || "User declined" });
                }
            });
        }
    });

    // WebRTC Signaling Exchange
    socket.on("webrtc-signal", ({ targetId, signalData }) => {
        const targetSockets = onlineSockets.get(targetId.toString());
        if (targetSockets) {
            targetSockets.forEach(sId => {
                io.to(sId).emit("webrtc-signal", {
                    senderId: userId,
                    signalData
                });
            });
        }
    });

    // End Call
    socket.on("end-call", ({ targetId }) => {
        const targetSockets = onlineSockets.get(targetId.toString());
        if (targetSockets) {
            targetSockets.forEach(sId => {
                io.to(sId).emit("call-ended", { senderId: userId });
            });
        }
    });

    // Video Upgrade Signaling
    socket.on("video-upgrade-request", ({ targetId }) => {
        const targetSockets = onlineSockets.get(targetId.toString());
        if (targetSockets) {
            targetSockets.forEach(sId => {
                io.to(sId).emit("video-upgrade-request", { senderId: userId });
            });
        }
    });

    socket.on("video-upgrade-response", ({ targetId, status }) => {
        const targetSockets = onlineSockets.get(targetId.toString());
        if (targetSockets) {
            targetSockets.forEach(sId => {
                io.to(sId).emit("video-upgrade-response", { senderId: userId, status });
            });
        }
    });

    // Admin: Get all users
    socket.on("admin-get-users", async () => {
        console.log("Admin get users hit by", socket.user?.name, socket.user?.mobileNumber);
        const isAdmin = socket.user && (socket.user.isAdmin || socket.user.mobileNumber === "0000000000");
        if (!isAdmin) {
            console.log("User is not admin, aborting.");
            return;
        }
        try {
            console.log("Fetching users from DB...");
            const users = await User.find({}, "name mobileNumber isOnline lastLogin createdAt")
                                    .sort({ createdAt: -1 })
                                    .lean();
            console.log(`Found ${users.length} users in DB. Processing...`);
            const userObjs = users.map(u => {
                const uObj = u;
                uObj.isAdmin = (uObj.mobileNumber === "0000000000");
                return uObj;
            });
            console.log("Emitting admin-users-data to client...");
            socket.emit("admin-users-data", JSON.parse(JSON.stringify(userObjs)));
            console.log("Emit complete.");
        } catch (err) {
            console.error("Error fetching users for admin:", err);
            socket.emit("admin-users-error", err.message);
        }
    });

    // Admin: Delete user and their messages
    socket.on("admin-delete-user", async (targetUserId) => {
        const isAdmin = socket.user.isAdmin || socket.user.mobileNumber === "0000000000";
        if (!isAdmin) return;
        try {
            const userToDelete = await User.findById(targetUserId);
            if (!userToDelete) return;
            
            if (userToDelete.mobileNumber === "0000000000") return;

            await Chat.updateMany({}, { $pull: { participants: targetUserId } });
            await Message.deleteMany({ sender: targetUserId });
            await User.findByIdAndDelete(targetUserId);
            
            socket.emit("admin-user-deleted", targetUserId);
        } catch (err) {
            console.error("Error deleting user:", err);
        }
    });

    // Explicit disconnect from beforeunload
    socket.on("explicit-disconnect", () => {
        socket.disconnect(true);
    });

    // Disconnect Action
    socket.on("disconnect", async () => {
        console.log(`🔴 Socket Disconnected: ${name} (${mobileNumber}) (${socket.id})`);
        const userSockets = onlineSockets.get(userId);
        if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
                onlineSockets.delete(userId);

                try {
                    const now = new Date();
                    await User.findByIdAndUpdate(userId, {
                        isOnline: false,
                        lastSeen: now
                    });
                    // Broadcast offline status change
                    io.emit("presence-change", {
                        userId,
                        name,
                        mobileNumber,
                        isOnline: false,
                        lastSeen: now
                    });
                } catch (err) {
                    console.error("Failed to update user presence to offline:", err);
                }
            }
        }
    });
});

/* Home Route */
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/chat.html");
});

/* Start Server */
server.listen(3000, () => {
    console.log("🚀 Server Running on Port 3000");
});