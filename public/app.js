const socket = io();

function sendMessage() {

    const username =
        document.getElementById("username").value;

    const message =
        document.getElementById("message").value;

    socket.emit("chat-message", {
        username,
        message
    });

    document.getElementById("message").value = "";
}

socket.on("chat-message", (data) => {

    const messages =
        document.getElementById("messages");

    messages.innerHTML += `
        <p>
        <b>${data.username}:</b>
        ${data.message}
        </p>
    `;

    messages.scrollTop =
        messages.scrollHeight;
});