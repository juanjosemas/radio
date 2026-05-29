const stations = [
    { name: "COPE Nacional", url: "https://net1-cope-rrcast.flumotion.com/cope/net1-low.mp3" },
    { name: "Radio Nacional (RNE 1)", url: "https://rtvelivestream.rtve.es/rtvesec/rne/rne_r1_main.m3u8" },
    { name: "Cadena SER", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASER.mp3" },
    { name: "Radio Marca", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOMARCA_NACIONAL.mp3" }, 
    { name: "Los 40 Principales", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3" },
    { name: "Funky house", url: "https://stream.technolovers.fm/funky-house" },
    { name: "Funky disco", url: "https://funky-disco-hits.stream.laut.fm/funky-disco-hits" },
    { name: "Funky 80's", url: "https://play.radioking.io/fm80funkymusic/523739" },
    { name: "Deep House", url: "https://hits1deep-audiomediaradio.radioca.st/deep" }, 
   { name: "181.FM Soul", url: "https://listen.181fm.com/181-soul_128k.mp3" },
    { name: "Soulful House", url: "https://radio4.vip-radios.fm:18057/stream-128kmp3-SoulfulHouse" } 
];

// --- Estado global ---
let favorites = JSON.parse(localStorage.getItem('myRadiosFavs')) || [];
let timerInterval = null;
let timerSeconds = 0;
let isPlayingManually = false; 
let lastPlayPos = 0; // Para detectar si el audio se congela realmente
let wakeLock = null; // Para mantener la pantalla/proceso activo y evitar que el SO lo mate

// --- Referencias DOM ---
const audioPlayer = document.getElementById('audio-player');
const stationList = document.getElementById('station-list');
const currentStationTitle = document.getElementById('current-station');
const statusText = document.getElementById('status');
const btnPlayPause = document.getElementById('btn-play-pause');
const searchInput = document.getElementById('search-input');
const visualizer = document.getElementById('visualizer');
const liveBadge = document.getElementById('live-indicator');
const timerDisplay = document.getElementById('timer-display');
const clockDisplay = document.getElementById('digital-clock');
const volumeSlider = document.getElementById('volume-slider');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const closeMenuBtn = document.getElementById('close-menu');
const overlay = document.getElementById('overlay');

// --- Control del Menú Lateral ---
function openMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
}

function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

menuToggle.onclick = openMenu;
closeMenuBtn.onclick = closeMenu;
overlay.onclick = closeMenu;

// --- Reloj Digital ---
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    clockDisplay.textContent = `${h}:${m}:${s}`;
}

// --- Gestión de Wake Lock (Evita que el móvil se duerma) ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log("Wake Lock activo: el sistema no se dormirá");
            
            // Si el Wake Lock se libera (ej. al minimizar), lo re-solicitamos al volver
            wakeLock.addEventListener('release', () => {
                console.log("Wake Lock liberado");
            });
        } catch (err) {
            console.error(`Error con Wake Lock: ${err.name}, ${err.message}`);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
    }
}

// Re-solicitar Wake Lock si la pestaña vuelve a estar visible
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// --- Gestión de Emisoras ---
function renderStations(filter = "") {
    stationList.innerHTML = "";
    const sortedStations = [...stations].sort((a, b) => {
        const aFav = favorites.includes(a.name) ? 1 : 0;
        const bFav = favorites.includes(b.name) ? 1 : 0;
        return bFav - aFav;
    });

    const filtered = sortedStations.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

    filtered.forEach(station => {
        const li = document.createElement('li');
        li.className = `station-item ${currentStationTitle.textContent === station.name ? 'active' : ''}`;
        li.onclick = () => { playStation(station); closeMenu(); };
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = station.name;
        
        const favBtn = document.createElement('span');
        favBtn.className = `fav-btn ${favorites.includes(station.name) ? 'is-fav' : ''}`;
        favBtn.textContent = "⭐";
        favBtn.onclick = (e) => { e.stopPropagation(); toggleFavorite(station.name); };
        
        li.appendChild(nameSpan);
        li.appendChild(favBtn);
        stationList.appendChild(li);
    });
}

function toggleFavorite(name) {
    if (favorites.includes(name)) {
        favorites = favorites.filter(f => f !== name);
    } else {
        favorites.push(name);
    }
    localStorage.setItem('myRadiosFavs', JSON.stringify(favorites));
    renderStations(searchInput.value);
}

// --- MediaSession (Control desde pantalla de bloqueo) ---
function updateMediaSession(stationName) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: stationName,
            artist: "Radio Online - En Directo",
            album: "Streaming Premium",
            artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/3103/3103181.png', sizes: '512x512', type: 'image/png' }]
        });
        
        navigator.mediaSession.setActionHandler('play', () => { 
            isPlayingManually = true; 
            audioPlayer.play(); 
            requestWakeLock();
        });
        navigator.mediaSession.setActionHandler('pause', () => { 
            isPlayingManually = false; 
            audioPlayer.pause(); 
            releaseWakeLock();
        });
    }
}

// --- Estrategia Anti-Corte Reforzada ---
function forceReconnection() {
    if (isPlayingManually) {
        console.log("Detectado silencio o corte. Reconectando flujo...");
        const currentUrl = audioPlayer.src;
        audioPlayer.pause();
        audioPlayer.src = ""; // Limpiamos el buffer actual
        audioPlayer.load(); // Forzamos al navegador a olvidar el estado anterior
        audioPlayer.src = currentUrl;
        audioPlayer.play()
            .then(() => console.log("Reconexión exitosa"))
            .catch(e => console.error("Error al reanudar:", e));
    }
}

// Monitorización activa cada 8 segundos (un poco más agresiva)
setInterval(() => {
    if (isPlayingManually) {
        // Si el tiempo de reproducción no ha avanzado, hay un "congelamiento" de buffer
        if (audioPlayer.currentTime === lastPlayPos && !audioPlayer.paused) {
            forceReconnection();
        }
        lastPlayPos = audioPlayer.currentTime;

        // Si por algún motivo el SO pausó el audio sin permiso del usuario
        if (audioPlayer.paused && isPlayingManually) {
            forceReconnection();
        }

        // Informar al MediaSession que seguimos en reproducción
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }
    }
}, 8000);

// Detectar cambios de visibilidad
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isPlayingManually && audioPlayer.paused) {
        forceReconnection();
    }
});

// Eventos de error/bloqueo nativos del elemento audio
audioPlayer.addEventListener('stalled', () => { if(isPlayingManually) forceReconnection(); });
audioPlayer.addEventListener('error', () => { if(isPlayingManually) forceReconnection(); });

function playStation(station) {
    statusText.textContent = "Conectando...";
    currentStationTitle.textContent = station.name;
    isPlayingManually = true;
    
    audioPlayer.pause();
    audioPlayer.src = ""; 
    audioPlayer.load(); 
    audioPlayer.src = station.url;
    
    updateMediaSession(station.name);
    requestWakeLock(); // Activamos el bloqueo de suspensión al iniciar
    
    audioPlayer.play()
        .then(() => {
            statusText.textContent = "En directo";
            btnPlayPause.textContent = "Pausa";
            btnPlayPause.classList.add('playing');
            visualizer.style.display = "flex";
            liveBadge.style.display = "block";
            renderStations(searchInput.value);
        })
        .catch(() => {
            statusText.textContent = "Reintentando...";
            setTimeout(() => playStation(station), 2000);
        });
}

// --- Lógica del Temporizador ---
function setTimer(minutes) {
    clearInterval(timerInterval);
    if (minutes === 0) {
        timerSeconds = 0;
        timerDisplay.textContent = "";
        return;
    }
    timerSeconds = minutes * 60;
    updateTimerUI();
    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerUI();
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            stopPlayback();
            timerDisplay.textContent = "⏰ Radio apagada";
        }
    }, 1000);
}

function updateTimerUI() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    timerDisplay.textContent = `Apagado en: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function stopPlayback() {
    isPlayingManually = false;
    audioPlayer.pause();
    btnPlayPause.textContent = "Reproducir";
    btnPlayPause.classList.remove('playing');
    visualizer.style.display = "none";
    liveBadge.style.display = "none";
    releaseWakeLock(); // Liberamos el control de energía para que el móvil pueda descansar
}

// --- Controles Directos ---
volumeSlider.oninput = (e) => { audioPlayer.volume = e.target.value; };

btnPlayPause.onclick = () => {
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
        isPlayingManually = true;
        requestWakeLock();
        audioPlayer.play();
        btnPlayPause.textContent = "Pausa";
        btnPlayPause.classList.add('playing');
        visualizer.style.display = "flex";
        liveBadge.style.display = "block";
    } else {
        stopPlayback();
    }
};

searchInput.oninput = (e) => renderStations(e.target.value);

// Inicio de la App
setInterval(updateClock, 1000);
updateClock();
renderStations();