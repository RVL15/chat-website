function showToast(message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "";
    if (type === "success") {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
    } else if (type === "danger" || type === "error") {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
        `;
    } else {
        icon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
        `;
    }

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    setTimeout(() => {
        toast.classList.remove("show");
        toast.classList.add("hide");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

async function login() {
    const mobileInput = document.getElementById("mobileNumber");
    const passwordInput = document.getElementById("password");

    const mobileNumber = mobileInput.value.trim();
    const password = passwordInput.value;

    if (!mobileNumber || !password) {
        showToast("Please fill in all fields", "danger");
        return;
    }

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mobileNumber, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.message || "Invalid credentials", "danger");
            return;
        }

        // Store session values
        localStorage.setItem("token", data.token);
        localStorage.setItem("mobileNumber", data.mobileNumber);
        localStorage.setItem("name", data.name);

        showToast("Login Successful! Redirecting...", "success");

        setTimeout(() => {
            window.location.href = "chat.html";
        }, 800);

    } catch (err) {
        console.error(err);
        showToast("An error occurred. Please try again later.", "danger");
    }
}