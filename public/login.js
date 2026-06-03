async function login() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const alertBox = document.getElementById("alert");

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    // Reset alert box
    alertBox.style.display = "none";
    alertBox.className = "alert-box";
    alertBox.textContent = "";

    if (!username || !password) {
        showAlert("Please fill in all fields", "danger");
        return;
    }

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showAlert(data.message || "Invalid credentials", "danger");
            return;
        }

        // Store session values
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);

        showAlert("Login Successful! Redirecting...", "success");

        setTimeout(() => {
            window.location.href = "chat.html";
        }, 800);

    } catch (err) {
        console.error(err);
        showAlert("An error occurred. Please try again later.", "danger");
    }
}

function showAlert(message, type) {
    const alertBox = document.getElementById("alert");
    alertBox.textContent = message;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = "block";
}