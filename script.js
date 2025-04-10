document.addEventListener('DOMContentLoaded', () => {
    const tiktokUrlInput = document.getElementById('tiktok-url');
    const transcriptPasteArea = document.getElementById('transcript-paste');
    const processBtn = document.getElementById('process-btn');
    const displayArea = document.getElementById('display-area');
    const tiktokEmbedDiv = document.getElementById('tiktok-embed');
    const transcriptBody = document.getElementById('transcript-body');
    const scriptBody = document.getElementById('script-body');
    const historyList = document.getElementById('history-list');

    let currentHistoryId = null; // Para saber qué elemento del historial está activo
    let currentParsedTranscript = []; // Guardar transcripción parseada
    let currentScriptData = []; // Para mantener los datos del guion mientras se editan

    // --- FUNCIONES DE PARSEO Y VISUALIZACIÓN ---

    function timecodeToSeconds(timecode) {
        if (!timecode) return 0;
        const parts = timecode.split(':');
        let seconds = 0;
        try {
            const secondsAndMs = parts[2].split(/[.,]/); // Separar segundos y milisegundos
            seconds += parseInt(parts[0], 10) * 3600; // Horas
            seconds += parseInt(parts[1], 10) * 60;   // Minutos
            seconds += parseInt(secondsAndMs[0], 10); // Segundos
            if (secondsAndMs.length > 1) {
                seconds += parseInt(secondsAndMs[1].padEnd(3, '0').substring(0, 3), 10) / 1000; // Milisegundos
            }
        } catch (e) {
            console.error("Error parsing timecode:", timecode, e);
            return 0; // Devolver 0 si hay error
        }
        return seconds;
    }

    function parseVTT(vttString) {
        const lines = vttString.trim().split(/[\r\n]+/); // Dividir por líneas, ignorando múltiples saltos
        const entries = [];
        let currentEntry = null;

        const timecodeRegex = /^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/;
        // Regex alternativo más flexible (acepta sin milisegundos, formatos ligeramente distintos)
        const flexibleTimecodeRegex = /(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)/;


        for (const line of lines) {
            const timeMatch = line.match(flexibleTimecodeRegex);
            if (timeMatch) {
                // Si ya había una entrada, la guardamos (si tenía texto)
                if (currentEntry && currentEntry.text.trim()) {
                    entries.push(currentEntry);
                }
                // Empezamos una nueva entrada
                currentEntry = {
                    startTime: timecodeToSeconds(timeMatch[1]),
                    endTime: timecodeToSeconds(timeMatch[2]),
                    text: ''
                };
            } else if (currentEntry && line.trim() !== '' && !line.includes('-->')) {
                // Si no es una línea de tiempo y no está vacía, es texto de la entrada actual
                // Añadir espacio si ya hay texto (para textos multilínea)
                currentEntry.text += (currentEntry.text ? ' ' : '') + line.trim();
            }
        }

        // Guardar la última entrada si existe y tiene texto
        if (currentEntry && currentEntry.text.trim()) {
            entries.push(currentEntry);
        }

        // Ordenar por si acaso el VTT no estuviera estrictamente ordenado
        entries.sort((a, b) => a.startTime - b.startTime);

        return entries;
    }


    function displayVideo(url) {
        tiktokEmbedDiv.innerHTML = '';
        let videoId = '';
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            const videoIndex = pathParts.findIndex(part => part === 'video');
            if (videoIndex !== -1 && pathParts.length > videoIndex + 1) {
                videoId = pathParts[videoIndex + 1];
            }
        } catch (e) { console.error("Error parsing URL for Video ID:", e); }

        const blockquote = document.createElement('blockquote');
        blockquote.className = 'tiktok-embed';
        blockquote.cite = url;
        blockquote.setAttribute('data-video-id', videoId || ''); // Poner ID si se encontró
        blockquote.style.maxWidth = '325px';
        blockquote.style.minWidth = '325px'; // Ajusta según necesites
        blockquote.innerHTML = `<section><a target="_blank" title="Video" href="${url}">Ver video en TikTok</a></section>`;
        tiktokEmbedDiv.appendChild(blockquote);

        if (window.tiktok && typeof window.tiktok.load === 'function') {
            window.tiktok.load();
        } else {
            console.warn("TikTok embed script not loaded yet or failed.")
            // Podrías intentar recargar el script de TikTok aquí si falla a menudo
        }
    }

    function displayTranscriptionTable(transcriptData) {
        transcriptBody.innerHTML = '';
        currentParsedTranscript = transcriptData; // Guardar para referencia
        transcriptData.forEach(item => {
            const row = transcriptBody.insertRow();
            row.dataset.startTime = item.startTime; // Usar startTime como referencia
            row.style.cursor = 'pointer'; // Indicar que es clickeable

            const cellTime = row.insertCell();
            const cellText = row.insertCell();

            cellTime.textContent = formatTime(item.startTime);
            cellText.textContent = item.text;

            row.addEventListener('click', handleTranscriptClick);
        });
    }

    function displayScriptTable(baseTimes, scriptEntries = []) {
        scriptBody.innerHTML = '';
        currentScriptData = []; // Resetear

        // Crear un mapa de tiempos a texto para fácil acceso
        const scriptMap = new Map(scriptEntries.map(item => [item.startTime.toString(), item.text]));

        baseTimes.forEach(timeInfo => {
            const startTime = timeInfo.startTime;
            const row = scriptBody.insertRow();
            row.dataset.startTime = startTime; // Referencia de tiempo

            const cellTime = row.insertCell();
            const cellText = row.insertCell();

            cellTime.textContent = formatTime(startTime);
            cellText.contentEditable = "true";

            // Usar el texto guardado o dejar vacío
            const savedText = scriptMap.get(startTime.toString()) || '';
            cellText.textContent = savedText;

            // Añadir al estado actual
            currentScriptData.push({ startTime: startTime, text: savedText });


            cellText.addEventListener('input', (e) => handleScriptEdit(e, startTime));
            cellText.addEventListener('blur', saveCurrentState); // Guardar al perder foco
        });
    }

    // --- MANEJADORES DE EVENTOS ---

    processBtn.addEventListener('click', () => {
        const url = tiktokUrlInput.value.trim();
        const vttText = transcriptPasteArea.value.trim();

        if (!url || !vttText) {
            alert("Por favor, introduce la URL de TikTok y pega la transcripción.");
            return;
        }

        try {
            const parsedTranscript = parseVTT(vttText);
            if (!parsedTranscript || parsedTranscript.length === 0) {
                alert("No se pudo procesar la transcripción. Verifica el formato VTT.");
                return;
            }

            clearDisplay();
            displayArea.style.display = 'flex';

            displayVideo(url);
            displayTranscriptionTable(parsedTranscript);
            // Inicializar tabla de guion con tiempos de transcripción, pero vacía
            displayScriptTable(parsedTranscript, []); // Empezar con guion vacío

            // Guardar en historial (guardamos el texto VTT original)
            saveToHistory(url, vttText, []); // Guardar con guion inicial vacío
            renderHistory();

        } catch (error) {
            console.error("Error processing input:", error);
            alert("Ocurrió un error al procesar los datos.");
            displayArea.style.display = 'none';
        }
    });

    function handleTranscriptClick(event) {
        const row = event.currentTarget;
        const startTime = parseFloat(row.dataset.startTime);

        // Resaltar fila actual
        document.querySelectorAll('#transcript-table tbody tr.highlighted').forEach(r => r.classList.remove('highlighted'));
        row.classList.add('highlighted');

        // Buscar fila correspondiente en script y hacer scroll
        const scriptRow = scriptBody.querySelector(`tr[data-start-time="${startTime}"]`);
        if (scriptRow) {
            // Hacer scroll suave para que la fila de script sea visible
            scriptRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // Opcionalmente, resaltar también la fila del script
            document.querySelectorAll('#script-table tbody tr.highlighted').forEach(r => r.classList.remove('highlighted'));
            scriptRow.classList.add('highlighted');
        }

        console.log(`Clic en transcripción - Tiempo: ${startTime.toFixed(3)}s.`);
        console.warn("El control de tiempo del video embed de TikTok no es posible desde JavaScript.");

        // --- CÓDIGO COMENTADO PARA VIDEO HTML5 ESTÁNDAR ---
        // const videoElement = document.getElementById('myStandardVideoElementId'); // Reemplazar con ID real si usaras <video>
        // if (videoElement && typeof videoElement.currentTime !== 'undefined') {
        //     videoElement.currentTime = startTime;
        //     // videoElement.play(); // Opcional
        // }
    }

    function handleScriptEdit(event, startTime) {
        const cell = event.target;
        const newText = cell.textContent;

        // Encontrar y actualizar la entrada correcta en currentScriptData
        const entryIndex = currentScriptData.findIndex(item => item.startTime === startTime);
        if (entryIndex !== -1) {
            currentScriptData[entryIndex].text = newText;
        } else {
            // Si no existe (poco probable si se inicializó bien), añadirla
            currentScriptData.push({ startTime: startTime, text: newText });
            // Reordenar por si acaso
            currentScriptData.sort((a, b) => a.startTime - b.startTime);
        }
        // El guardado real se hace en saveCurrentState (al perder foco o cambiar de item)
    }

    historyList.addEventListener('click', (event) => {
        if (event.target.tagName === 'LI' && event.target.dataset.id) {
            // Guardar estado actual ANTES de cargar otro
            saveCurrentState();
            loadFromHistory(event.target.dataset.id);
        }
    });


    // --- FUNCIONES DE PERSISTENCIA (Local Storage) ---

    function getHistory() {
        const historyJson = localStorage.getItem('tiktokScriptHistoryV2'); // Usar nueva clave
        return historyJson ? JSON.parse(historyJson) : [];
    }

    function saveHistory(history) {
        localStorage.setItem('tiktokScriptHistoryV2', JSON.stringify(history));
    }

    // Guarda URL, el texto VTT original, y el array del guion editado
    function saveToHistory(url, originalVTT, scriptArray) {
        const history = getHistory();
        const newItem = {
            id: Date.now().toString(),
            url: url,
            originalVTT: originalVTT, // Guardar el texto original
            script: scriptArray,      // Guardar el guion como array [{startTime, text}]
            timestamp: new Date().toISOString()
        };
        history.unshift(newItem);

        const MAX_HISTORY = 50;
        if (history.length > MAX_HISTORY) {
            history.pop();
        }

        saveHistory(history);
        currentHistoryId = newItem.id; // Marcar como activo
        return newItem.id;
    }

    function saveCurrentState() {
        if (!currentHistoryId) return;

        const history = getHistory();
        const itemIndex = history.findIndex(item => item.id === currentHistoryId);

        if (itemIndex !== -1) {
            // Asegurarse de que currentScriptData está actualizado antes de guardar
            // (Ya debería estarlo por los 'input' y 'blur')
            history[itemIndex].script = [...currentScriptData]; // Guardar copia del estado actual
            saveHistory(history);
            console.log("Guion actual guardado para el ID:", currentHistoryId);
            renderHistory(); // Refresca la barra lateral
        } else {
            console.warn("ID activo no encontrado en historial para guardar:", currentHistoryId);
        }
    }


    function loadFromHistory(id) {
        // Guardar el estado actual ANTES de cargar (redundante si se llamó antes, pero seguro)
        saveCurrentState();

        const history = getHistory();
        const item = history.find(item => item.id === id);

        if (item) {
            currentHistoryId = id;
            tiktokUrlInput.value = item.url;
            transcriptPasteArea.value = item.originalVTT; // Cargar VTT original al área

            try {
                const parsedTranscript = parseVTT(item.originalVTT);
                if (!parsedTranscript || parsedTranscript.length === 0) {
                    throw new Error("Error al parsear VTT del historial.");
                }

                clearDisplay();
                displayArea.style.display = 'flex';

                displayVideo(item.url);
                displayTranscriptionTable(parsedTranscript);

                // Cargar el guion guardado (asegurarse que 'script' existe y es un array)
                const scriptToLoad = Array.isArray(item.script) ? item.script : [];
                displayScriptTable(parsedTranscript, scriptToLoad); // Usar tiempos parseados y texto guardado

                // Resaltar en la barra lateral
                document.querySelectorAll('#history-list li').forEach(li => {
                    li.style.fontWeight = li.dataset.id === id ? 'bold' : 'normal';
                    li.style.backgroundColor = li.dataset.id === id ? '#777' : '#555';
                });

                console.log("Cargado desde historial:", id);

            } catch (error) {
                console.error("Error al cargar desde historial:", error);
                alert(`Error al cargar el elemento del historial ${id}. Puede estar corrupto.`);
                clearDisplay();
                displayArea.style.display = 'none';
                currentHistoryId = null; // Desmarcar como activo si falla la carga
            }

        } else {
            console.error("Elemento del historial no encontrado:", id);
            alert("No se pudo cargar el elemento del historial.");
        }
    }

    function renderHistory() {
        const history = getHistory();
        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = '<li>No hay historial.</li>';
            return;
        }

        history.forEach(item => {
            const li = document.createElement('li');
            li.dataset.id = item.id;
            // Extraer nombre de video o parte de la URL para el título
            let title = 'Entrada sin título';
            try {
                const urlObj = new URL(item.url);
                const pathParts = urlObj.pathname.split('/');
                const videoIdPart = pathParts.find(part => /^\d+$/.test(part)); // Buscar parte numérica como ID
                if (videoIdPart) {
                    title = `Video ${videoIdPart}`;
                } else {
                    title = urlObj.pathname.split('/').pop() || urlObj.hostname; // Última parte o host
                }
            } catch { title = item.url.substring(0, 30) + '...'; } // Fallback

            li.textContent = title;
            li.title = `${item.url}\nGuardado: ${new Date(item.timestamp).toLocaleString()}`; // Tooltip con URL y fecha

            if (item.id === currentHistoryId) {
                li.style.fontWeight = 'bold';
                li.style.backgroundColor = '#777';
            }

            historyList.appendChild(li);
        });
    }

    // --- FUNCIONES AUXILIARES ---

    function formatTime(totalSeconds) {
        const date = new Date(0);
        date.setSeconds(totalSeconds);
        // Formato MM:SS.ms (3 decimales)
        return date.toISOString().substr(14, 9);
        // O formato más simple SS.ms
        // return totalSeconds.toFixed(1) + 's';
    }

    function clearDisplay() {
        tiktokEmbedDiv.innerHTML = '';
        transcriptBody.innerHTML = '';
        scriptBody.innerHTML = '';
        currentParsedTranscript = [];
        currentScriptData = [];
        // No ocultamos displayArea aquí, lo hacemos si falla el procesamiento
    }

    // --- INICIALIZACIÓN ---
    renderHistory(); // Cargar historial al iniciar
});