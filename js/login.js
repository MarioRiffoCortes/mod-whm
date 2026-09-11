(function () {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    if (!loginForm) return;

    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const btn = loginForm.querySelector('button');

        loginError.textContent = '';
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

        try {
            const resp = await fetch('login.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await resp.json();

            if (data.success) {
                window.location.reload();
            } else {
                loginError.textContent = data.message || 'Error al ingresar';
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
            }
        } catch (err) {
            loginError.textContent = 'Error de conexión';
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
        }
    });
})();
