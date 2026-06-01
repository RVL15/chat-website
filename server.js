require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const User = require("./models/User");

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

/* Socket.IO */
io.on("connection", (socket) => {

    console.log("🟢 User Connected");

    socket.on("chat-message", (data) => {

        console.log(
            `${data.username}: ${data.message}`
        );

        io.emit("chat-message", {
            username: data.username,
            message: data.message
        });

    });

    socket.on("disconnect", () => {

        console.log("🔴 User Disconnected");

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