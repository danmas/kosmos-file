document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('config-editor');
    const saveButton = document.getElementById('btn-save');
    const toastElement = document.getElementById('liveToast');
    const toast = new bootstrap.Toast(toastElement);

    function showToast(message, isError = false) {
        const toastBody = toastElement.querySelector('.toast-body');
        toastBody.textContent = message;
        
        toastElement.classList.remove('bg-danger', 'bg-success', 'text-white');

        if (isError) {
            toastElement.classList.add('bg-danger', 'text-white');
        } else {
            toastElement.classList.add('bg-success', 'text-white');
        }
        toast.show();
    }

    // Загрузка текущей конфигурации
    fetch('/api/config')
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || 'Не удалось загрузить конфигурацию.')});
            }
            return response.json();
        })
        .then(data => {
            editor.value = data.config;
        })
        .catch(error => {
            console.error('Ошибка:', error);
            editor.value = `# Ошибка загрузки конфигурации:\n# ${error.message}`;
            showToast(error.message, true);
        });

    // Сохранение конфигурации
    saveButton.addEventListener('click', () => {
        const newConfigContent = editor.value;
        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Сохранение...';

        fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ config: newConfigContent }),
        })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ok, data}) => {
            if (!ok) {
                throw new Error(data.error || 'Неизвестная ошибка при сохранении.');
            }
            showToast(data.message || 'Конфигурация сохранена.');
        })
        .catch(error => {
            console.error('Ошибка сохранения:', error);
            showToast(error.message, true);
        })
        .finally(() => {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="bi bi-save"></i> Сохранить';
        });
    });
});
