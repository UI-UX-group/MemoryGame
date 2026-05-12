//показ правил игры после ввода id пользователя
function showRules() {
    const nameInput = document.getElementById('userID');
    const name = nameInput.value.trim();

    if (name === "") {
        alert("Пожалуйста, введите ваш ID");
        return;
    }

    window.userID = name;

    document.querySelector('.registration').style.display = 'none';
    document.getElementById('rulesOverlay').style.display = 'flex';
}

//закрытие и переход на начальну страницу
function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
    location.reload();
}

// Экспортируем функции в глобальную область видимости
window.showRules = showRules;
window.closeModal = closeModal;