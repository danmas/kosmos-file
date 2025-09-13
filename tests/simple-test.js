/**
 * Упрощённый тест синхронизации
 */
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

async function createTestFiles() {
  console.log('Создание тестовых файлов...');
  
  // Создаем все необходимые директории
  await fs.ensureDir('./tests/dir1/config');
  await fs.ensureDir('./tests/dir2');
  await fs.ensureDir('./tests/dir3/settings');
  
  // Создаем исходные файлы
  await fs.writeFile('./tests/dir1/file1.md', 'file1.md\n+++-\n++');
  await fs.writeFile('./tests/dir1/config/file1.txt', 'Это тестовый конфигурационный файл.\nВерсия: 1.0');
  await fs.writeFile('./tests/dir1/new-file.json', '{\n  "name": "test-file",\n  "version": "1.0.0"\n}');
  await fs.writeFile('./tests/dir2/sync-test.txt', 'Тестовый файл для двунаправленной синхронизации');
  
  console.log('Тестовые файлы созданы!');
}

async function checkSync() {
  console.log('\nПроверка результатов синхронизации...');
  
  const checks = [
    { source: './tests/dir1/file1.md', target: './tests/dir2/file2.md', name: 'file1.md -> file2.md' },
    { source: './tests/dir1/file1.md', target: './tests/dir3/settings/file1-copy.md', name: 'file1.md -> file1-copy.md' },
    { source: './tests/dir1/file1.md', target: './tests/dir3/settings/file1-copy2.md', name: 'file1.md -> file1-copy2.md' },
    { source: './tests/dir1/config/file1.txt', target: './tests/dir3/settings/config-file.txt', name: 'config/file1.txt -> config-file.txt' },
    { source: './tests/dir1/new-file.json', target: './tests/dir2/new-file-copy.json', name: 'new-file.json -> new-file-copy.json' },
    { source: './tests/dir2/sync-test.txt', target: './tests/dir3/settings/sync-test.txt', name: 'sync-test.txt двунаправленная' }
  ];
  
  for (const check of checks) {
    const sourceExists = await fs.pathExists(check.source);
    const targetExists = await fs.pathExists(check.target);
    
    if (sourceExists && targetExists) {
      try {
        const sourceContent = await fs.readFile(check.source, 'utf8');
        const targetContent = await fs.readFile(check.target, 'utf8');
        
        if (sourceContent === targetContent) {
          console.log(`✓ ${check.name}: синхронизировано`);
        } else {
          console.log(`⚠ ${check.name}: содержимое не совпадает`);
        }
      } catch (err) {
        console.log(`✗ ${check.name}: ошибка чтения - ${err.message}`);
      }
    } else {
      console.log(`✗ ${check.name}: источник=${sourceExists}, цель=${targetExists}`);
    }
  }
}

async function runTest() {
  try {
    // Очищаем и создаем файлы
    await createTestFiles();
    
    console.log('\nЗапуск сервера с тестовой конфигурацией...');
    
    // Запускаем сервер
    const serverProcess = spawn('node', ['server.js', 'tests/test-config.yaml'], {
      stdio: 'inherit',
      detached: false
    });
    
    console.log(`Сервер запущен с PID: ${serverProcess.pid}`);
    
    // Ждем инициализации
    console.log('Ожидание 15 секунд для инициализации и начальной синхронизации...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Проверяем результаты
    await checkSync();
    
    // Завершаем сервер
    console.log('\nЗавершение сервера...');
    serverProcess.kill('SIGTERM');
    
    console.log('\n=== ТЕСТ ЗАВЕРШЁН ===');
    
  } catch (error) {
    console.error(`Ошибка: ${error.message}`);
  }
}

runTest();
