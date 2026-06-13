const io = require("socket.io-client");

const socket = io("http://localhost:3000", {
    auth: { token: process.argv[2] } // Pass token as argument
});

socket.on("connect", () => {
    console.log("Connected with ID:", socket.id);
    socket.emit("admin-get-users");
});

socket.on("admin-users-data", (users) => {
    console.log("Received users:", users.length);
    console.log(users[0]);
    process.exit(0);
});

socket.on("connect_error", (err) => {
    console.log("Connect Error:", err.message);
    process.exit(1);
});

socket.on("disconnect", (reason) => {
    console.log("Disconnected:", reason);
});
