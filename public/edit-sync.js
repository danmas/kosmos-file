// Функция для управления темой
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme, themeIcon, themeText);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeUI(newTheme, themeIcon, themeText);
    });
    
    themeToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            themeToggle.click();
        }
    });
}

function updateThemeUI(theme, themeIcon, themeText) {
    if (theme === 'dark') {
        themeIcon.className = 'bi bi-moon-fill theme-toggle-icon';
        themeText.textContent = 'Темная';
    } else {
        themeIcon.className = 'bi bi-sun-fill theme-toggle-icon';
        themeText.textContent = 'Светлая';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // DOM элементы
    const pageTitle = document.getElementById('page-title');
    const syncName = document.getElementById('sync-name');
    const sourceBasedir = document.getElementById('source-basedir');
    const targetBasedir = document.getElementById('target-basedir');
    const sourceBrowser = document.getElementById('source-browser');
    const targetBrowser = document.getElementById('target-browser');
    const sourcePath = document.getElementById('source-path');
    const targetPath = document.getElementById('target-path');
    const sourceBreadcrumb = document.getElementById('source-breadcrumb');
    const targetBreadcrumb = document.getElementById('target-breadcrumb');
    const deleteOption = document.getElementById('delete-option');
    const btnSave = document.getElementById('btn-save');
    const btnDelete = document.getElementById('btn-delete');
    const toastElement = document.getElementById('liveToast');
    const toast = new bootstrap.Toast(toastElement);

    // Состояние редактора
    let syncIndex = null;
    let baseDirs = {};
    let sourceCurrentPath = '/';
    let targetCurrentPath = '/';

    // Получаем индекс синхронизации из URL
    const urlParams = new URLSearchParams(window.location.search);
    const syncIndexParam = urlParams.get('index');
    
    if (syncIndexParam === 'new') {
        pageTitle.textContent = 'Создание новой синхронизации';
        syncIndex = 'new';
    } else if (syncIndexParam !== null) {
        syncIndex = parseInt(syncIndexParam);
        btnDelete.style.display = 'block';
    }

    // Функция для отображения уведомлений
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

    // Загрузка базовых директорий
    function loadBaseDirs() {
        fetch('/api/basedirs')
            .then(response => response.json())
            .then(data => {
                baseDirs = data.baseDirs;
                
                // Заполняем селекты
                sourceBasedir.innerHTML = '<option value="">Выберите директорию</option>';
                targetBasedir.innerHTML = '<option value="">Выберите директорию</option>';
                
                Object.keys(baseDirs).forEach(key => {
                    const option1 = document.createElement('option');
                    option1.value = key;
                    option1.textContent = `${key} (${baseDirs[key]})`;
                    sourceBasedir.appendChild(option1);
                    
                    const option2 = document.createElement('option');
                    option2.value = key;
                    option2.textContent = `${key} (${baseDirs[key]})`;
                    targetBasedir.appendChild(option2);
                });
                
                // Если редактируем существующую синхронизацию, загружаем её данные
                if (syncIndex !== 'new' && syncIndex !== null) {
                    loadSyncData();
                }
            })
            .catch(error => {
                console.error('Ошибка загрузки базовых директорий:', error);
                showToast('Ошибка загрузки базовых директорий', true);
            });
    }

    // Загрузка данных синхронизации
    function loadSyncData() {
        fetch(`/api/sync/${syncIndex}`)
            .then(response => {
                if (!response.ok) throw new Error('Синхронизация не найдена');
                return response.json();
            })
            .then(data => {
                syncName.value = data.name || '';
                deleteOption.checked = data.syncOptions?.delete || false;
                
                // Устанавливаем source
                if (data.source) {
                    sourceBasedir.value = data.source.baseDir || '';
                    sourceCurrentPath = data.source.path || '/';
                    sourcePath.textContent = sourceCurrentPath;
                    updateBreadcrumb('source', sourceCurrentPath);
                    if (sourceBasedir.value) {
                        browsePath('source', sourceCurrentPath);
                    }
                }
                
                // Устанавливаем target
                if (data.target) {
                    targetBasedir.value = data.target.baseDir || '';
                    targetCurrentPath = data.target.path || '/';
                    targetPath.textContent = targetCurrentPath;
                    updateBreadcrumb('target', targetCurrentPath);
                    if (targetBasedir.value) {
                        browsePath('target', targetCurrentPath);
                    }
                }
            })
            .catch(error => {
                console.error('Ошибка загрузки данных синхронизации:', error);
                showToast('Ошибка загрузки данных синхронизации', true);
            });
    }

    // Обновление breadcrumb
    function updateBreadcrumb(type, path) {
        const breadcrumb = type === 'source' ? sourceBreadcrumb : targetBreadcrumb;
        breadcrumb.innerHTML = '';
        
        const parts = path.split('/').filter(p => p);
        
        // Корень
        const rootLi = document.createElement('li');
        rootLi.className = 'breadcrumb-item';
        rootLi.innerHTML = '<a href="#">/</a>';
        rootLi.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPath(type, '/');
        });
        breadcrumb.appendChild(rootLi);
        
        // Остальные части пути
        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += '/' + part;
            const li = document.createElement('li');
            li.className = 'breadcrumb-item';
            const isLast = index === parts.length - 1;
            
            if (isLast) {
                li.classList.add('active');
                li.textContent = part;
            } else {
                const pathCopy = currentPath; // Замыкание
                li.innerHTML = `<a href="#">${part}</a>`;
                li.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigateToPath(type, pathCopy);
                });
            }
            breadcrumb.appendChild(li);
        });
    }

    // Навигация по пути
    function navigateToPath(type, path) {
        if (type === 'source') {
            sourceCurrentPath = path;
            sourcePath.textContent = path;
            updateBreadcrumb('source', path);
            browsePath('source', path);
        } else {
            targetCurrentPath = path;
            targetPath.textContent = path;
            updateBreadcrumb('target', path);
            browsePath('target', path);
        }
    }

    // Просмотр содержимого пути
    function browsePath(type, path) {
        const basedir = type === 'source' ? sourceBasedir.value : targetBasedir.value;
        const browser = type === 'source' ? sourceBrowser : targetBrowser;
        
        if (!basedir) {
            browser.innerHTML = '<div class="text-center text-muted">Выберите базовую директорию</div>';
            return;
        }
        
        browser.innerHTML = '<div class="text-center text-muted">Загрузка...</div>';
        
        fetch(`/api/browse?basedir=${encodeURIComponent(basedir)}&path=${encodeURIComponent(path)}`)
            .then(response => {
                if (!response.ok) throw new Error('Ошибка загрузки содержимого');
                return response.json();
            })
            .then(data => {
                browser.innerHTML = '';
                
                // Кнопка "Назад" если не в корне
                if (path !== '/') {
                    const backItem = document.createElement('div');
                    backItem.className = 'file-item';
                    backItem.innerHTML = '<i class="bi bi-arrow-left"></i> ..';
                    backItem.addEventListener('click', () => {
                        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
                        navigateToPath(type, parentPath);
                    });
                    browser.appendChild(backItem);
                }
                
                // Отображаем директории и файлы
                if (data.items && data.items.length > 0) {
                    data.items.forEach(item => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'file-item';
                        const icon = item.type === 'directory' ? 'bi-folder-fill' : 'bi-file-earmark';
                        itemDiv.innerHTML = `<i class="bi ${icon}"></i> ${item.name}`;
                        
                        itemDiv.addEventListener('click', () => {
                            if (item.type === 'directory') {
                                const newPath = path === '/' ? `/${item.name}` : `${path}/${item.name}`;
                                navigateToPath(type, newPath);
                            } else {
                                // Выбран файл
                                const newPath = path === '/' ? `/${item.name}` : `${path}/${item.name}`;
                                if (type === 'source') {
                                    sourceCurrentPath = newPath;
                                    sourcePath.textContent = newPath;
                                } else {
                                    targetCurrentPath = newPath;
                                    targetPath.textContent = newPath;
                                }
                                
                                // Подсвечиваем выбранный элемент
                                browser.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
                                itemDiv.classList.add('selected');
                            }
                        });
                        
                        browser.appendChild(itemDiv);
                    });
                } else {
                    browser.innerHTML = '<div class="text-center text-muted">Папка пуста</div>';
                }
            })
            .catch(error => {
                console.error('Ошибка просмотра пути:', error);
                browser.innerHTML = '<div class="text-center text-danger">Ошибка загрузки</div>';
            });
    }

    // Сохранение синхронизации
    function saveSyncData() {
        const name = syncName.value.trim();
        if (!name) {
            showToast('Введите название синхронизации', true);
            return;
        }
        
        if (!sourceBasedir.value) {
            showToast('Выберите базовую директорию источника', true);
            return;
        }
        
        if (!targetBasedir.value) {
            showToast('Выберите базовую директорию назначения', true);
            return;
        }
        
        const syncData = {
            name: name,
            source: {
                baseDir: sourceBasedir.value,
                path: sourceCurrentPath
            },
            target: {
                baseDir: targetBasedir.value,
                path: targetCurrentPath
            },
            syncOptions: {
                delete: deleteOption.checked
            }
        };
        
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохранение...';
        
        const url = syncIndex === 'new' ? '/api/sync/new' : `/api/sync/${syncIndex}`;
        
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            showToast(data.message || 'Синхронизация сохранена');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        })
        .catch(error => {
            console.error('Ошибка сохранения:', error);
            showToast(error.message || 'Ошибка сохранения', true);
        })
        .finally(() => {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="bi bi-save"></i> Сохранить';
        });
    }

    // Удаление синхронизации
    function deleteSyncData() {
        if (!confirm('Вы уверены, что хотите удалить эту синхронизацию?')) {
            return;
        }
        
        fetch(`/api/sync/${syncIndex}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            showToast(data.message || 'Синхронизация удалена');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        })
        .catch(error => {
            console.error('Ошибка удаления:', error);
            showToast(error.message || 'Ошибка удаления', true);
        });
    }

    // Обработчики событий
    sourceBasedir.addEventListener('change', () => {
        sourceCurrentPath = '/';
        sourcePath.textContent = '/';
        updateBreadcrumb('source', '/');
        browsePath('source', '/');
    });
    
    targetBasedir.addEventListener('change', () => {
        targetCurrentPath = '/';
        targetPath.textContent = '/';
        updateBreadcrumb('target', '/');
        browsePath('target', '/');
    });
    
    btnSave.addEventListener('click', saveSyncData);
    btnDelete.addEventListener('click', deleteSyncData);

    // Инициализация
    loadBaseDirs();
});



