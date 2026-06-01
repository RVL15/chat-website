async function login() {

    const username =
        document.getElementById("username").value;

    const password =
        document.getElementById("password").value;

    try {

        const response = await fetch(
            "/api/auth/login",
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

        localStorage.setItem(
            "token",
            data.token
        );

        localStorage.setItem(
            "username",
            data.username
        );

        alert("Login Successful");

        window.location.href = "chat.html";

    } catch (err) {

        console.error(err);

        alert("Login Failed");

    }
}