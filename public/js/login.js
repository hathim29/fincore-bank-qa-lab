document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorAlert = document.getElementById('errorAlert');
    const loginBtn = document.getElementById('loginBtn');

    // Hide any previous error
    errorAlert.classList.add('d-none');

    // Simple validation — hardcoded credentials for practice purposes
    const validUsername = 'admin';
    const validPassword = 'admin123';

    if (username === validUsername && password === validPassword) {
        // Success — disable button and redirect
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 800);
    } else {
        // Failure — show error alert
        errorAlert.classList.remove('d-none');
        document.getElementById('password').value = '';
    }
});