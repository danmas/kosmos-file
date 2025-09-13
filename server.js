const { loadConfig } = require('./config-loader');
const { initFileSync } = require('./file-sync');
const logger = require('./logger');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs-extra');

// Порт для веб-интерфейса
const PORT = process.env.PORT || 3003;

// Создаем Express приложение
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Обработка аргументов командной строки
const args = process.argv.slice(2);
let configPath = null;

// Проверяем, был ли передан путь к конфигурационному файлу
if (args.length > 0) {
  // Проверяем, не запрошена ли справка
  if (args[0] === '--help' || args[0] === '-h') {
    console.log('Использование: node server.js [путь_к_конфигурации]');
    console.log('');
    console.log('Опции:');
    console.log('  [путь_к_конфигурации]  Путь к YAML файлу конфигурации');
    console.log('  --help, -h             Показать эту справку');
    console.log('');
    console.log('По умолчанию используется путь из переменной окружения CONFIG_PATH или ./config.yaml');
    process.exit(0);
  }
  
  configPath = path.resolve(args[0]);
  logger.info(`Используется указанный конфигурационный файл: ${configPath}`);
  
  // Проверяем существование файла
  if (!fs.existsSync(configPath)) {
    logger.error(`Указанный конфигурационный файл не найден: ${configPath}`);
    logger.info('Используйте команду с аргументом --help для получения справки');
    process.exit(1);
  }
}

// Загружаем конфигурацию
const config = loadConfig(configPath);

if (!config) {
  logger.error('Не удалось загрузить конфигурацию. Сервер не запущен.');
  process.exit(1);
}

// Выводим информацию о загруженной конфигурации
logger.info('Конфигурация загружена успешно:');
logger.info(`- Базовые директории: ${Object.keys(config.baseDirs).length}`);
logger.info(`- Пары для синхронизации: ${config.syncPairs.length}`);

// Запускаем синхронизацию
let syncService = null;
try {
  syncService = initFileSync(config);
  
  // Выводим информацию о каждой паре
  config.syncPairs.forEach(pair => {
    logger.info(`- ${pair.name || 'Файл'}: ${pair.source.baseDir}/${pair.source.path} <-> ${pair.target.baseDir}/${pair.target.path}`);
  });
} catch (error) {
  logger.error(`Ошибка при запуске синхронизации: ${error.message}`);
  process.exit(1);
}

// Настраиваем статические файлы для веб-интерфейса
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API для получения статуса
app.get('/api/status', (req, res) => {
  res.json(syncService.getStatus());
});

// API для получения логов
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const level = req.query.level || null;
  res.json(logger.getLogs(limit, level));
});

// Настраиваем WebSocket для обновления данных в реальном времени
io.on('connection', (socket) => {
  logger.info('Клиент подключился к веб-интерфейсу');
  
  try {
    // Отправляем текущий статус при подключении
    socket.emit('status', syncService.getStatus());
    socket.emit('logs', logger.getLogs(100));
  } catch (error) {
    logger.error(`Ошибка при отправке данных клиенту: ${error.message}`);
  }
  
  // Обработчики команд от клиента
  socket.on('restart', () => {
    logger.info('Перезапуск синхронизации через веб-интерфейс');
    syncService.restart();
    try {
      socket.emit('status', syncService.getStatus());
    } catch (error) {
      logger.error(`Ошибка при отправке статуса: ${error.message}`);
    }
  });
  
  socket.on('stop', () => {
    logger.info('Остановка синхронизации через веб-интерфейс');
    syncService.stop();
    try {
      socket.emit('status', syncService.getStatus());
    } catch (error) {
      logger.error(`Ошибка при отправке статуса: ${error.message}`);
    }
  });
  
  socket.on('start', () => {
    logger.info('Запуск синхронизации через веб-интерфейс');
    syncService.start();
    try {
      socket.emit('status', syncService.getStatus());
    } catch (error) {
      logger.error(`Ошибка при отправке статуса: ${error.message}`);
    }
  });
  
  socket.on('disconnect', () => {
    logger.info('Клиент отключился от веб-интерфейса');
  });
});

// Запускаем сервер
server.listen(PORT, () => {
  logger.info(`Веб-интерфейс доступен по адресу http://localhost:${PORT}`);
});

// Обработка сигналов для корректного завершения
process.on('SIGINT', () => {
  logger.info('Получен сигнал SIGINT. Завершение работы...');
  if (syncService) {
    syncService.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM. Завершение работы...');
  if (syncService) {
    syncService.stop();
  }
  process.exit(0);
});

logger.info('\nСервер синхронизации файлов запущен');
logger.info('Нажмите Ctrl+C для завершения работы');

// Функция для отправки обновлений статуса всем клиентам
function broadcastStatus() {
  if (syncService) {
    try {
      const status = syncService.getStatus();
      io.emit('status', status);
    } catch (error) {
      logger.error(`Ошибка при отправке статуса: ${error.message}`);
    }
  }
}

// Функция для отправки новых логов всем клиентам
function broadcastLogs() {
  try {
    io.emit('logs', logger.getLogs(20));
  } catch (error) {
    console.error(`Ошибка при отправке логов: ${error.message}`);
  }
}

// Периодически отправляем обновления статуса
setInterval(broadcastStatus, 5000);

// Перехватываем логи для отправки через WebSocket
const originalInfo = logger.info;
const originalWarn = logger.warn;
const originalError = logger.error;
const originalDebug = logger.debug;

logger.info = function(message, ...args) {
  originalInfo(message, ...args);
  setTimeout(broadcastLogs, 100);
};

logger.warn = function(message, ...args) {
  originalWarn(message, ...args);
  setTimeout(broadcastLogs, 100);
};

logger.error = function(message, ...args) {
  originalError(message, ...args);
  setTimeout(broadcastLogs, 100);
};

logger.debug = function(message, ...args) {
  originalDebug(message, ...args);
  setTimeout(broadcastLogs, 100);
};