// FinCore Bank — Client Auth Helper
// Include this on every protected page BEFORE other scripts

(function () {
    const token = sessionStorage.getItem('fincore_token');

    if (!token) {
        window.location.replace('login.html');
        return;
    }

    // Expose a helper to add Authorization header to all fetch calls
    window.authFetch = function (url, options = {}) {
        return fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            }
        }).then(res => {
            if (res.status === 401 || res.status === 403) {
                // Token expired or invalid — redirect to login
                sessionStorage.removeItem('fincore_token');
                sessionStorage.removeItem('fincore_user');
                window.location.replace('login.html');
            }
            return res;
        });
    };

    // Expose logout helper
    window.fincoreLogout = function () {
        fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
            sessionStorage.removeItem('fincore_token');
            sessionStorage.removeItem('fincore_user');
            window.location.replace('login.html');
        });
    };
})();
