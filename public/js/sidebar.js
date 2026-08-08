// FinCore Bank — Shared Sidebar JS
// public/js/sidebar.js

(function () {
    const STORAGE_KEY = 'fincore_sidebar_collapsed';

    function init() {
        const sidebar  = document.querySelector('.sidebar');
        if (!sidebar) return;

        const footer   = sidebar.querySelector('.sidebar-footer');
        const logo     = sidebar.querySelector('.sidebar-logo');
        const navItems = sidebar.querySelectorAll('.nav-item');

        // ── 1. Add data-tooltip to nav items ──────────────────
        navItems.forEach(item => {
            const span = item.querySelector('span');
            if (span) item.setAttribute('data-tooltip', span.textContent.trim());
        });

        // ── 2. Make logo the toggle button ────────────────────
        if (logo) {
            // Replace text F with logo image
            const logoIcon = logo.querySelector('.logo-icon');
            if (logoIcon) {
                logoIcon.innerHTML = '';
                logoIcon.style.background = 'transparent';
                logoIcon.style.borderRadius = '0';
                logoIcon.style.width = '34px';
                logoIcon.style.height = '34px';
                const img = document.createElement('img');
                img.src = 'images/tempsidebarlogo.png';
                img.alt = 'FinCore Bank';
                img.style.cssText = 'width:34px;height:34px;border-radius:8px;object-fit:cover;display:block;';
                logoIcon.appendChild(img);
            }
            logo.style.cursor = 'pointer';
            logo.setAttribute('title', 'Toggle sidebar');
            logo.setAttribute('data-testid', 'sidebar-toggle');
        }

        // ── 3. Add user profile to sidebar footer ─────────────
        const user = JSON.parse(sessionStorage.getItem('fincore_user') || '{}');
        if (user.username && footer) {
            const userRow = document.createElement('div');
            userRow.className = 'sidebar-user';
            userRow.innerHTML = `
                <div class="sidebar-user-avatar">${user.username[0].toUpperCase()}</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name">${user.username}</div>
                    <div class="sidebar-user-role">${user.role || 'viewer'}</div>
                </div>
            `;
            footer.insertBefore(userRow, footer.firstChild);

            // Hide topbar avatar/username
            const topbarUser   = document.getElementById('topbarUser');
            const topbarAvatar = document.getElementById('topbarAvatar');
            if (topbarUser)   topbarUser.style.display   = 'none';
            if (topbarAvatar) topbarAvatar.style.display = 'none';
        }

        // ── 4. JS Tooltip ─────────────────────────────────────
        // Create single shared tooltip element
        const tooltip = document.createElement('div');
        tooltip.id = 'sidebar-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: #1e293b;
            color: #fff;
            font-size: 12px;
            font-weight: 500;
            padding: 5px 10px;
            border-radius: 6px;
            white-space: nowrap;
            pointer-events: none;
            z-index: 9999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.15s ease;
            font-family: Inter, sans-serif;
        `;
        document.body.appendChild(tooltip);

        navItems.forEach(item => {
            item.addEventListener('mouseenter', e => {
                if (!sidebar.classList.contains('collapsed')) return;
                const label = item.getAttribute('data-tooltip');
                if (!label) return;
                const rect = item.getBoundingClientRect();
                tooltip.textContent = label;
                tooltip.style.left  = (rect.right + 10) + 'px';
                tooltip.style.top   = (rect.top + rect.height/2 - 14) + 'px';
                tooltip.style.opacity = '1';
            });
            item.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
            });
        });

        // ── 5. Restore saved state ────────────────────────────
        const isCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';
        if (isCollapsed) sidebar.classList.add('collapsed');

        // ── 6. Toggle via logo click ──────────────────────────
        function toggle() {
            const willCollapse = !sidebar.classList.contains('collapsed');
            sidebar.classList.toggle('collapsed');
            tooltip.style.opacity = '0';
            localStorage.setItem(STORAGE_KEY, willCollapse);
        }

        if (logo) logo.addEventListener('click', toggle);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* ============================================================
   MOBILE SIDEBAR TOGGLE
   Add this at the END of public/js/sidebar.js
   ============================================================ */

// ── Mobile hamburger menu ──────────────────────────────────
function initMobileMenu() {
    const sidebar  = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    if (!sidebar) return;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    document.body.appendChild(overlay);

    // Create hamburger button
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger';
    hamburger.setAttribute('data-testid', 'hamburger-menu');
    hamburger.setAttribute('aria-label', 'Toggle menu');
    hamburger.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;

    // Insert hamburger before page title in topbar
    const topbarLeft = document.querySelector('.topbar-left');
    if (topbarLeft) {
        topbarLeft.insertBefore(hamburger, topbarLeft.firstChild);
    }

    // Toggle sidebar on hamburger click
    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    });

    // Close sidebar when overlay is clicked
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });

    // Close sidebar when a nav link is clicked on mobile
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
            }
        });
    });
}

// Run on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    initMobileMenu();
}