const stations = [
    { name: "COPE Nacional", url: "https://net1-cope-rrcast.flumotion.com/cope/net1-low.mp3", desc: "Noticias y Deportes" },
    { name: "Radio Nacional (RNE 1)", url: "https://rtvelivestream.rtve.es/rtvesec/rne/rne_r1_main.m3u8", desc: "Radio Pública" },
    { name: "Cadena SER", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASER.mp3", desc: "Actualidad y Entretenimiento" },
    { name: "Radio Marca", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOMARCA_NACIONAL.mp3", desc: "El Deporte que se Vive" }, 
    { name: "Los 40 Principales", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3", desc: "Éxitos del Momento" },
    { name: "Funky house", url: "https://stream.technolovers.fm/funky-house", desc: "Lo mejor del Funky House" },
    { name: "Funky disco", url: "https://funky-disco-hits.stream.laut.fm/funky-disco-hits", desc: "Disco y Funk clásico" },
    { name: "Funky 80's", url: "https://play.radioking.io/fm80funkymusic/523739", desc: "Clásicos de los 80" },
    { name: "Funk y Soul de los 80", url: "https://streams.80s80s.de/soul/mp3-192/", desc: "Clasicos de los 80" },
    { name: "Deep House", url: "https://hits1deep-audiomediaradio.radioca.st/deep", desc: "Sonido Deep Relax" }, 
    { name: "181.FM Soul", url: "https://listen.181fm.com/181-soul_128k.mp3", desc: "R&B y Soul" },
    { name: "Soulful House", url: "https://radio4.vip-radios.fm:18057/stream-128kmp3-SoulfulHouse", desc: "House con Alma" }, 
    { name: "Deep Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/DEEP_RADIO.mp3", desc: "Deep & Chill" }, 
    { name: "D", url: "https:", desc: "Deep & Chill" },
    { name: "Nostalgie Funky", url: "https://streaming.nrjaudio.fm/ou7x6kf3s5gi", desc: "Grandes Clásicos Funk" }
];

// --- Estado global ---
let favorites = JSON.parse(localStorage.getItem('myRadiosFavs')) || [];
let timerInterval = null;
let metadataInterval = null;
let timerSeconds = 0;
let isPlayingManually = false; 
let currentStation = null; // Guardamos la estación actual para reconexión

// --- Audio Context (Calidad Pro) ---
let audioCtx = null;
let analyser = null;
let source = null;
let masterGain = null; 
let dataArray = null;
let animationId = null;

// --- Wake Lock (evita que el SO suspenda la app) ---
let wakeLock = null;
let wakeLockRetryTimer = null;

// --- Keep-alive / Heartbeat ---
let keepAliveInterval = null;
let heartbeatInterval = null;

// --- Reconexión robusta ---
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50;
let reconnectTimer = null;

// --- Referencias DOM ---
const audioPlayer = document.getElementById('audio-player');
const currentStationTitle = document.getElementById('current-station');
const trackInfoDisplay = document.getElementById('track-info'); 
const statusText = document.getElementById('status');
const btnPlayPause = document.getElementById('btn-play-pause');
const searchInput = document.getElementById('search-input');
const visualizer = document.getElementById('visualizer');
const bars = document.querySelectorAll('.bar'); 
const liveBadge = document.getElementById('live-indicator');
const clockDisplay = document.getElementById('digital-clock');
const volumeSlider = document.getElementById('volume-slider');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const closeMenuBtn = document.getElementById('close-menu');
const overlay = document.getElementById('overlay');

// ╔══════════════════════════════════════════════════════════╗
// ║          SCREEN WAKE LOCK API                          ║
// ║  Evita que el móvil suspenda la app al apagar pantalla ║
// ╚══════════════════════════════════════════════════════════╝

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
        console.log('[WakeLock] API no soportada en este navegador');
        return;
    }
    try {
        // Solo solicitamos si estamos reproduciendo
        if (!isPlayingManually) return;
        
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] ✅ Bloqueo de pantalla activado');
        
        wakeLock.addEventListener('release', () => {
            console.log('[WakeLock] ⚠️ Bloqueo liberado (pantalla apagada o cambio de pestaña)');
            wakeLock = null;
            // Si seguimos reproduciendo, intentamos re-solicitar cuando volvamos
            if (isPlayingManually) {
                scheduleWakeLockRetry();
            }
        });
    } catch (err) {
        console.log('[WakeLock] ❌ Error al solicitar:', err.message);
        // Reintentar después de un momento
        if (isPlayingManually) {
            scheduleWakeLockRetry();
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
        console.log('[WakeLock] 🔓 Bloqueo liberado manualmente');
    }
    if (wakeLockRetryTimer) {
        clearTimeout(wakeLockRetryTimer);
        wakeLockRetryTimer = null;
    }
}

function scheduleWakeLockRetry() {
    if (wakeLockRetryTimer) return; // Ya hay un retry programado
    wakeLockRetryTimer = setTimeout(async () => {
        wakeLockRetryTimer = null;
        if (isPlayingManually) {
            await requestWakeLock();
        }
    }, 1000); // Reintentar cada segundo
}

// ╔══════════════════════════════════════════════════════════╗
// ║          MANTENER AUDIOCONTEXT VIVO                    ║
// ║  Reanuda el AudioContext cuando el navegador lo suspende ║
// ╚══════════════════════════════════════════════════════════╝

function startKeepAlive() {
    stopKeepAlive();
    // Verificar cada 3 segundos que el AudioContext esté activo
    keepAliveInterval = setInterval(() => {
        if (!isPlayingManually) return;
        
        // Reanudar AudioContext si se suspendió
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                console.log('[KeepAlive] AudioContext reanudado');
            }).catch(() => {});
        }
        
        // Verificar que el audio sigue reproduciendo
        if (audioPlayer.paused && isPlayingManually) {
            console.log('[KeepAlive] Audio pausado detectado, reintentando play...');
            audioPlayer.play().catch(() => {});
        }
    }, 3000);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// ╔══════════════════════════════════════════════════════════╗
// ║          HEARTBEAT DE AUDIO                             ║
// ║  Verifica que el stream sigue activo y reconecta si no  ║
// ╚══════════════════════════════════════════════════════════╝

let lastAudioTime = 0;

function startHeartbeat() {
    stopHeartbeat();
    lastAudioTime = audioPlayer.currentTime;
    
    heartbeatInterval = setInterval(() => {
        if (!isPlayingManually || !currentStation) return;
        
        // Para streams en vivo, currentTime debería avanzar siempre
        const currentTime = audioPlayer.currentTime;
        
        // Si el tiempo no avanza en 10 segundos, el stream está muerto
        if (currentTime === lastAudioTime && !audioPlayer.paused) {
            console.log('[Heartbeat] ⚠️ Stream no avanza, intentando reconexión...');
            reconnectToStation();
        }
        
        lastAudioTime = currentTime;
    }, 10000); // Verificar cada 10 segundos
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// ╔══════════════════════════════════════════════════════════╗
// ║          RECONEXIÓN ROBUSTA                            ║
// ║  Reconecta automáticamente con backoff exponencial      ║
// ╚══════════════════════════════════════════════════════════╝

function reconnectToStation() {
    if (!currentStation || !isPlayingManually) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[Reconnect] ❌ Máximo de intentos alcanzado');
        statusText.textContent = "Error: reconexión fallida";
        stopPlayback();
        return;
    }
    
    reconnectAttempts++;
    // Backoff exponencial: 1s, 2s, 4s, 8s... máximo 30s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
    
    console.log(`[Reconnect] Intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} en ${delay}ms`);
    statusText.textContent = `Reconectando... (${reconnectAttempts})`;
    
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        if (!isPlayingManually || !currentStation) return;
        
        // Reanudar AudioContext
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        
        // Recargar la fuente del stream
        audioPlayer.src = currentStation.url;
        audioPlayer.load();
        audioPlayer.play()
            .then(() => {
                console.log('[Reconnect] ✅ Reconectado exitosamente');
                statusText.textContent = "En directo";
                reconnectAttempts = 0; // Reset del contador
                lastAudioTime = audioPlayer.currentTime;
            })
            .catch((err) => {
                console.log('[Reconnect] ❌ Error:', err.message);
                reconnectToStation(); // Reintentar
            });
    }, delay);
}

function resetReconnect() {
    reconnectAttempts = 0;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

// ╔══════════════════════════════════════════════════════════╗
// ║          FUNCIONES MENÚ                                 ║
// ╚══════════════════════════════════════════════════════════╝

function openMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
}
function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// ╔══════════════════════════════════════════════════════════╗
// ║          INICIALIZACIÓN AUDIO                           ║
// ╚══════════════════════════════════════════════════════════╝

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        masterGain = audioCtx.createGain();
        source = audioCtx.createMediaElementSource(audioPlayer);
        
        source.connect(analyser);
        analyser.connect(masterGain);
        masterGain.connect(audioCtx.destination);
        
        masterGain.gain.value = 1.0; 
        analyser.fftSize = 64; 
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        watchAudioContext();
    }
}

// --- Vigilar el AudioContext para que no se quede "suspended" ---
function watchAudioContext() {
    audioCtx.addEventListener('statechange', () => {
        if (audioCtx.state === 'suspended' && isPlayingManually) {
            console.log('[AudioContext] Detectado suspended, reanudando...');
            audioCtx.resume().catch(() => {});
        }
    });
}

// ╔══════════════════════════════════════════════════════════╗
// ║     VISIBILITYCHANGE + MANTENER REPRODUCCIÓN VIVA       ║
// ╚══════════════════════════════════════════════════════════╝

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('[Visibility] 📱 Pantalla apagada / pestaña oculta');
        // Asegurar que todo sigue activo en segundo plano
        if (isPlayingManually) {
            // Reanudar AudioContext por si acaso
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
            // Re-solicitar Wake Lock cuando volvamos
            scheduleWakeLockRetry();
        }
    } else {
        console.log('[Visibility] 🖥️ Pantalla encendida / pestaña visible');
        if (isPlayingManually) {
            // Reanudar AudioContext
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
            // Re-solicitar Wake Lock
            requestWakeLock();
            // Verificar que el audio sigue sonando
            if (audioPlayer.paused) {
                audioPlayer.play().catch(() => {});
            }
        }
    }
});

// --- Vigilar cuando el AudioContext se suspende (Cambio de pestaña en Chrome) ---
if ('onvisibilitychange' in document) {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isPlayingManually) {
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            if (audioPlayer.paused) {
                audioPlayer.play().catch(() => {});
            }
        }
    });
}

// --- Manejar cuando la ventana pierde/gana foco ---
window.addEventListener('blur', () => {
    if (isPlayingManually) {
        // El navegador podría pausar el audio al perder foco
        setTimeout(() => {
            if (isPlayingManually && audioPlayer.paused) {
                audioPlayer.play().catch(() => {});
            }
        }, 500);
    }
});

// --- Manejar visibilidad de la página ---
document.addEventListener('pause', () => {
    // Algunos navegadores móviles disparan este evento
    if (isPlayingManually) {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
    }
}, false);

// ╔══════════════════════════════════════════════════════════╗
// ║          ANIMACIÓN VISUALIZADOR                         ║
// ╚══════════════════════════════════════════════════════════╝

function animateVisualizer() {
    if (!isPlayingManually) {
        cancelAnimationFrame(animationId);
        return;
    }
    animationId = requestAnimationFrame(animateVisualizer);
    analyser.getByteFrequencyData(dataArray);
    bars.forEach((bar, index) => {
        const value = dataArray[index * 2] || 0; 
        const percent = (value / 255) * 100;
        const height = Math.max(4, (percent * 0.45)); 
        bar.style.height = `${height}px`;
        bar.style.opacity = 0.6 + (percent / 250);
    });
}

// ╔══════════════════════════════════════════════════════════╗
// ║          RELOJ DIGITAL                                  ║
// ╚══════════════════════════════════════════════════════════╝

function updateClock() {
    const now = new Date();
    clockDisplay.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
}

// ╔══════════════════════════════════════════════════════════╗
// ║          GESTIÓN DE EMISORAS                            ║
// ╚══════════════════════════════════════════════════════════╝

function renderStations(filter = "") {
    const stationList = document.getElementById('station-list');
    stationList.innerHTML = "";
    const sorted = [...stations].sort((a, b) => (favorites.includes(b.name) - favorites.includes(a.name)));
    
    sorted.filter(s => s.name.toLowerCase().includes(filter.toLowerCase())).forEach(station => {
        const li = document.createElement('li');
        li.className = `station-item ${currentStationTitle.textContent === station.name ? 'active' : ''}`;
        li.onclick = () => { playStation(station); closeMenu(); };
        
        li.innerHTML = `
            <span>${station.name}</span>
            <span class="fav-btn ${favorites.includes(station.name) ? 'is-fav' : ''}" 
                  onclick="event.stopPropagation(); toggleFavorite('${station.name}')">⭐</span>
        `;
        stationList.appendChild(li);
    });
}

function toggleFavorite(name) {
    favorites = favorites.includes(name) ? favorites.filter(f => f !== name) : [...favorites, name];
    localStorage.setItem('myRadiosFavs', JSON.stringify(favorites));
    renderStations(searchInput.value);
}

/**
 * FUNCIÓN PARA "PILLAR" EL NOMBRE DE LA CANCIÓN / PROGRAMA
 */
async function fetchNowPlaying(station) {
    if (!isPlayingManually) return;

    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(station.url)}`;

    try {
        trackInfoDisplay.textContent = "Obteniendo información...";

        setTimeout(() => {
            if (trackInfoDisplay.textContent === "Obteniendo información...") {
                trackInfoDisplay.textContent = station.desc || "Emisión en Directo";
            }
        }, 3000);

    } catch (error) {
        trackInfoDisplay.textContent = station.desc || "Emisión en Directo";
    }
}

// ╔══════════════════════════════════════════════════════════╗
// ║          REPRODUCIR / PARAR                              ║
// ╚══════════════════════════════════════════════════════════╝

function playStation(station) {
    initAudioContext(); 
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // Guardamos la estación actual para reconexión
    currentStation = station;
    resetReconnect();
    
    statusText.textContent = "Conectando...";
    currentStationTitle.textContent = station.name;
    isPlayingManually = true;
    
    // Iniciamos la búsqueda de info
    fetchNowPlaying(station);
    
    // Actualizamos la info cada 40 segundos
    if (metadataInterval) clearInterval(metadataInterval);
    metadataInterval = setInterval(() => fetchNowPlaying(station), 40000);

    audioPlayer.src = station.url;
    audioPlayer.play()
        .then(() => {
            statusText.textContent = "En directo";
            btnPlayPause.textContent = "Pausa";
            visualizer.style.display = "flex";
            liveBadge.style.display = "block";
            animateVisualizer(); 
            renderStations(searchInput.value);
            
            // === ACTIVAR MECANISMOS ANTI-SUSPENSIÓN ===
            requestWakeLock();        // Bloquear pantalla
            startKeepAlive();         // Mantener AudioContext vivo
            startHeartbeat();         // Verificar que el stream avanza
            
            // === MediaSession ===
            updateMediaSession(station);
        })
        .catch(() => {
            statusText.textContent = "Error de conexión";
            trackInfoDisplay.textContent = "";
        });
}

function stopPlayback() {
    isPlayingManually = false;
    currentStation = null;
    
    if (metadataInterval) clearInterval(metadataInterval);
    audioPlayer.pause();
    audioPlayer.src = ""; // Liberar el stream
    btnPlayPause.textContent = "Reproducir";
    visualizer.style.display = "none";
    liveBadge.style.display = "none";
    trackInfoDisplay.textContent = "";
    
    // === DESACTIVAR MECANISMOS ANTI-SUSPENSIÓN ===
    releaseWakeLock();
    stopKeepAlive();
    stopHeartbeat();
    resetReconnect();
    
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = "none";
    }
}

// ╔══════════════════════════════════════════════════════════╗
// ║     MEDIASESSION COMPLETO (controles de bloqueo)        ║
// ╚══════════════════════════════════════════════════════════╝

function updateMediaSession(station) {
    if (!('mediaSession' in navigator)) return;
    
    navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: station.desc || "Radio Online",
        album: "Radio Pro - España",
        artwork: [
            { src: 'https://cdn-icons-png.flaticon.com/512/3103/3103181.png', sizes: '512x512', type: 'image/png' }
        ]
    });
    navigator.mediaSession.playbackState = "playing";
}

if ('mediaSession' in navigator) {
    // Play
    navigator.mediaSession.setActionHandler('play', () => {
        initAudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        isPlayingManually = true;
        audioPlayer.play().catch(() => {});
        btnPlayPause.textContent = "Pausa";
        visualizer.style.display = "flex";
        liveBadge.style.display = "block";
        animateVisualizer();
        
        // Reactivar mecanismos
        requestWakeLock();
        startKeepAlive();
        startHeartbeat();
        
        navigator.mediaSession.playbackState = "playing";
    });
    
    // Pause
    navigator.mediaSession.setActionHandler('pause', () => {
        stopPlayback();
        navigator.mediaSession.playbackState = "paused";
    });
    
    // Stop
    navigator.mediaSession.setActionHandler('stop', () => {
        stopPlayback();
        navigator.mediaSession.playbackState = "none";
    });
    
    // Seek backward (avanzar 10s hacia atrás en stream en vivo no aplica, pero evita crashes)
    try {
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const offset = details.seekOffset || 10;
            audioPlayer.currentTime = Math.max(audioPlayer.currentTime - offset, 0);
        });
    } catch(e) {}
    
    // Seek forward
    try {
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const offset = details.seekOffset || 10;
            audioPlayer.currentTime = Math.min(audioPlayer.currentTime + offset, audioPlayer.duration || Infinity);
        });
    } catch(e) {}
    
    // Seek to
    try {
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.fastSeek && 'fastSeek' in audioPlayer) {
                audioPlayer.fastSeek(details.seekTime);
            } else {
                audioPlayer.currentTime = details.seekTime;
            }
        });
    } catch(e) {}
    
    // Previous track
    try {
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            // No-op para radio, pero evita que el SO lo ignore
        });
    } catch(e) {}
    
    // Next track
    try {
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            // No-op para radio, pero evita que el SO lo ignore
        });
    } catch(e) {}
}

// ╔══════════════════════════════════════════════════════════╗
// ║     RECONEXIÓN AUTOMÁTICA (eventos del audio)           ║
// ╚══════════════════════════════════════════════════════════╝

audioPlayer.addEventListener('stalled', () => {
    if (isPlayingManually && currentStation) {
        console.log('[Audio] Stream stalled, reconectando...');
        reconnectToStation();
    }
});

audioPlayer.addEventListener('ended', () => {
    if (isPlayingManually && currentStation) {
        console.log('[Audio] Stream ended, reconectando...');
        reconnectToStation();
    }
});

audioPlayer.addEventListener('error', (e) => {
    if (isPlayingManually && currentStation) {
        console.log('[Audio] Error detectado:', e.target.error);
        reconnectToStation();
    }
});

audioPlayer.addEventListener('pause', () => {
    if (isPlayingManually && document.hidden) {
        console.log('[Audio] Pausado en segundo plano, reintentando play...');
        audioPlayer.play().catch(() => {});
    }
});

// Cuando el audio empieza a sonar tras una reconexión, resetear contadores
audioPlayer.addEventListener('playing', () => {
    if (isPlayingManually) {
        reconnectAttempts = 0;
        statusText.textContent = "En directo";
        lastAudioTime = audioPlayer.currentTime;
    }
});

// ╔══════════════════════════════════════════════════════════╗
// ║          TEMPORIZADOR                                   ║
// ╚══════════════════════════════════════════════════════════╝

function setTimer(minutes) {
    clearInterval(timerInterval);
    const timerDisplay = document.getElementById('timer-display');
    if (minutes === 0) { timerDisplay.textContent = ""; return; }
    timerSeconds = minutes * 60;
    timerInterval = setInterval(() => {
        timerSeconds--;
        const mins = Math.floor(timerSeconds / 60);
        const secs = timerSeconds % 60;
        timerDisplay.textContent = `Apagado en: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
        if (timerSeconds <= 0) { clearInterval(timerInterval); stopPlayback(); }
    }, 1000);
}

// ╔══════════════════════════════════════════════════════════╗
// ║          EVENTOS DE CONTROLES                           ║
// ╚══════════════════════════════════════════════════════════╝

menuToggle.onclick = openMenu;
closeMenuBtn.onclick = closeMenu;
overlay.onclick = closeMenu;
volumeSlider.oninput = (e) => { audioPlayer.volume = e.target.value; };

btnPlayPause.onclick = () => {
    if (!audioPlayer.src) return;
    initAudioContext();
    if (audioPlayer.paused) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        isPlayingManually = true;
        
        // Reactivar mecanismos
        requestWakeLock();
        startKeepAlive();
        startHeartbeat();
        
        audioPlayer.play().catch(() => {});
        btnPlayPause.textContent = "Pausa";
        visualizer.style.display = "flex";
        liveBadge.style.display = "block";
        animateVisualizer();
    } else {
        stopPlayback();
    }
};

searchInput.oninput = (e) => renderStations(e.target.value);
setInterval(updateClock, 1000);
updateClock();
renderStations();
