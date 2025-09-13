/**
 * Скрипт для отладки синхронизации
 */
const fs = require('fs-extra');
const path = require('path');

// Создаем начальные тестовые файлы
async function createInitialFiles() {
  console.log('=== СОЗДАНИЕ НАЧАЛЬНЫХ ТЕСТОВЫХ ФАЙЛОВ ===');
  
  try {
    // Создаем все необходимые директории
    await fs.ensureDir('./tests/dir1/config');
    await fs.ensureDir('./tests/dir2');
    await fs.ensureDir('./tests/dir3/settings');
    
    // Создаем исходные файлы
    const files = [
      {
        path: './tests/dir1/file1.md',
        content: 'file1.md\n+++-\n++'
      },
      {
        path: './tests/dir1/config/file1.txt',
        content: 'Это тестовый конфигурационный файл.\nОн будет синхронизирован между директориями.\nВерсия: 1.0'
      },
      {
        path: './tests/dir1/new-file.json',
        content: '{\n  "name": "test-file",\n  "version": "1.0.0",\n  "description": "Тестовый JSON файл для синхронизации",\n  "properties": {\n    "test": true,\n    "value": 42\n  }\n}'
      },
      {
        path: './tests/dir2/file2.md',
        content: 'file1.md\n+++-\n++'
      },
      {
        path: './tests/dir2/sync-test.txt',
        content: 'Это файл для тестирования двунаправленной синхронизации.\nИзменения в этом файле должны отражаться в dir3/settings/sync-test.txt.\nВремя создания: 2025-09-13'
      }
    ];
    
    for (const file of files) {
      await fs.writeFile(file.path, file.content);
      console.log(`✓ Создан файл: ${file.path}`);
    }
    
    console.log('✅ Все начальные файлы созданы успешно!\n');
    
  } catch (error) {
    console.error(`❌ Ошибка при создании файлов: ${error.message}`);
  }
}

// Проверяем состояние файлов перед запуском сервера
async function checkFileStatus() {
  console.log('=== ПРОВЕРКА СОСТОЯНИЯ ФАЙЛОВ ===');
  
  const files = [
    './tests/dir1/file1.md',
    './tests/dir1/config/file1.txt', 
    './tests/dir1/new-file.json',
    './tests/dir2/file2.md',
    './tests/dir2/sync-test.txt',
    './tests/dir3/settings/file1-copy.md',
    './tests/dir3/settings/file1-copy2.md',
    './tests/dir3/settings/config-file.txt',
    './tests/dir3/settings/sync-test.txt'
  ];
  
  for (const filePath of files) {
    const exists = await fs.pathExists(filePath);
    const status = exists ? '✓ EXISTS' : '✗ MISSING';
    console.log(`${status} ${filePath}`);
    
    if (exists) {
      try {
        const stats = await fs.stat(filePath);
        console.log(`  Size: ${stats.size} bytes, Modified: ${stats.mtime.toISOString()}`);
      } catch (err) {
        console.log(`  Error reading stats: ${err.message}`);
      }
    }
  }
}

// Главная функция
async function runTest() {
  try {
    // Сначала создаем начальные файлы
    await createInitialFiles();
    
    // Затем проверяем состояние файлов
    await checkFileStatus();
    
    console.log('\n=== ЗАПУСК СЕРВЕРА ===');
    console.log('Теперь запустите: node server.js tests/test-config.yaml');
    console.log('И следите за логами начальной синхронизации');
    
  } catch (err) {
    console.error(`Ошибка: ${err.message}`);
  }
}

// Запускаем тест
runTest();
