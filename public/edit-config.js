document.addEventListener('DOMContentLoaded', () => {
    // DOM элементы
    const saveButton = document.getElementById('btn-save');
    const toastElement = document.getElementById('liveToast');
    const toast = new bootstrap.Toast(toastElement);
    const treeContainer = document.getElementById('config-tree');
    const editorContainer = document.getElementById('editor-container');
    
    // Переменные для хранения редактора и конфигурации
    let editor = null;
    let configContent = '';
    
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
    
    // Простой парсер YAML для создания дерева навигации
    function createTreeFromYaml(yamlText) {
        treeContainer.innerHTML = '';
        const root = document.createElement('ul');
        
        // Разбиваем текст на строки
        const lines = yamlText.split('\n');
        const stack = [{ element: root, indent: -1 }];
        
        lines.forEach((line, index) => {
            // Пропускаем пустые строки и комментарии
            if (line.trim() === '' || line.trim().startsWith('#')) return;
            
            // Определяем отступ (количество пробелов в начале строки)
            const indent = line.search(/\S|$/);
            if (indent === -1) return;
            
            // Очищаем стек до нужного уровня вложенности
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }
            
            // Создаем элемент дерева
            const li = document.createElement('li');
            const content = line.trim();
            
            // Определяем ключ (до двоеточия)
            let key = content;
            if (content.includes(':')) {
                key = content.split(':')[0].trim();
            }
            
            const keySpan = document.createElement('span');
            keySpan.textContent = key;
            keySpan.className = 'tree-node';
            keySpan.dataset.line = index;
            
            li.appendChild(keySpan);
            
            // Если это новый уровень вложенности, создаем вложенный список
            if (indent > stack[stack.length - 1].indent) {
                const childUl = document.createElement('ul');
                li.appendChild(childUl);
                stack[stack.length - 1].element.appendChild(li);
                stack.push({ element: childUl, indent: indent });
            } else {
                stack[stack.length - 1].element.appendChild(li);
            }
        });
        
        treeContainer.appendChild(root);
    }
    
    // Инициализация CodeMirror редактора
    function initEditor(content) {
        // Создаем простой текстовый редактор с подсветкой синтаксиса YAML
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.width = '100%';
        textArea.style.height = '100%';
        textArea.style.fontFamily = 'monospace';
        textArea.style.fontSize = '14px';
        textArea.style.padding = '10px';
        textArea.style.border = '1px solid #ccc';
        textArea.style.boxSizing = 'border-box';
        
        editorContainer.innerHTML = '';
        editorContainer.appendChild(textArea);
        
        // Инициализируем CodeMirror
        editor = CodeMirror.fromTextArea(textArea, {
            mode: 'yaml',
            lineNumbers: true,
            theme: 'default',
            lineWrapping: false,
            foldGutter: true,
            gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            extraKeys: {
                'Tab': function(cm) {
                    cm.replaceSelection('  ');
                }
            }
        });
        
        editor.setSize('100%', '100%');
        configContent = content;
        
        // Создаем дерево навигации
        createTreeFromYaml(content);
    }
    
    // Загрузка конфигурации с сервера
    function fetchConfig() {
        fetch('/api/config')
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { 
                        throw new Error(err.error || 'Не удалось загрузить конфигурацию.');
                    });
                }
                return response.json();
            })
            .then(data => {
                configContent = data.config;
                initEditor(configContent);
            })
            .catch(error => {
                console.error('Ошибка:', error);
                const errorMessage = `# Ошибка загрузки конфигурации:\n# ${error.message}`;
                initEditor(errorMessage);
                showToast(error.message, true);
            });
    }
    
    // Сохранение конфигурации на сервер
    function saveConfig() {
        if (!editor) return;
        
        const newConfigContent = editor.getValue();
        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Сохранение...';
        
        fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: newConfigContent }),
        })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ok, data}) => {
            if (!ok) throw new Error(data.error || 'Неизвестная ошибка при сохранении.');
            showToast(data.message || 'Конфигурация сохранена.');
            configContent = newConfigContent;
            
            // Обновляем дерево навигации
            createTreeFromYaml(newConfigContent);
        })
        .catch(error => {
            console.error('Ошибка сохранения:', error);
            showToast(error.message, true);
        })
        .finally(() => {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="bi bi-save"></i> Сохранить';
        });
    }
    
    // Переход к определенной строке в редакторе
    function goToLine(lineNumber) {
        if (!editor) return;
        editor.setCursor(lineNumber, 0);
        editor.focus();
    }
    
    // Инициализация
    fetchConfig();
    
    // Обработчики событий
    saveButton.addEventListener('click', saveConfig);
    
    // Обработчик клика на элемент дерева
    treeContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('tree-node')) {
            const line = parseInt(event.target.dataset.line, 10);
            if (!isNaN(line)) {
                goToLine(line);
            }
        }
    });
});