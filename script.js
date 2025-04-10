document.addEventListener('DOMContentLoaded', () => {
    // ... (Variables existentes: tiktokUrlInput, transcriptPasteArea, etc.) ...
    const tiktokUrlInput = document.getElementById('tiktok-url');
    const transcriptPasteArea = document.getElementById('transcript-paste');
    const processBtn = document.getElementById('process-btn');
    const displayArea = document.getElementById('display-area');
    const tiktokEmbedDiv = document.getElementById('tiktok-embed');
    const transcriptBody = document.getElementById('transcript-body');
    const scriptBody = document.getElementById('script-body');
    const historyList = document.getElementById('history-list');

    let currentHistoryId = null;
    let currentParsedTranscript = [];
    let currentScriptData = [];
    let currentOriginalFormatText = ''; // Guardar el texto original para el historial

    // --- FUNCIONES DE PARSEO ---

    function timecodeToSeconds(timecode) {
        // (Sin cambios respecto a la versión anterior)
        if (!timecode) return 0;
        const parts = timecode.split(':');
        let seconds = 0;
        try {
            const secondsAndMs = parts[parts.length - 1].split(/[.,]/); // Maneja HH:MM:SS o MM:SS
            if (parts.length === 3) { // HH:MM:SS.ms
                seconds += parseInt(parts[0], 10) * 3600;
                seconds += parseInt(parts[1], 10) * 60;
            } else if (parts.length === 2) { // MM:SS.ms
                seconds += parseInt(parts[0], 10) * 60;
            } else { // Solo segundos? Poco probable en VTT
                seconds += parseInt(parts[0], 10);
            }
            seconds += parseInt(secondsAndMs[0], 10); // Segundos
            if (secondsAndMs.length > 1) {
                seconds += parseInt(secondsAndMs[1].padEnd(3, '0').substring(0, 3), 10) / 1000;
            }
        } catch (e) {
            console.error("Error parsing timecode:", timecode, e);
            return 0;
        }
        return seconds;
    }

    // Parser para formato VTT (HH:MM:SS.ms --> HH:MM:SS.ms)
    function parseVTT(vttString) {
        const lines = vttString.trim().split(/[\r\n]+/);
        const entries = [];
        let currentEntry = null;
        const flexibleTimecodeRegex = /(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)/;

        for (const line of lines) {
            const timeMatch = line.match(flexibleTimecodeRegex);
            if (timeMatch) {
                if (currentEntry && currentEntry.text.trim()) {
                    entries.push(currentEntry);
                }
                currentEntry = {
                    startTime: timecodeToSeconds(timeMatch[1]),
                    endTime: timecodeToSeconds(timeMatch[2]), // VTT tiene endTime
                    text: ''
                };
            } else if (currentEntry && line.trim() !== '' && !line.includes('-->') && !line.startsWith('WEBVTT')) {
                currentEntry.text += (currentEntry.text ? ' ' : '') + line.trim();
            }
        }
        if (currentEntry && currentEntry.text.trim()) {
            entries.push(currentEntry);
        }
        entries.sort((a, b) => a.startTime - b.startTime);
        console.log("Parsed as VTT:", entries);
        return entries;
    }

    // Parser para formato [MM:SS] Texto
    function parseBracketFormat(text) {
        const lines = text.trim().split(/[\r\n]+/);
        const entries = [];
        const bracketTimeRegex = /^\s*\[(\d{1,2}):(\d{2})\]\s*(.*)/;

        for (const line of lines) {
            const match = line.match(bracketTimeRegex);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const textContent = match[3].trim();

                if (!isNaN(minutes) && !isNaN(seconds) && textContent) {
                    entries.push({
                        startTime: (minutes * 60) + seconds,
                        // No endTime en este formato, podemos omitirlo o ponerlo igual a startTime
                        text: textContent
                    });
                }
            }
            // Ignoramos líneas que no coincidan con el formato
        }
        // Ya están ordenadas por naturaleza del formato línea a línea
        console.log("Parsed as Bracket Format:", entries);
        return entries;
    }

    // Detecta el formato y llama al parser adecuado
    function parseTranscript(text) {
        const lines = text.trim().split(/[\r\n]+/).filter(line => line.trim() !== ''); // Obtener líneas no vacías
        if (lines.length === 0) return [];

        // Intentar detectar formato VTT (buscar '-->')
        if (lines.some(line => line.includes('-->'))) {
            return parseVTT(text);
        }
        // Intentar detectar formato [MM:SS] (buscar '[xx:xx]' al inicio)
        else if (lines.some(line => /^\s*\[\d{1,2}:\d{2}\]/.test(line))) {
            return parseBracketFormat(text);
        }
        // Si no se detecta ninguno
        else {
            console.warn("Formato de transcripción no reconocido automáticamente.");
            // Podríamos intentar un fallback o simplemente devolver vacío/error
            // Por ahora, intentamos VTT como fallback si hay texto.
            if (text.length > 10) return parseVTT(text); // Intenta VTT si hay algo
            return [];
        }
    }

    // --- FUNCIONES DE VISUALIZACIÓN (displayVideo sin cambios) ---
    function displayVideo(url) {
        // (Sin cambios respecto a la versión anterior)
        tiktokEmbedDiv.innerHTML = '';
        let videoId = '';
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            const videoIndex = pathParts.findIndex(part => part === 'video');
            if (videoIndex !== -1 && pathParts.length > videoIndex + 1) {
                videoId = pathParts[videoIndex + 1].split('?')[0]; // Remove query params if any
            }
        } catch (e) { console.error("Error parsing URL for Video ID:", e); }

        const blockquote = document.createElement('blockquote');
        blockquote.className = 'tiktok-embed';
        blockquote.cite = url;
        blockquote.setAttribute('data-video-id', videoId || '');
        blockquote.style.maxWidth = '325px';
        blockquote.style.minWidth = '325px';
        blockquote.innerHTML = `<section><a target="_blank" title="Video" href="${url}">Ver video en TikTok</a></section>`;
        tiktokEmbedDiv.appendChild(blockquote);

        if (window.tiktok && typeof window.tiktok.load === 'function') {
            try { window.tiktok.load(); } catch (e) { console.error("TikTok load error:", e) }
        } else {
            console.warn("TikTok embed script not loaded yet or failed.")
        }
    }


    function displayTranscriptionTable(transcriptData) {
        // (Sin cambios respecto a la versión anterior)
        transcriptBody.innerHTML = '';
        currentParsedTranscript = transcriptData;
        transcriptData.forEach(item => {
            const row = transcriptBody.insertRow();
            row.dataset.startTime = item.startTime;
            row.style.cursor = 'pointer';

            const cellTime = row.insertCell();
            const cellText = row.insertCell();

            cellTime.textContent = formatTime(item.startTime); // Usar nueva función formatTime
            cellText.textContent = item.text;

            row.addEventListener('click', handleTranscriptClick);
        });
    }

    function displayScriptTable(baseTimes, scriptEntries = []) {
        // (Sin cambios respecto a la versión anterior)
        scriptBody.innerHTML = '';
        currentScriptData = [];

        const scriptMap = new Map(scriptEntries.map(item => [item.startTime.toString(), item.text]));

        baseTimes.forEach(timeInfo => {
            const startTime = timeInfo.startTime;
            const row = scriptBody.insertRow();
            row.dataset.startTime = startTime;

            const cellTime = row.insertCell();
            const cellText = row.insertCell();

            cellTime.textContent = formatTime(startTime); // Usar nueva función formatTime
            cellText.contentEditable = "true";
            const savedText = scriptMap.get(startTime.toString()) || '';
            cellText.textContent = savedText;
            currentScriptData.push({ startTime: startTime, text: savedText });

            cellText.addEventListener('input', (e) => handleScriptEdit(e, startTime));
            cellText.addEventListener('blur', saveCurrentState);
        });
    }

    // --- MANEJADORES DE EVENTOS ---

    processBtn.addEventListener('click', () => {
        const url = tiktokUrlInput.value.trim();
        const rawTranscriptText = transcriptPasteArea.value.trim(); // Texto original
        currentOriginalFormatText = rawTranscriptText; // Guardar para historial

        if (!url || !rawTranscriptText) {
            alert("Por favor, introduce la URL de TikTok y pega la transcripción.");
            return;
        }

        try {
            const parsedTranscript = parseTranscript(rawTranscriptText); // Usar la función detectora

            if (!parsedTranscript || parsedTranscript.length === 0) {
                alert("No se pudo procesar la transcripción. Verifica el formato (VTT o [MM:SS] Texto).");
                return;
            }

            clearDisplay();
            displayArea.style.display = 'flex';

            displayVideo(url);
            displayTranscriptionTable(parsedTranscript);
            displayScriptTable(parsedTranscript, []); // Guion inicial vacío

            // Guardar en historial usando el texto original
            saveToHistory(url, currentOriginalFormatText, []);
            renderHistory();

        } catch (error) {
            console.error("Error processing input:", error);
            alert("Ocurrió un error al procesar los datos.");
            displayArea.style.display = 'none';
        }
    });

    function handleTranscriptClick(event) {
        // (Sin cambios respecto a la versión anterior, sigue resaltando y logueando)
        const row = event.currentTarget;
        const startTime = parseFloat(row.dataset.startTime);

        document.querySelectorAll('#transcript-table tbody tr.highlighted').forEach(r => r.classList.remove('highlighted'));
        row.classList.add('highlighted');

        const scriptRow = scriptBody.querySelector(`tr[data-start-time="${startTime}"]`);
        if (scriptRow) {
            scriptRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            document.querySelectorAll('#script-table tbody tr.highlighted').forEach(r => r.classList.remove('highlighted'));
            scriptRow.classList.add('highlighted');
        }

        console.log(`Clic en transcripción - Tiempo: ${startTime.toFixed(3)}s.`);
        console.warn("El control de tiempo del video embed de TikTok no es posible desde JavaScript.");
    }

    function handleScriptEdit(event, startTime) {
        // (Sin cambios respecto a la versión anterior)
        const cell = event.target;
        const newText = cell.textContent;
        const entryIndex = currentScriptData.findIndex(item => item.startTime === startTime);
        if (entryIndex !== -1) {
            currentScriptData[entryIndex].text = newText;
        } else {
            currentScriptData.push({ startTime: startTime, text: newText });
            currentScriptData.sort((a, b) => a.startTime - b.startTime);
        }
    }


    historyList.addEventListener('click', (event) => {
        // (Sin cambios respecto a la versión anterior)
        if (event.target.tagName === 'LI' && event.target.dataset.id) {
            saveCurrentState();
            loadFromHistory(event.target.dataset.id);
        }
    });

    // --- FUNCIONES DE PERSISTENCIA (Actualizadas para guardar texto original) ---

    function getHistory() {
        // Usamos una clave diferente para evitar conflictos con versiones anteriores
        const historyJson = localStorage.getItem('tiktokScriptHistoryV3');
        return historyJson ? JSON.parse(historyJson) : [];
    }

    function saveHistory(history) {
        localStorage.setItem('tiktokScriptHistoryV3', JSON.stringify(history));
    }

    // Guarda URL, el texto original pegado, y el array del guion editado
    function saveToHistory(url, originalFormatText, scriptArray) {
        const history = getHistory();
        const newItem = {
            id: Date.now().toString(),
            url: url,
            originalFormatText: originalFormatText, // Guardar el texto original
            script: scriptArray,
            timestamp: new Date().toISOString()
        };
        // Evitar duplicados basados en URL y texto original (opcional)
        const existingIndex = history.findIndex(item => item.url === url && item.originalFormatText === originalFormatText);
        if (existingIndex > -1) {
            history.splice(existingIndex, 1); // Eliminar el viejo si ya existe
        }

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
        // (Sin cambios respecto a la versión anterior)
        if (!currentHistoryId) return;
        const history = getHistory();
        const itemIndex = history.findIndex(item => item.id === currentHistoryId);
        if (itemIndex !== -1) {
            // Actualizar solo el guion, mantener el texto original
            history[itemIndex].script = [...currentScriptData];
            saveHistory(history);
            console.log("Guion actual guardado para el ID:", currentHistoryId);
            renderHistory();
        } else {
            console.warn("ID activo no encontrado en historial para guardar:", currentHistoryId);
        }
    }

    function loadFromHistory(id) {
        // saveCurrentState(); // Ya se llama en el listener de click

        const history = getHistory();
        const item = history.find(item => item.id === id);

        if (item) {
            currentHistoryId = id;
            tiktokUrlInput.value = item.url;
            // Usar el texto original guardado
            const originalText = item.originalFormatText || '';
            transcriptPasteArea.value = originalText;
            currentOriginalFormatText = originalText; // Actualizar para el estado actual

            try {
                const parsedTranscript = parseTranscript(originalText); // Volver a parsear
                if (!parsedTranscript) { // parseTranscript puede devolver null o []
                    throw new Error("Error al parsear texto del historial.");
                }

                clearDisplay();
                displayArea.style.display = 'flex';
                displayVideo(item.url);
                displayTranscriptionTable(parsedTranscript); // Mostrar tabla de transcripción

                // Cargar el guion guardado
                const scriptToLoad = Array.isArray(item.script) ? item.script : [];
                // Asegurarse de que baseTimes tenga elementos antes de llamar a displayScriptTable
                const baseTimes = parsedTranscript.length > 0 ? parsedTranscript : scriptToLoad.map(s => ({ startTime: s.startTime })); // Fallback si el parseo falla pero hay guion
                if (baseTimes.length > 0) {
                    displayScriptTable(baseTimes, scriptToLoad);
                } else if (scriptToLoad.length > 0) {
                    // Si no hay transcripción parseada pero sí guion, intentar mostrar solo guion
                    console.warn("No se pudo parsear la transcripción del historial, mostrando solo guion guardado.");
                    displayScriptTable(scriptToLoad.map(s => ({ startTime: s.startTime })), scriptToLoad);
                } else {
                    console.warn("No hay datos de transcripción ni de guion para mostrar desde el historial.");
                    // Quizás limpiar las tablas explícitamente
                    transcriptBody.innerHTML = '';
                    scriptBody.innerHTML = '';
                }


                // Resaltar en la barra lateral
                document.querySelectorAll('#history-list li').forEach(li => {
                    li.style.fontWeight = li.dataset.id === id ? 'bold' : 'normal';
                    li.style.backgroundColor = li.dataset.id === id ? '#777' : '#555';
                });

                console.log("Cargado desde historial:", id);

            } catch (error) {
                console.error("Error al cargar desde historial:", error);
                alert(`Error al cargar el elemento del historial ${id}. Puede estar corrupto o en formato inesperado.`);
                clearDisplay();
                displayArea.style.display = 'none';
                currentHistoryId = null;
            }

        } else {
            console.error("Elemento del historial no encontrado:", id);
            alert("No se pudo cargar el elemento del historial.");
        }
    }

    function renderHistory() {
        // (Sin cambios respecto a la versión anterior)
        const history = getHistory();
        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = '<li>No hay historial.</li>';
            return;
        }

        history.forEach(item => {
            const li = document.createElement('li');
            li.dataset.id = item.id;
            let title = 'Entrada sin título';
            try {
                const urlObj = new URL(item.url);
                const pathParts = urlObj.pathname.split('/');
                // Intenta encontrar un ID numérico largo en la ruta
                const videoIdPart = pathParts.find(part => /^\d{18,}$/.test(part));
                if (videoIdPart) {
                    title = `Video ...${videoIdPart.slice(-6)}`; // Mostrar últimos 6 dígitos
                } else {
                    title = urlObj.pathname.split('/').filter(Boolean).pop() || urlObj.hostname; // Última parte significativa o host
                    title = title.length > 25 ? title.substring(0, 22) + '...' : title; // Acortar si es muy largo
                }
            } catch { title = (item.url || 'URL inválida').substring(0, 25) + '...'; }

            li.textContent = title;
            li.title = `${item.url}\nGuardado: ${new Date(item.timestamp).toLocaleString()}`;

            if (item.id === currentHistoryId) {
                li.style.fontWeight = 'bold';
                li.style.backgroundColor = '#777';
            }
            historyList.appendChild(li);
        });
    }


    // --- FUNCIONES AUXILIARES ---

    // Actualizado para mostrar MM:SS
    function formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function clearDisplay() {
        // (Sin cambios respecto a la versión anterior)
        tiktokEmbedDiv.innerHTML = '';
        transcriptBody.innerHTML = '';
        scriptBody.innerHTML = '';
        currentParsedTranscript = [];
        currentScriptData = [];
        // currentOriginalFormatText se actualiza al procesar
    }

    // --- INICIALIZACIÓN ---
    renderHistory();
});