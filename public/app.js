console.log("APP.JS LOADED");

const socket = io();

socket.on("connect", () => {
    console.log("Connected to Socket.IO");
});

function sendMessage() {

    const input =
        document.getElementById("message");

    if (!input) {
        alert("Message box not found");
        return;
    }

    const message = input.value.trim();

    if (!message) {
        return;
    }

    const username =
        localStorage.getItem("username") || "Guest";

    socket.emit("chat-message", {
        username,
        message
    });

    input.value = "";
}

socket.on("chat-message", (data) => {

    const messages =
        document.getElementById("messages");

    if (!messages) return;

    messages.innerHTML += `
        <p>
            <b>${data.username}:</b>
            ${data.message}
        </p>
    `;
});