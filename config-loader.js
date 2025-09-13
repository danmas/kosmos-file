const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');
const dotenv = require('dotenv');
const { template } = require('lodash');

// Загрузка переменных окружения из .env файла
dotenv.config();

/**
 * Заменяет переменные окружения в строке
 * @param {string} value - Строка с возможными переменными ${VAR_NAME}
 * @returns {string} - Строка с замененными переменными
 */
function replaceEnvVars(value) {
  if (typeof value !== 'string') return value;
  
  // Использование lodash template для замены переменных
  const compiled = template(value, {
    interpolate: /\${([\s\S]+?)}/g
  });
  
  try {
    return compiled(process.env);
  } catch (error) {
    console.warn(`Ошибка при замене переменных в строке "${value}": ${error.message}`);
    return value;
  }
}

/**
 * Рекурсивно обрабатывает объект конфигурации, заменяя переменные окружения
 * @param {Object} obj - Объект конфигурации
 * @returns {Object} - Обработанный объект
 */
function processConfigObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => processConfigObject(item));
  }
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = replaceEnvVars(value);
    } else if (typeof value === 'object') {
      result[key] = processConfigObject(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Валидирует конфигурацию
 * @param {Object} config - Объект конфигурации
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateConfig(config) {
  const errors = [];
  
  // Проверка наличия необходимых разделов
  if (!config.baseDirs) errors.push('Отсутствует секция baseDirs');
  if (!config.syncPairs || !Array.isArray(config.syncPairs) || config.syncPairs.length === 0) {
    errors.push('Отсутствуют или неверно заданы пары для синхронизации (syncPairs)');
  }
  
  // Проверка базовых директорий
  if (config.baseDirs) {
    for (const [key, dir] of Object.entries(config.baseDirs)) {
      if (!dir) {
        errors.push(`Базовая директория "${key}" не задана`);
      } else if (!fs.existsSync(dir)) {
        errors.push(`Базовая директория "${key}" не существует: ${dir}`);
      }
    }
  }
  
  // Проверка пар синхронизации
  if (config.syncPairs && Array.isArray(config.syncPairs)) {
    config.syncPairs.forEach((pair, index) => {
      if (!pair.source || !pair.target) {
        errors.push(`Пара #${index + 1}: отсутствует source или target`);
        return;
      }
      
      // Проверка source
      if (!pair.source.baseDir || !pair.source.path) {
        errors.push(`Пара #${index + 1}: неполная конфигурация source`);
      } else if (!config.baseDirs[pair.source.baseDir]) {
        errors.push(`Пара #${index + 1}: неизвестная базовая директория source: ${pair.source.baseDir}`);
      }
      
      // Проверка target
      if (!pair.target.baseDir || !pair.target.path) {
        errors.push(`Пара #${index + 1}: неполная конфигурация target`);
      } else if (!config.baseDirs[pair.target.baseDir]) {
        errors.push(`Пара #${index + 1}: неизвестная базовая директория target: ${pair.target.baseDir}`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Загружает и обрабатывает конфигурацию из YAML файла
 * @param {string} configPath - Путь к файлу конфигурации
 * @returns {Object} - Объект с конфигурацией или null в случае ошибки
 */
function loadConfig(configPath) {
  try {
    // Определение пути к конфигурации
    const filePath = configPath || process.env.CONFIG_PATH || './config.yaml';
    
    // Проверка существования файла
    if (!fs.existsSync(filePath)) {
      console.error(`Файл конфигурации не найден: ${filePath}`);
      return null;
    }
    
    // Чтение и парсинг YAML
    const fileContent = fs.readFileSync(filePath, 'utf8');
    let config = yaml.load(fileContent);
    
    // Обработка переменных окружения в конфигурации
    config = processConfigObject(config);
    
    // Валидация конфигурации
    const validation = validateConfig(config);
    if (!validation.valid) {
      console.error('Ошибки в конфигурации:');
      validation.errors.forEach(err => console.error(`- ${err}`));
      return null;
    }
    
    return config;
  } catch (error) {
    console.error(`Ошибка при загрузке конфигурации: ${error.message}`);
    return null;
  }
}

module.exports = {
  loadConfig,
  validateConfig
};
