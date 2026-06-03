async function register() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const alertBox = document.getElementById("alert");

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Reset alerts
    alertBox.style.display = "none";
    alertBox.className = "alert-box";
    alertBox.textContent = "";

    if (!username || !password || !confirmPassword) {
        showAlert("Please fill in all fields", "danger");
        return;
    }

    if (password !== confirmPassword) {
        showAlert("Passwords do not match", "danger");
        return;
    }

    if (password.length < 6) {
        showAlert("Password must be at least 6 characters long", "danger");
        return;
    }

    try {
        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showAlert(data.message || "Registration failed", "danger");
            return;
        }

        showAlert("Account created successfully! Redirecting to login...", "success");

        // Disable input buttons/forms
        usernameInput.disabled = true;
        passwordInput.disabled = true;
        confirmPasswordInput.disabled = true;
        document.querySelector("button[type='submit']").disabled = true;

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);

    } catch (err) {
        console.error(err);
        showAlert("An error occurred during registration. Please try again.", "danger");
    }
}

function showAlert(message, type) {
    const alertBox = document.getElementById("alert");
    alertBox.textContent = message;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = "block";
}