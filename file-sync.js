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
      await fs.remove(filePath); // fs.remove работает и для файлов, и для директорий
      logger.info(`Объект удален: ${filePath}`);
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
 * Создает функцию синхронизации для пары директорий
 * @param {Object} config - Конфигурация
 * @param {Object} pair - Пара директорий для синхронизации
 * @param {string} direction - Направление синхронизации ('source-to-target' или 'target-to-source')
 * @returns {Function} - Функция синхронизации
 */
function createDirSyncFunction(config, pair, direction) {
  const [source, target] = direction === 'source-to-target' 
    ? [pair.source, pair.target] 
    : [pair.target, pair.source];

  const sourceDir = getFullPath(config, source.baseDir, source.path);
  const targetDir = getFullPath(config, target.baseDir, target.path);

  return debounce(async (event, changedPath) => {
    // Определяем относительный путь измененного файла/директории
    const relativePath = path.relative(sourceDir, changedPath);
    if (relativePath.startsWith('..')) {
      logger.warn(`Путь ${changedPath} находится вне отслеживаемой директории ${sourceDir}. Игнорируется.`);
      return;
    }
    const targetPath = path.join(targetDir, relativePath);

    // Создаем уникальный идентификатор операции
    const operationId = `${changedPath}:${targetPath}`;
    
    // Проверяем, не выполняется ли уже такая операция
    if (syncOperations.has(operationId)) {
      return;
    }
    
    // Добавляем операцию в список выполняемых
    syncOperations.add(operationId);
    
    try {
      // Выполняем операцию в зависимости от события
      switch (event) {
        case 'add':
        case 'change':
          await copyFile(changedPath, targetPath);
          break;
        case 'addDir':
          await fs.ensureDir(targetPath);
          logger.info(`Директория создана: ${targetPath}`);
          break;
        case 'unlink':
        case 'unlinkDir':
          await removeFile(targetPath);
          break;
      }
      
      // Обновляем время последней синхронизации
      syncStatus.lastSyncTimes[pair.name || `${source.baseDir}/${source.path} <-> ${target.baseDir}/${target.path}`] = new Date();
    } finally {
      // Удаляем операцию из списка выполняемых с задержкой
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
 * Настраивает наблюдение за директорией
 * @param {Object} config - Конфигурация
 * @param {Object} pair - Пара директорий для синхронизации
 * @returns {Object} - Объект с наблюдателями
 */
function setupDirWatchers(config, pair) {
  const sourceDir = getFullPath(config, pair.source.baseDir, pair.source.path);
  const targetDir = getFullPath(config, pair.target.baseDir, pair.target.path);
  
  // Создаем директории, если они не существуют
  fs.ensureDirSync(sourceDir);
  fs.ensureDirSync(targetDir);
  
  // Создаем функции синхронизации для обоих направлений
  const syncSourceToTarget = createDirSyncFunction(config, pair, 'source-to-target');
  const syncTargetToSource = createDirSyncFunction(config, pair, 'target-to-source');
  
  const commonWatchOptions = { ...config.watchOptions, ignoreInitial: false }; // ignoreInitial: false для initial sync

  // Создаем наблюдателей для обоих директорий
  const sourceWatcher = chokidar.watch(sourceDir, commonWatchOptions);
  const targetWatcher = chokidar.watch(targetDir, commonWatchOptions);
  
  // Настраиваем обработчики событий
  sourceWatcher
    .on('all', (event, path) => {
      logger.debug(`[${pair.name || 'Директория'}] Событие в исходной директории: ${event} - ${path}`);
      syncSourceToTarget(event, path);
    })
    .on('error', (error) => {
      logger.error(`[${pair.name || 'Директория'}] Ошибка при отслеживании исходной директории: ${error}`);
    });
  
  targetWatcher
    .on('all', (event, path) => {
      logger.debug(`[${pair.name || 'Директория'}] Событие в целевой директории: ${event} - ${path}`);
      syncTargetToSource(event, path);
    })
    .on('error', (error) => {
      logger.error(`[${pair.name || 'Директория'}] Ошибка при отслеживании целевой директории: ${error}`);
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
  
  logger.info(`[${pair.name || 'Файл'}] Начальная синхронизация: ${sourcePath} <-> ${targetPath}`);
  
  try {
    const sourceExists = await fs.pathExists(sourcePath);
    const targetExists = await fs.pathExists(targetPath);
    
    logger.info(`[${pair.name || 'Файл'}] Исходный файл существует: ${sourceExists}, целевой файл существует: ${targetExists}`);
    
    if (sourceExists && !targetExists) {
      // Если исходный файл существует, а целевой нет - копируем исходный в целевой
      logger.info(`[${pair.name || 'Файл'}] Копирование исходного файла в целевой`);
      await copyFile(sourcePath, targetPath);
    } else if (!sourceExists && targetExists) {
      // Если целевой файл существует, а исходный нет - копируем целевой в исходный
      logger.info(`[${pair.name || 'Файл'}] Копирование целевого файла в исходный`);
      await copyFile(targetPath, sourcePath);
    } else if (sourceExists && targetExists) {
      // Если оба файла существуют - сравниваем время модификации и копируем более новый
      const sourceStats = await fs.stat(sourcePath);
      const targetStats = await fs.stat(targetPath);
      
      logger.info(`[${pair.name || 'Файл'}] Оба файла существуют, сравнение времени модификации`);
      
      if (sourceStats.mtimeMs > targetStats.mtimeMs) {
        logger.info(`[${pair.name || 'Файл'}] Исходный файл новее, копируем в целевой`);
        await copyFile(sourcePath, targetPath);
      } else if (targetStats.mtimeMs > sourceStats.mtimeMs) {
        logger.info(`[${pair.name || 'Файл'}] Целевой файл новее, копируем в исходный`);
        await copyFile(targetPath, sourcePath);
      } else {
        logger.info(`[${pair.name || 'Файл'}] Файлы одинаковые по времени модификации, синхронизация не требуется`);
      }
    } else {
      // Если оба файла не существуют - ничего не делаем
      logger.info(`[${pair.name || 'Файл'}] Оба файла не существуют, синхронизация не требуется`);
    }
  } catch (error) {
    logger.error(`Ошибка при начальной синхронизации ${pair.name || 'файлов'}: ${error.message}`);
  }
}

/**
 * Выполняет начальную синхронизацию директорий
 * @param {Object} config - Конфигурация
 * @param {Object} pair - Пара директорий для синхронизации
 */
async function initialDirSync(config, pair) {
  const sourceDir = getFullPath(config, pair.source.baseDir, pair.source.path);
  const targetDir = getFullPath(config, pair.target.baseDir, pair.target.path);

  logger.info(`[${pair.name || 'Директория'}] Начальная синхронизация: ${sourceDir} <-> ${targetDir}`);

  try {
    // Синхронизируем из source в target
    await syncDirectories(sourceDir, targetDir, pair.name, pair.syncOptions);
    // Синхронизируем из target в source
    await syncDirectories(targetDir, sourceDir, pair.name, pair.syncOptions);
  } catch (error) {
    logger.error(`Ошибка при начальной синхронизации директории ${pair.name}: ${error.message}`);
  }
}

/**
 * Вспомогательная функция для рекурсивной синхронизации одной директории с другой
 * @param {string} sourceDir - Исходная директория
 * @param {string} targetDir - Целевая директория
 * @param {string} pairName - Имя пары для логирования
 * @param {Object} syncOptions - Опции синхронизации
 */
async function syncDirectories(sourceDir, targetDir, pairName, syncOptions = {}) {
  const sourceFiles = await fs.readdir(sourceDir);
  const targetFiles = await fs.pathExists(targetDir) ? await fs.readdir(targetDir) : [];

  // Копируем новые/измененные файлы из source в target
  for (const file of sourceFiles) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    const sourceStats = await fs.stat(sourcePath);

    if (sourceStats.isDirectory()) {
      await syncDirectories(sourcePath, targetPath, pairName, syncOptions);
    } else {
      if (await fs.pathExists(targetPath)) {
        const targetStats = await fs.stat(targetPath);
        if (sourceStats.mtimeMs > targetStats.mtimeMs) {
          logger.info(`[${pairName}] Исходный файл новее, копируем: ${sourcePath} -> ${targetPath}`);
          await copyFile(sourcePath, targetPath);
        }
      } else {
        logger.info(`[${pairName}] Файл не существует в цели, копируем: ${sourcePath} -> ${targetPath}`);
        await copyFile(sourcePath, targetPath);
      }
    }
  }

  // Удаляем файлы из target, которых нет в source, если опция включена
  if (syncOptions.delete) {
    for (const file of targetFiles) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);
      if (!(await fs.pathExists(sourcePath))) {
        logger.info(`[${pairName}] Файл/директория удалена из источника, удаляем в цели: ${targetPath}`);
        await removeFile(targetPath);
      }
    }
  }
}


/**
 * Запускает синхронизацию для всех пар файлов из конфигурации
 * @param {Object} config - Конфигурация
 * @returns {Object} - Объект с наблюдателями
 */
function startSync(config) {
  if (!config) {
    throw new Error('Конфигурация не предоставлена');
  }
  
  // Проверяем наличие хотя бы одной из секций
  const hasSyncPairs = config.syncPairs && Array.isArray(config.syncPairs) && config.syncPairs.length > 0;
  const hasSyncDirs = config.syncDirs && Array.isArray(config.syncDirs) && config.syncDirs.length > 0;
  
  if (!hasSyncPairs && !hasSyncDirs) {
    logger.warn('В конфигурации отсутствуют пары для синхронизации (syncPairs и syncDirs пустые или отсутствуют)');
  }
  
  const watchers = [];
  
  // Сохраняем данные о парах в статусе
  syncStatus.syncPairs = [];
  if (config.syncPairs) {
    syncStatus.syncPairs.push(...config.syncPairs.map(pair => ({
      name: pair.name || `${pair.source.baseDir}/${pair.source.path} <-> ${pair.target.baseDir}/${target.path}`,
      source: `${pair.source.baseDir}/${pair.source.path}`,
      target: `${pair.target.baseDir}/${pair.target.path}`,
      type: 'file'
    })));
  }
  if (config.syncDirs) {
    syncStatus.syncPairs.push(...config.syncDirs.map(pair => ({
      name: pair.name || `${pair.source.baseDir}/${pair.source.path} <-> ${pair.target.baseDir}/${target.path}`,
      source: `${pair.source.baseDir}/${pair.source.path}`,
      target: `${pair.target.baseDir}/${pair.target.path}`,
      type: 'dir'
    })));
  }
  
  // Обновляем статус
  syncStatus.isRunning = true;
  syncStatus.startTime = new Date();
  
  const initPromises = [];

  // Начальная синхронизация и настройка наблюдателей для ФАЙЛОВ
  if (config.syncPairs && Array.isArray(config.syncPairs)) {
    config.syncPairs.forEach(pair => {
      try {
        initPromises.push(initialSync(config, pair));
        const pairWatchers = setupFileWatchers(config, pair);
        watchers.push(pairWatchers);
      } catch (error) {
        logger.error(`Ошибка при настройке синхронизации для файла "${pair.name || 'без имени'}": ${error.message}. Эта пара будет пропущена.`);
      }
    });
  }

  // Начальная синхронизация и настройка наблюдателей для ДИРЕКТОРИЙ
  if (config.syncDirs && Array.isArray(config.syncDirs)) {
    config.syncDirs.forEach(pair => {
      try {
        initPromises.push(initialDirSync(config, pair));
        const pairWatchers = setupDirWatchers(config, pair);
        watchers.push(pairWatchers);
      } catch (error) {
        logger.error(`Ошибка при настройке синхронизации для директории "${pair.name || 'без имени'}": ${error.message}. Эта пара будет пропущена.`);
      }
    });
  }
  
  // Запускаем все промисы инициализации
  Promise.all(initPromises).then(() => {
    logger.info('Начальная синхронизация завершена для всех пар');
    // После начальной синхронизации переключаем chokidar в режим ignoreInitial: true, чтобы избежать повторных событий
    watchers.forEach(watcherGroup => {
      if (watcherGroup.sourceWatcher) watcherGroup.sourceWatcher.options.ignoreInitial = true;
      if (watcherGroup.targetWatcher) watcherGroup.targetWatcher.options.ignoreInitial = true;
    });
  }).catch(error => {
    logger.error(`Ошибка при выполнении начальной синхронизации: ${error.message}`);
  });
  
  // Сохраняем наблюдателей в статусе
  syncStatus.watchers = watchers;
  
  const totalPairs = (config.syncPairs?.length || 0) + (config.syncDirs?.length || 0);
  if (totalPairs > 0) {
    logger.info(`Синхронизация запущена для ${totalPairs} пар`);
  } else {
    logger.warn('Синхронизация запущена, но не настроено ни одной пары для синхронизации');
  }
  
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