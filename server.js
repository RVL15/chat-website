require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const User = require("./models/User");
const Message = require("./models/Message");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

/* MongoDB Connection */
mongoose.connect(process.env.MONGO_URI);

mongoose.connection.once("open", async () => {

    console.log("✅ MongoDB Connected");

    try {

        await User.syncIndexes();

        console.log("✅ User Indexes Synced");

        console.log(
            "Database:",
            mongoose.connection.name
        );

    } catch (err) {

        console.log("Index Error:", err);

    }

});

mongoose.connection.on("error", (err) => {

    console.log("❌ MongoDB Error:", err);

});

/* Middleware */
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

app.use(express.static("public"));

/* Authentication Routes */
app.use("/api/auth", authRoutes);

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

/* Online Users Tracker */
const onlineUsers = new Map(); // socket.id -> username

/* Socket.IO */
io.on("connection", async (socket) => {
    const username = socket.user.username;
    const userId = socket.user.id;

    console.log(`🟢 User Connected: ${username} (${socket.id})`);

    onlineUsers.set(socket.id, username);

    // Broadcast updated online users list
    io.emit("online-users", Array.from(new Set(onlineUsers.values())));

    // Load and send message history (last 50)
    try {
        const messages = await Message.find()
            .populate("sender", "username")
            .sort({ createdAt: -1 })
            .limit(50);

        const history = messages.reverse().map(msg => ({
            username: msg.sender ? msg.sender.username : "Unknown",
            message: msg.message,
            createdAt: msg.createdAt
        }));

        socket.emit("message-history", history);
    } catch (err) {
        console.error("Error loading chat history:", err);
    }

    // Handle chat-message
    socket.on("chat-message", async (data) => {
        const messageText = typeof data === "string" ? data : data.message;
        if (!messageText || !messageText.trim()) return;

        const trimmedMsg = messageText.trim();
        console.log(`${username}: ${trimmedMsg}`);

        try {
            const message = new Message({
                sender: userId,
                message: trimmedMsg
            });
            await message.save();

            io.emit("chat-message", {
                username: username,
                message: trimmedMsg,
                createdAt: message.createdAt
            });
        } catch (err) {
            console.error("Error saving message:", err);
        }
    });

    // Handle typing status
    socket.on("typing", (isTyping) => {
        socket.broadcast.emit("typing", {
            username: username,
            isTyping: !!isTyping
        });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        console.log(`🔴 User Disconnected: ${username} (${socket.id})`);
        onlineUsers.delete(socket.id);
        io.emit("online-users", Array.from(new Set(onlineUsers.values())));
        socket.broadcast.emit("typing", {
            username: username,
            isTyping: false
        });
    });
});

/* Home Route */
app.get("/", (req, res) => {

    res.sendFile(
        __dirname + "/public/chat.html"
    );

});

/* Start Server */
server.listen(3000, () => {

    console.log(
        "🚀 Server Running on Port 3000"
    );

});