async function resetPassword() {
    const mobileNumber = document.getElementById("mobileNumber").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();
    const btn = document.querySelector("button[type='submit']");
    const alertBox = document.getElementById("alert");

    // Clear previous alerts
    alertBox.style.display = "none";
    alertBox.className = "alert-box";

    if (!mobileNumber || !newPassword) {
        showAlert("Please fill in all fields", "danger");
        return;
    }

    if (newPassword.length < 6) {
        showAlert("Password must be at least 6 characters", "danger");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `Loading...`;

    try {
        const response = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mobileNumber, newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert("Password reset successfully! Redirecting to login...", "success");
            setTimeout(() => {
                window.location.href = "login.html";
            }, 1500);
        } else {
            showAlert(data.message || "Failed to reset password", "danger");
            btn.disabled = false;
            btn.innerHTML = "Reset Password";
        }
    } catch (err) {
        console.error("Reset Error:", err);
        showAlert("Network error. Please try again later.", "danger");
        btn.disabled = false;
        btn.innerHTML = "Reset Password";
    }
}

function showAlert(message, type) {
    const alertBox = document.getElementById("alert");
    alertBox.textContent = message;
    alertBox.className = `alert-box alert-${type}`;
    alertBox.style.display = "block";
}
