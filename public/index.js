// Подключение к серверу через WebSocket
const socket = io();

// DOM элементы
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const serverStatus = document.getElementById('server-status');
const serverUptime = document.getElementById('server-uptime');
const syncPairsCount = document.getElementById('sync-pairs-count');
const syncPairsList = document.getElementById('sync-pairs-list');
const logsContainer = document.getElementById('logs-container');
const logLevel = document.getElementById('log-level');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnRestart = document.getElementById('btn-restart');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnRefreshLogs = document.getElementById('btn-refresh-logs');

// Форматирование времени
function formatTime(seconds) {
    if (seconds < 60) {
        return `${seconds} сек.`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes} мин. ${remainingSeconds} сек.`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours} ч. ${minutes} мин.`;
    }
}

// Форматирование даты и времени
function formatDateTime(timestamp) {
    if (!timestamp) return 'Никогда';
    
    try {
        // Если timestamp - это строка ISO, преобразуем её в объект Date
        const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (error) {
        console.error('Ошибка форматирования даты:', error);
        return 'Недоступно';
    }
}

// Обновление статуса сервера
function updateStatus(status) {
    if (!status) {
        console.error('Получен пустой статус');
        return;
    }
    
    // Обновляем индикатор статуса
    if (status.isRunning) {
        statusIndicator.className = 'status-dot active';
        statusText.textContent = 'Работает';
        serverStatus.textContent = 'Активен';
        serverStatus.className = 'text-success';
    } else {
        statusIndicator.className = 'status-dot inactive';
        statusText.textContent = 'Остановлен';
        serverStatus.textContent = 'Остановлен';
        serverStatus.className = 'text-danger';
    }
    
    // Обновляем время работы
    serverUptime.textContent = formatTime(status.uptime || 0);
    
    // Проверяем наличие syncPairs
    const syncPairs = Array.isArray(status.syncPairs) ? status.syncPairs : [];
    
    // Обновляем количество пар файлов
    syncPairsCount.textContent = syncPairs.length;
    
    // Обновляем список пар файлов
    syncPairsList.innerHTML = '';
    
    if (syncPairs.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="2" class="text-center">Нет синхронизируемых файлов</td>';
        syncPairsList.appendChild(row);
    } else {
        syncPairs.forEach(pair => {
            if (!pair) return; // Пропускаем пустые элементы
            
            const row = document.createElement('tr');
            const lastSyncTime = status.lastSyncTimes && pair.name ? 
                status.lastSyncTimes[pair.name] || null : null;
            
            const pairName = pair.name || 'Безымянная пара';
            const source = pair.source || 'Не указан';
            const target = pair.target || 'Не указан';
            
            row.innerHTML = `
                <td>
                    <div><strong>${pairName}</strong></div>
                    <small class="text-muted">${source} ↔ ${target}</small>
                </td>
                <td>
                    <div class="last-sync-time">${formatDateTime(lastSyncTime)}</div>
                </td>
            `;
            
            syncPairsList.appendChild(row);
        });
    }
    
    // Обновляем состояние кнопок
    btnStart.disabled = !!status.isRunning;
    btnStop.disabled = !status.isRunning;
    btnRestart.disabled = !status.isRunning;
}

// Добавление лога в контейнер
function addLog(log) {
    if (!log || typeof log !== 'object') {
        console.error('Некорректный формат лога:', log);
        return;
    }
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${log.level || 'INFO'}`;
    
    let timestamp = 'Н/Д';
    try {
        if (log.timestamp) {
            timestamp = new Date(log.timestamp).toLocaleTimeString('ru-RU');
        }
    } catch (error) {
        console.error('Ошибка при форматировании времени лога:', error);
    }
    
    logEntry.innerHTML = `
        <span class="timestamp">[${timestamp}]</span>
        <span class="level">[${log.level || 'INFO'}]</span>
        <span class="message">${log.message || 'Нет сообщения'}</span>
    `;
    
    logsContainer.appendChild(logEntry);
    
    // Прокручиваем к последнему логу
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Обновление списка логов
function updateLogs(logs) {
    // Очищаем контейнер
    logsContainer.innerHTML = '';
    
    // Проверяем, что logs - это массив
    if (!Array.isArray(logs)) {
        console.error('Получены некорректные логи:', logs);
        logsContainer.innerHTML = '<div class="text-center p-3">Ошибка загрузки логов</div>';
        return;
    }
    
    // Фильтруем логи по уровню
    const selectedLevel = logLevel.value;
    let filteredLogs = logs;
    
    if (selectedLevel !== 'all') {
        filteredLogs = logs.filter(log => log && log.level === selectedLevel);
    }
    
    // Добавляем логи в контейнер
    if (filteredLogs.length === 0) {
        logsContainer.innerHTML = '<div class="text-center p-3">Нет логов</div>';
    } else {
        filteredLogs.forEach(log => {
            if (log) {
                try {
                    addLog(log);
                } catch (error) {
                    console.error('Ошибка при добавлении лога:', error, log);
                }
            }
        });
    }
}

// Запрос статуса сервера
function fetchStatus() {
    fetch('/api/status')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(status => {
            try {
                updateStatus(status);
            } catch (error) {
                console.error('Ошибка при обработке статуса:', error);
            }
        })
        .catch(error => {
            console.error('Ошибка при получении статуса:', error);
            statusIndicator.className = 'status-dot inactive';
            statusText.textContent = 'Ошибка соединения';
        });
}

// Запрос логов
function fetchLogs() {
    fetch('/api/logs')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(logs => {
            try {
                updateLogs(logs);
            } catch (error) {
                console.error('Ошибка при обработке логов:', error);
                logsContainer.innerHTML = '<div class="text-center p-3">Ошибка обработки логов</div>';
            }
        })
        .catch(error => {
            console.error('Ошибка при получении логов:', error);
            logsContainer.innerHTML = '<div class="text-center p-3">Ошибка загрузки логов</div>';
        });
}

// Инициализация страницы
function init() {
    // Загружаем начальные данные
    fetchStatus();
    fetchLogs();
    
    // Обработчики событий WebSocket
    socket.on('status', status => {
        try {
            updateStatus(status);
        } catch (error) {
            console.error('Ошибка при обновлении статуса:', error);
        }
    });
    
    socket.on('logs', logs => {
        try {
            updateLogs(logs);
        } catch (error) {
            console.error('Ошибка при обновлении логов:', error);
        }
    });
    
    socket.on('connect_error', (error) => {
        console.error('Ошибка подключения к серверу:', error);
        statusIndicator.className = 'status-dot inactive';
        statusText.textContent = 'Ошибка подключения';
    });
    
    socket.on('error', (error) => {
        console.error('Ошибка WebSocket:', error);
    });
    
    // Обработчики кнопок
    btnStart.addEventListener('click', () => {
        socket.emit('start');
    });
    
    btnStop.addEventListener('click', () => {
        socket.emit('stop');
    });
    
    btnRestart.addEventListener('click', () => {
        socket.emit('restart');
    });
    
    btnClearLogs.addEventListener('click', () => {
        logsContainer.innerHTML = '<div class="text-center p-3">Логи очищены</div>';
    });
    
    btnRefreshLogs.addEventListener('click', () => {
        fetchLogs();
    });
    
    // Обработчик изменения уровня логов
    logLevel.addEventListener('change', () => {
        fetchLogs();
    });
    
    // Обновляем статус каждые 10 секунд
    setInterval(fetchStatus, 10000);
}

// Запускаем инициализацию при загрузке страницы
document.addEventListener('DOMContentLoaded', init);
