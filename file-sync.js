const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const { debounce } = require('lodash');
const logger = require('./logger');

// Хранилище для отслеживания текущих операций синхронизации
// Используется для предотвращения циклических обновлений
const syncOperations = new Set();

// Хранилище для статуса синхронизации
const syncStatus = {
  isRunning: false,
  startTime: null,
  syncPairs: [],
  lastSyncTimes: {},
  watchers: null
};

/**
 * Создает полный путь к файлу на основе базовой директории и относительного пути
 * @param {Object} config - Конфигурация
 * @param {string} baseDir - Ключ базовой директории
 * @param {string} filePath - Относительный путь к файлу
 * @returns {string} - Полный путь к файлу
 */
function getFullPath(config, baseDir, filePath) {
  const basePath = config.baseDirs[baseDir];
  if (!basePath) {
    throw new Error(`Базовая директория "${baseDir}" не найдена в конфигурации`);
  }
  return path.join(basePath, filePath);
}

/**
 * Копирует файл из одного места в другое
 * @param {string} sourcePath - Полный путь к исходному файлу
 * @param {string} targetPath - Полный путь к целевому файлу
 * @returns {Promise<boolean>} - Успешно ли выполнено копирование
 */
async function copyFile(sourcePath, targetPath) {
  try {
    // Создаем директорию назначения, если она не существует
    await fs.ensureDir(path.dirname(targetPath));
    
    // Копируем файл
    await fs.copy(sourcePath, targetPath, { overwrite: true });
    logger.info(`Файл скопирован: ${sourcePath} -> ${targetPath}`);
    
    return true;
  } catch (error) {
    logger.error(`Ошибка при копировании файла ${sourcePath} -> ${targetPath}: ${error.message}`);
    return false;
  }
}

/**
 * Удаляет файл
 * @param {string} filePath - Полный путь к файлу
 * @returns {Promise<boolean>} - Успешно ли выполнено удаление
 */
async function removeFile(filePath) {
  try {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      logger.info(`Файл удален: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Ошибка при удалении файла ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Создает функцию синхронизации для пары файлов
 * @param {Object} config - Конфигурация
 * @param {Object} pair - Пара файлов для синхронизации
 * @param {string} direction - Направление синхронизации ('source-to-target' или 'target-to-source')
 * @returns {Function} - Функция синхронизации
 */
function createSyncFunction(config, pair, direction) {
  return debounce(async (event, filePath) => {
    // Определяем исходный и целевой пути в зависимости от направления
    const [source, target] = direction === 'source-to-target' 
      ? [pair.source, pair.target] 
      : [pair.target, pair.source];
    
    // Получаем полные пути к файлам
    const sourcePath = getFullPath(config, source.baseDir, source.path);
    const targetPath = getFullPath(config, target.baseDir, target.path);
    
    // Создаем уникальный идентификатор операции
    const operationId = `${sourcePath}:${targetPath}`;
    
    // Проверяем, не выполняется ли уже такая операция
    if (syncOperations.has(operationId)) {
      return;
    }
    
    // Добавляем операцию в список выполняемых
    syncOperations.add(operationId);
    
    try {
      // Выполняем операцию в зависимости от события
      if (event === 'add' || event === 'change') {
        await copyFile(filePath, targetPath);
      } else if (event === 'unlink') {
        await removeFile(targetPath);
      }
      
      // Обновляем время последней синхронизации
      syncStatus.lastSyncTimes[pair.name || `${source.baseDir}/${source.path} <-> ${target.baseDir}/${target.path}`] = new Date();
    } finally {
      // Удаляем операцию из списка выполняемых
      setTimeout(() => {
        syncOperations.delete(operationId);
      }, 1000); // Задержка для предотвращения быстрых повторных срабатываний
    }
  }, 500); // Задержка для дебаунсинга
}

/**
 * Настраивает наблюдение за файлом
 * @param {Object} config - Конфигурация
 * @param {Object} pair - Пара файлов для синхронизации
 * @returns {Object} - Объект с наблюдателями
 */
function setupFileWatchers(config, pair) {
  const sourcePath = getFullPath(config, pair.source.baseDir, pair.source.path);
  const targetPath = getFullPath(config, pair.target.baseDir, pair.target.path);
  
  // Создаем директории, если они не существуют
  fs.ensureDirSync(path.dirname(sourcePath));
  fs.ensureDirSync(path.dirname(targetPath));
  
  // Создаем функции синхронизации для обоих направлений
  const syncSourceToTarget = createSyncFunction(config, pair, 'source-to-target');
  const syncTargetToSource = createSyncFunction(config, pair, 'target-to-source');
  
  // Создаем наблюдателей для обоих файлов
  const sourceWatcher = chokidar.watch(sourcePath, config.watchOptions);
  const targetWatcher = chokidar.watch(targetPath, config.watchOptions);
  
  // Настраиваем обработчики событий
  sourceWatcher
    .on('add', (path) => {
      logger.info(`[${pair.name || 'Файл'}] Исходный файл добавлен: ${path}`);
      syncSourceToTarget('add', path);
    })
    .on('change', (path) => {
      logger.info(`[${pair.name || 'Файл'}] Исходный файл изменен: ${path}`);
      syncSourceToTarget('change', path);
    })
    .on('unlink', (path) => {
      logger.info(`[${pair.name || 'Файл'}] Исходный файл удален: ${path}`);
      syncSourceToTarget('unlink', path);
    })
    .on('error', (error) => {
      logger.error(`[${pair.name || 'Файл'}] Ошибка при отслеживании исходного файла: ${error}`);
    });
  
  targetWatcher
    .on('add', (path) => {
      logger.info(`[${pair.name || 'Файл'}] Целевой файл добавлен: ${path}`);
      syncTargetToSource('add', path);
    })
    .on('change', (path) => {
      logger.info(`[${pair.name || 'Файл'}] Целевой файл изменен: ${path}`);
      syncTargetToSource('change', path);
    })
    .on('unlink', (path) => {
      logger.info(`[${pair.name || 'Файл'}] Целевой файл удален: ${path}`);
      syncTargetToSource('unlink', path);
    })
    .on('error', (error) => {
      logger.error(`[${pair.name || 'Файл'}] Ошибка при отслеживании целевого файла: ${error}`);
    });
  
  return {
    sourceWatcher,
    targetWatcher
  };
}

/**
 * Выполняет начальную синхронизацию файлов
 * @param {Object} config - Конфигурация
 * @param {Object} pair - Пара файлов для синхронизации
 */
async function initialSync(config, pair) {
  const sourcePath = getFullPath(config, pair.source.baseDir, pair.source.path);
  const targetPath = getFullPath(config, pair.target.baseDir, pair.target.path);
  
  try {
    const sourceExists = await fs.pathExists(sourcePath);
    const targetExists = await fs.pathExists(targetPath);
    
    if (sourceExists && !targetExists) {
      // Если исходный файл существует, а целевой нет - копируем исходный в целевой
      await copyFile(sourcePath, targetPath);
    } else if (!sourceExists && targetExists) {
      // Если целевой файл существует, а исходный нет - копируем целевой в исходный
      await copyFile(targetPath, sourcePath);
    } else if (sourceExists && targetExists) {
      // Если оба файла существуют - сравниваем время модификации и копируем более новый
      const sourceStats = await fs.stat(sourcePath);
      const targetStats = await fs.stat(targetPath);
      
      if (sourceStats.mtimeMs > targetStats.mtimeMs) {
        await copyFile(sourcePath, targetPath);
      } else if (targetStats.mtimeMs > sourceStats.mtimeMs) {
        await copyFile(targetPath, sourcePath);
      }
    }
    // Если оба файла не существуют - ничего не делаем
  } catch (error) {
    logger.error(`Ошибка при начальной синхронизации ${pair.name || 'файлов'}: ${error.message}`);
  }
}

/**
 * Запускает синхронизацию для всех пар файлов из конфигурации
 * @param {Object} config - Конфигурация
 * @returns {Object} - Объект с наблюдателями
 */
function startSync(config) {
  if (!config || !config.syncPairs || !Array.isArray(config.syncPairs)) {
    throw new Error('Неверная конфигурация для синхронизации');
  }
  
  const watchers = [];
  
  // Сохраняем только необходимые данные из конфигурации в статусе
  // НЕ сохраняем полный объект config, чтобы избежать циклических ссылок
  syncStatus.syncPairs = config.syncPairs.map(pair => ({
    name: pair.name || `${pair.source.baseDir}/${pair.source.path} <-> ${pair.target.baseDir}/${pair.target.path}`,
    source: `${pair.source.baseDir}/${pair.source.path}`,
    target: `${pair.target.baseDir}/${pair.target.path}`
  }));
  
  // Обновляем статус
  syncStatus.isRunning = true;
  syncStatus.startTime = new Date();
  
  // Для каждой пары файлов
  config.syncPairs.forEach(pair => {
    // Выполняем начальную синхронизацию
    initialSync(config, pair);
    
    // Настраиваем наблюдателей
    const pairWatchers = setupFileWatchers(config, pair);
    watchers.push(pairWatchers);
  });
  
  // Сохраняем наблюдателей в статусе
  syncStatus.watchers = watchers;
  
  logger.info(`Синхронизация запущена для ${config.syncPairs.length} пар файлов`);
  
  return watchers;
}

/**
 * Останавливает все наблюдатели
 * @param {Array} watchers - Массив наблюдателей
 */
function stopSync(watchers = syncStatus.watchers) {
  if (!watchers || !Array.isArray(watchers)) return;
  
  watchers.forEach(watcher => {
    if (watcher.sourceWatcher) watcher.sourceWatcher.close();
    if (watcher.targetWatcher) watcher.targetWatcher.close();
  });
  
  // Обновляем статус
  syncStatus.isRunning = false;
  syncStatus.watchers = null;
  
  logger.info('Синхронизация остановлена');
}

/**
 * Получает текущий статус синхронизации
 * @returns {Object} - Объект со статусом (только сериализуемые данные)
 */
function getSyncStatus() {
  // Возвращаем только безопасные для сериализации данные
  return {
    isRunning: syncStatus.isRunning,
    startTime: syncStatus.startTime ? syncStatus.startTime.toISOString() : null,
    syncPairs: syncStatus.syncPairs || [],
    lastSyncTimes: Object.fromEntries(
      Object.entries(syncStatus.lastSyncTimes || {}).map(([key, value]) => 
        [key, value instanceof Date ? value.toISOString() : value]
      )
    ),
    // Добавляем дополнительные данные для UI
    uptime: syncStatus.startTime ? Math.floor((new Date() - syncStatus.startTime) / 1000) : 0
  };
}

/**
 * Инициализирует сервис синхронизации файлов
 * @param {Object} config - Конфигурация
 * @returns {Object} - Объект с методами управления
 */
function initFileSync(config) {
  // Запускаем синхронизацию
  const watchers = startSync(config);
  
  // Возвращаем методы управления
  return {
    start: () => {
      if (!syncStatus.isRunning) {
        return startSync(config);
      }
      return syncStatus.watchers;
    },
    stop: () => stopSync(),
    getStatus: getSyncStatus,
    restart: () => {
      stopSync();
      return startSync(config);
    }
  };
}

module.exports = {
  startSync,
  stopSync,
  getSyncStatus,
  initFileSync
};