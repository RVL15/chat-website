const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("User Connected");

    socket.on("chat-message", (data) => {
        io.emit("chat-message", data);
    });
});

server.listen(3000, () => {
    console.log("Server Running on Port 3000");
});