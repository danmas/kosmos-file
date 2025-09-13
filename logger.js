const fs = require('fs-extra');
const path = require('path');
const { format } = require('util');

// Создаем директорию для логов, если она не существует
const LOG_DIR = path.join(__dirname, 'logs');
fs.ensureDirSync(LOG_DIR);

// Путь к файлу логов
const LOG_FILE = path.join(LOG_DIR, `sync-${new Date().toISOString().split('T')[0]}.log`);

// Максимальное количество логов в памяти
const MAX_MEMORY_LOGS = 1000;

// Хранилище для логов в памяти (для отображения в UI)
const memoryLogs = [];

// Уровни логирования
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Текущий уровень логирования
let currentLogLevel = LOG_LEVELS.INFO;

/**
 * Устанавливает уровень логирования
 * @param {string} level - Уровень логирования (DEBUG, INFO, WARN, ERROR)
 */
function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    currentLogLevel = LOG_LEVELS[level];
  }
}

/**
 * Форматирует сообщение лога
 * @param {string} level - Уровень лога
 * @param {string} message - Сообщение
 * @returns {string} - Форматированное сообщение
 */
function formatLogMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Записывает сообщение в файл логов
 * @param {string} message - Сообщение для записи
 */
function writeToFile(message) {
  fs.appendFileSync(LOG_FILE, message + '\n');
}

/**
 * Добавляет сообщение в память
 * @param {string} level - Уровень лога
 * @param {string} message - Сообщение
 * @param {Object} meta - Дополнительные данные
 */
function addToMemory(level, message, meta = {}) {
  // Добавляем лог в начало массива (чтобы новые были сверху)
  memoryLogs.unshift({
    timestamp: new Date(),
    level,
    message,
    meta
  });

  // Ограничиваем количество логов в памяти
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.pop();
  }
}

/**
 * Логирует сообщение с заданным уровнем
 * @param {string} level - Уровень лога
 * @param {string} message - Сообщение или формат
 * @param {...any} args - Аргументы для форматирования
 */
function log(level, message, ...args) {
  // Проверяем уровень логирования
  if (LOG_LEVELS[level] < currentLogLevel) return;

  // Форматируем сообщение, если переданы аргументы
  const formattedMessage = args.length > 0 ? format(message, ...args) : message;
  
  // Форматируем лог
  const logMessage = formatLogMessage(level, formattedMessage);
  
  // Выводим в консоль
  if (level === 'ERROR') {
    console.error(logMessage);
  } else if (level === 'WARN') {
    console.warn(logMessage);
  } else {
    console.log(logMessage);
  }
  
  // Записываем в файл
  writeToFile(logMessage);
  
  // Добавляем в память
  addToMemory(level, formattedMessage);
}

/**
 * Получает все логи из памяти
 * @param {number} limit - Максимальное количество логов
 * @param {string} level - Фильтр по уровню (опционально)
 * @returns {Array} - Массив логов
 */
function getLogs(limit = MAX_MEMORY_LOGS, level = null) {
  let filteredLogs = memoryLogs;
  
  // Фильтруем по уровню, если указан
  if (level && LOG_LEVELS[level] !== undefined) {
    filteredLogs = filteredLogs.filter(log => log.level === level);
  }
  
  // Ограничиваем количество
  return filteredLogs.slice(0, limit);
}

/**
 * Очищает логи в памяти
 */
function clearMemoryLogs() {
  memoryLogs.length = 0;
}

// Экспортируем функции логирования
module.exports = {
  debug: (message, ...args) => log('DEBUG', message, ...args),
  info: (message, ...args) => log('INFO', message, ...args),
  warn: (message, ...args) => log('WARN', message, ...args),
  error: (message, ...args) => log('ERROR', message, ...args),
  setLogLevel,
  getLogs,
  clearMemoryLogs,
  LOG_LEVELS
};
