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

let selectedAvatar = "preset:coral";

function selectPresetAvatar(presetName) {
    selectedAvatar = presetName;
    
    // Remove active class from all options
    const options = document.querySelectorAll(".preset-avatar-opt");
    options.forEach(opt => {
        opt.classList.remove("active");
    });
    
    // Find option corresponding to chosen preset and highlight it
    const activeOpt = Array.from(options).find(opt => {
        const onclickAttr = opt.getAttribute("onclick");
        return onclickAttr && onclickAttr.includes(presetName);
    });
    if (activeOpt) {
        activeOpt.classList.add("active");
    }
    
    // Update preview style
    const preview = document.getElementById("avatarPreview");
    if (preview) {
        preview.className = `avatar-preview-lg ${presetName.replace(":", "-")}`;
        preview.style.backgroundImage = "none";
    }
    
    // Show initials
    const initials = document.getElementById("avatarPreviewInitials");
    if (initials) initials.style.display = "block";
}

function handleCustomAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
        showToast("Please upload an image file", "danger");
        return;
    }
    
    // Validate size (limit to 1MB to prevent large base64 payload database hits)
    if (file.size > 1024 * 1024) {
        showToast("Image size must be less than 1MB", "danger");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result;
        selectedAvatar = base64Data;
        
        // Update preview style
        const preview = document.getElementById("avatarPreview");
        if (preview) {
            preview.className = "avatar-preview-lg";
            preview.style.backgroundImage = `url(${base64Data})`;
            preview.style.backgroundSize = "cover";
            preview.style.backgroundPosition = "center";
        }
        
        // Hide initials
        const initials = document.getElementById("avatarPreviewInitials");
        if (initials) initials.style.display = "none";
        
        // Remove active presets styling
        const options = document.querySelectorAll(".preset-avatar-opt");
        options.forEach(opt => opt.classList.remove("active"));
    };
    reader.readAsDataURL(file);
}

// Bind handlers to window scope so they are globally reachable
window.selectPresetAvatar = selectPresetAvatar;
window.handleCustomAvatarUpload = handleCustomAvatarUpload;

document.addEventListener("DOMContentLoaded", () => {
    const nameInput = document.getElementById("name");
    if (nameInput) {
        nameInput.addEventListener("input", () => {
            const name = nameInput.value.trim();
            const initialsSpan = document.getElementById("avatarPreviewInitials");
            if (name && initialsSpan) {
                const parts = name.split(" ").filter(Boolean);
                let initials = "";
                if (parts.length >= 2) {
                    initials = (parts[0][0] + parts[1][0]).toUpperCase();
                } else if (parts[0].length >= 2) {
                    initials = parts[0].substring(0, 2).toUpperCase();
                } else {
                    initials = parts[0].substring(0, 1).toUpperCase();
                }
                initialsSpan.textContent = initials;
            } else if (initialsSpan) {
                initialsSpan.textContent = "U";
            }
        });
    }
});

async function register() {
    const nameInput = document.getElementById("name");
    const mobileInput = document.getElementById("mobileNumber");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");

    const name = nameInput.value.trim();
    const mobileNumber = mobileInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!name || !mobileNumber || !password || !confirmPassword) {
        showToast("Please fill in all fields", "danger");
        return;
    }

    if (password !== confirmPassword) {
        showToast("Passwords do not match", "danger");
        return;
    }

    if (password.length < 6) {
        showToast("Password must be at least 6 characters long", "danger");
        return;
    }

    try {
        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                name, 
                mobileNumber, 
                password,
                profilePicture: selectedAvatar
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.message || "Registration failed", "danger");
            return;
        }

        showToast("Account created successfully! Redirecting to login...", "success");

        // Disable input buttons/forms
        nameInput.disabled = true;
        mobileInput.disabled = true;
        passwordInput.disabled = true;
        confirmPasswordInput.disabled = true;
        document.querySelector("button[type='submit']").disabled = true;

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);

    } catch (err) {
        console.error(err);
        showToast("An error occurred during registration. Please try again.", "danger");
    }
}