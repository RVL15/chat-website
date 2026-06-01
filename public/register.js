async function register() {

    const username =
        document.getElementById("username").value;

    const password =
        document.getElementById("password").value;

    const response = await fetch(
        "/api/auth/register",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {

        alert(data.message);

        return;
    }

    alert(data.message);

    window.location.href = "login.html";
}