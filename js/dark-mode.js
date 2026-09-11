(function () {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'dark-mode-toggle';
    toggleBtn.id = 'darkModeToggle';
    toggleBtn.setAttribute('title', 'Cambiar modo claro/oscuro');
    toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
    document.body.appendChild(toggleBtn);

    const body = document.body;
    const icon = toggleBtn.querySelector('i');

    // Check saved preference
    const currentMode = localStorage.getItem('darkMode');
    if (currentMode === 'enabled') {
        body.classList.add('dark-mode');
        icon.className = 'fas fa-sun';
    }

    toggleBtn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');

        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('darkMode', 'enabled');
            icon.className = 'fas fa-sun';
        } else {
            localStorage.setItem('darkMode', 'disabled');
            icon.className = 'fas fa-moon';
        }
    });
})();
