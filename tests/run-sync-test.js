/**
 * Скрипт для запуска и проверки тестов синхронизации файлов
 */
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Вместо chalk используем простые функции для цветного вывода
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Функции для цветного вывода
const colorize = {
  red: (text) => `${colors.red}${text}${colors.reset}`,
  green: (text) => `${colors.green}${text}${colors.reset}`,
  yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
  blue: (text) => `${colors.blue}${text}${colors.reset}`
};

// Пути к директориям
const TEST_DIR = path.join(__dirname);
const DIR1 = path.join(TEST_DIR, 'dir1');
const DIR2 = path.join(TEST_DIR, 'dir2');
const DIR3 = path.join(TEST_DIR, 'dir3');

// Путь к конфигурационному файлу
const CONFIG_PATH = path.join(TEST_DIR, 'test-config.yaml');

// Функция для очистки тестовых директорий (кроме исходных файлов)
async function cleanupTestDirs() {
  console.log(colorize.blue('Очистка тестовых директорий...'));
  
  // Очищаем dir3/settings
  await fs.emptyDir(path.join(DIR3, 'settings'));
  
  // Удаляем созданные файлы в dir2
  if (await fs.pathExists(path.join(DIR2, 'new-file-copy.json'))) {
    await fs.remove(path.join(DIR2, 'new-file-copy.json'));
  }
  
  console.log(colorize.green('Тестовые директории очищены.'));
}

// Функция для проверки синхронизации файлов
async function checkSyncStatus() {
  console.log(colorize.blue('\nПроверка результатов синхронизации:'));
  
  // Проверка 1: file1.md -> file2.md
  if (await fs.pathExists(path.join(DIR2, 'file2.md'))) {
    const content1 = await fs.readFile(path.join(DIR1, 'file1.md'), 'utf8');
    const content2 = await fs.readFile(path.join(DIR2, 'file2.md'), 'utf8');
    if (content1 === content2) {
      console.log(colorize.green('✓ Синхронизация file1.md -> file2.md: успешно'));
    } else {
      console.log(colorize.red('✗ Синхронизация file1.md -> file2.md: содержимое не совпадает'));
    }
  } else {
    console.log(colorize.red('✗ Синхронизация file1.md -> file2.md: файл не создан'));
  }
  
  // Проверка 2: file1.md -> settings/file1-copy.md
  if (await fs.pathExists(path.join(DIR3, 'settings', 'file1-copy.md'))) {
    const content1 = await fs.readFile(path.join(DIR1, 'file1.md'), 'utf8');
    const content2 = await fs.readFile(path.join(DIR3, 'settings', 'file1-copy.md'), 'utf8');
    if (content1 === content2) {
      console.log(colorize.green('✓ Синхронизация file1.md -> settings/file1-copy.md: успешно'));
    } else {
      console.log(colorize.red('✗ Синхронизация file1.md -> settings/file1-copy.md: содержимое не совпадает'));
    }
  } else {
    console.log(colorize.red('✗ Синхронизация file1.md -> settings/file1-copy.md: файл не создан'));
  }
  
  // Проверка 3: file1.md -> settings/file1-copy2.md
  if (await fs.pathExists(path.join(DIR3, 'settings', 'file1-copy2.md'))) {
    const content1 = await fs.readFile(path.join(DIR1, 'file1.md'), 'utf8');
    const content2 = await fs.readFile(path.join(DIR3, 'settings', 'file1-copy2.md'), 'utf8');
    if (content1 === content2) {
      console.log(colorize.green('✓ Синхронизация file1.md -> settings/file1-copy2.md: успешно'));
    } else {
      console.log(colorize.red('✗ Синхронизация file1.md -> settings/file1-copy2.md: содержимое не совпадает'));
    }
  } else {
    console.log(colorize.red('✗ Синхронизация file1.md -> settings/file1-copy2.md: файл не создан'));
  }
  
  // Проверка 4: config/file1.txt -> settings/config-file.txt
  if (await fs.pathExists(path.join(DIR3, 'settings', 'config-file.txt'))) {
    const content1 = await fs.readFile(path.join(DIR1, 'config', 'file1.txt'), 'utf8');
    const content2 = await fs.readFile(path.join(DIR3, 'settings', 'config-file.txt'), 'utf8');
    if (content1 === content2) {
      console.log(colorize.green('✓ Синхронизация config/file1.txt -> settings/config-file.txt: успешно'));
    } else {
      console.log(colorize.red('✗ Синхронизация config/file1.txt -> settings/config-file.txt: содержимое не совпадает'));
    }
  } else {
    console.log(colorize.red('✗ Синхронизация config/file1.txt -> settings/config-file.txt: файл не создан'));
  }
  
  // Проверка 5: new-file.json -> new-file-copy.json
  if (await fs.pathExists(path.join(DIR2, 'new-file-copy.json'))) {
    const content1 = await fs.readFile(path.join(DIR1, 'new-file.json'), 'utf8');
    const content2 = await fs.readFile(path.join(DIR2, 'new-file-copy.json'), 'utf8');
    if (content1 === content2) {
      console.log(colorize.green('✓ Синхронизация new-file.json -> new-file-copy.json: успешно'));
    } else {
      console.log(colorize.red('✗ Синхронизация new-file.json -> new-file-copy.json: содержимое не совпадает'));
    }
  } else {
    console.log(colorize.red('✗ Синхронизация new-file.json -> new-file-copy.json: файл не создан'));
  }
  
  // Проверка 6: sync-test.txt -> settings/sync-test.txt
  if (await fs.pathExists(path.join(DIR3, 'settings', 'sync-test.txt'))) {
    const content1 = await fs.readFile(path.join(DIR2, 'sync-test.txt'), 'utf8');
    const content2 = await fs.readFile(path.join(DIR3, 'settings', 'sync-test.txt'), 'utf8');
    if (content1 === content2) {
      console.log(colorize.green('✓ Синхронизация sync-test.txt -> settings/sync-test.txt: успешно'));
    } else {
      console.log(colorize.red('✗ Синхронизация sync-test.txt -> settings/sync-test.txt: содержимое не совпадает'));
    }
  } else {
    console.log(colorize.red('✗ Синхронизация sync-test.txt -> settings/sync-test.txt: файл не создан'));
  }
}

// Функция для модификации файлов и проверки двунаправленной синхронизации
async function testFileModifications() {
  console.log(colorize.blue('\nТестирование модификации файлов...'));
  
  // Модифицируем файл в dir1 и проверяем синхронизацию
  console.log('Модификация file1.md...');
  await fs.writeFile(path.join(DIR1, 'file1.md'), 'file1.md\n+++-\n++\nМодифицировано для теста!');
  
  // Ждем некоторое время для синхронизации
  console.log('Ожидание синхронизации (5 секунд)...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Проверяем, что изменения синхронизировались
  const content2 = await fs.readFile(path.join(DIR2, 'file2.md'), 'utf8');
  const content3_1 = await fs.readFile(path.join(DIR3, 'settings', 'file1-copy.md'), 'utf8');
  const content3_2 = await fs.readFile(path.join(DIR3, 'settings', 'file1-copy2.md'), 'utf8');
  
  if (content2.includes('Модифицировано для теста!')) {
    console.log(colorize.green('✓ Изменения в file1.md синхронизированы с file2.md'));
  } else {
    console.log(colorize.red('✗ Изменения в file1.md НЕ синхронизированы с file2.md'));
  }
  
  if (content3_1.includes('Модифицировано для теста!')) {
    console.log(colorize.green('✓ Изменения в file1.md синхронизированы с settings/file1-copy.md'));
  } else {
    console.log(colorize.red('✗ Изменения в file1.md НЕ синхронизированы с settings/file1-copy.md'));
  }
  
  if (content3_2.includes('Модифицировано для теста!')) {
    console.log(colorize.green('✓ Изменения в file1.md синхронизированы с settings/file1-copy2.md'));
  } else {
    console.log(colorize.red('✗ Изменения в file1.md НЕ синхронизированы с settings/file1-copy2.md'));
  }
  
  // Тестирование двунаправленной синхронизации
  console.log('\nТестирование двунаправленной синхронизации...');
  await fs.writeFile(path.join(DIR3, 'settings', 'sync-test.txt'), 
    'Это файл для тестирования двунаправленной синхронизации.\n' +
    'Изменения в этом файле должны отражаться в dir2/sync-test.txt.\n' +
    'Время модификации: 2025-09-13\n' +
    'Модифицировано в dir3!'
  );
  
  // Ждем некоторое время для синхронизации
  console.log('Ожидание синхронизации (5 секунд)...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Проверяем, что изменения синхронизировались в обратном направлении
  const contentDir2 = await fs.readFile(path.join(DIR2, 'sync-test.txt'), 'utf8');
  
  if (contentDir2.includes('Модифицировано в dir3!')) {
    console.log(colorize.green('✓ Двунаправленная синхронизация работает: изменения из dir3 отражены в dir2'));
  } else {
    console.log(colorize.red('✗ Двунаправленная синхронизация НЕ работает: изменения из dir3 НЕ отражены в dir2'));
  }
}

// Главная функция для запуска тестов
async function runTests() {
  try {
    console.log(colorize.yellow('=== ЗАПУСК ТЕСТОВ СИНХРОНИЗАЦИИ ФАЙЛОВ ==='));
    
    // Очищаем тестовые директории
    await cleanupTestDirs();
    
    // Запускаем сервер синхронизации с тестовой конфигурацией
    console.log(colorize.blue('\nЗапуск сервера синхронизации с тестовой конфигурацией...'));
    
    // Запускаем сервер в фоновом режиме
    const serverProcess = require('child_process').spawn('node', ['server.js', CONFIG_PATH], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(__dirname, '..')
    });
    
    // Отвязываем процесс от родителя
    serverProcess.unref();
    
    // ID процесса для последующего завершения
    const pid = serverProcess.pid;
    console.log(`Сервер запущен с PID: ${pid}`);
    
    // Ждем некоторое время для инициализации сервера и начальной синхронизации
    console.log('Ожидание инициализации сервера и начальной синхронизации (30 секунд)...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Проверяем статус синхронизации
    await checkSyncStatus();
    
    // Тестируем модификацию файлов
    await testFileModifications();
    
    // Завершаем сервер
    console.log(colorize.blue('\nЗавершение тестового сервера...'));
    try {
      // В Windows используем taskkill для принудительного завершения процесса
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${pid} /f /t`);
          console.log(`Сервер с PID ${pid} завершен через taskkill`);
        } catch (winErr) {
          console.log(`Не удалось завершить сервер через taskkill: ${winErr.message}`);
        }
      } else {
        // Для Unix-подобных систем используем process.kill
        process.kill(pid);
        console.log(`Сервер с PID ${pid} завершен`);
      }
    } catch (err) {
      console.log(`Не удалось завершить сервер: ${err.message}`);
    }
    
    console.log(colorize.yellow('\n=== ТЕСТЫ СИНХРОНИЗАЦИИ ЗАВЕРШЕНЫ ==='));
    
  } catch (error) {
    console.error(colorize.red(`Ошибка при выполнении тестов: ${error.message}`));
    process.exit(1);
  }
}

// Запускаем тесты
runTests();
