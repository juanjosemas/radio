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
let lastPlayPos = 0; 
let wakeLock = null; 

// --- Variables para el Visualizador Real (Web Audio API) ---
let audioCtx = null;
let analyser = null;
let source = null;
let dataArray = null;
let animationId = null;

// --- Referencias DOM ---
const audioPlayer = document.getElementById('audio-player');
const stationList = document.getElementById('station-list');
const currentStationTitle = document.getElementById('current-station');
const statusText = document.getElementById('status');
const btnPlayPause = document.getElementById('btn-play-pause');
const searchInput = document.getElementById('search-input');
const visualizer = document.getElementById('visualizer');
const bars = document.querySelectorAll('.bar'); // Seleccionamos todas las barras
const liveBadge = document.getElementById('live-indicator');
const timerDisplay = document.getElementById('timer-display');
const clockDisplay = document.getElementById('digital-clock');
const volumeSlider = document.getElementById('volume-slider');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const closeMenuBtn = document.getElementById('close-menu');
const overlay = document.getElementById('overlay');

// --- Inicialización del Analizador de Audio ---
function initAudioContext() {
    // Solo creamos el contexto si no existe (obligatorio por seguridad del navegador)
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        // Conectamos el audio del reproductor al analizador
        source = audioCtx.createMediaElementSource(audioPlayer);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        
        // Configuración de precisión (fftSize)
        analyser.fftSize = 64; 
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }
}

// --- Función que anima las barras según el sonido real ---
function animateVisualizer() {
    if (!isPlayingManually) {
        cancelAnimationFrame(animationId);
        return;
    }
    
    animationId = requestAnimationFrame(animateVisualizer);
    analyser.getByteFrequencyData(dataArray); // Obtenemos datos de frecuencia actuales

    // Iteramos por las 12 barras y les asignamos altura basada en el audio
    bars.forEach((bar, index) => {
        // Usamos diferentes partes del array para que cada barra represente un tono (bajo, medio, agudo)
        const value = dataArray[index * 2] || 0; 
        const percent = (value / 255) * 100;
        // Aplicamos la altura mínima de 4px y máxima de 45px
        const height = Math.max(4, (percent * 0.45)); 
        bar.style.height = `${height}px`;
        // Efecto extra: la opacidad cambia ligeramente con la intensidad
        bar.style.opacity = 0.6 + (percent / 250);
    });
}

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

// --- Gestión de Wake Lock ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.error(`Error con Wake Lock: ${err.name}`);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
    }
}

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

// --- MediaSession ---
function updateMediaSession(stationName) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: stationName,
            artist: "Radio Online - En Directo",
            artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/3103/3103181.png', sizes: '512x512', type: 'image/png' }]
        });
    }
}

// --- Estrategia Anti-Corte ---
function forceReconnection() {
    if (isPlayingManually) {
        const currentUrl = audioPlayer.src;
        audioPlayer.pause();
        audioPlayer.src = ""; 
        audioPlayer.load(); 
        audioPlayer.src = currentUrl;
        audioPlayer.play().catch(e => console.error(e));
    }
}

setInterval(() => {
    if (isPlayingManually) {
        if (audioPlayer.currentTime === lastPlayPos && !audioPlayer.paused) {
            forceReconnection();
        }
        lastPlayPos = audioPlayer.currentTime;
    }
}, 8000);

function playStation(station) {
    initAudioContext(); 
    if (audioCtx.state === 'suspended') audioCtx.resume();

    statusText.textContent = "Conectando...";
    currentStationTitle.textContent = station.name;
    isPlayingManually = true;
    
    audioPlayer.pause();
    audioPlayer.src = station.url;
    
    updateMediaSession(station.name);
    requestWakeLock();
    
    audioPlayer.play()
        .then(() => {
            statusText.textContent = "En directo";
            btnPlayPause.textContent = "Pausa";
            btnPlayPause.classList.add('playing');
            visualizer.style.display = "flex";
            liveBadge.style.display = "block";
            animateVisualizer(); 
            renderStations(searchInput.value);
        })
        .catch(() => {
            statusText.textContent = "Error de conexión";
        });
}

// --- Temporizador ---
function setTimer(minutes) {
    clearInterval(timerInterval);
    if (minutes === 0) {
        timerSeconds = 0;
        timerDisplay.textContent = "";
        return;
    }
    timerSeconds = minutes * 60;
    timerInterval = setInterval(() => {
        timerSeconds--;
        const mins = Math.floor(timerSeconds / 60);
        const secs = timerSeconds % 60;
        timerDisplay.textContent = `Apagado en: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            stopPlayback();
            timerDisplay.textContent = "⏰ Radio apagada";
        }
    }, 1000);
}

function stopPlayback() {
    isPlayingManually = false;
    audioPlayer.pause();
    btnPlayPause.textContent = "Reproducir";
    btnPlayPause.classList.remove('playing');
    visualizer.style.display = "none";
    liveBadge.style.display = "none";
    releaseWakeLock();
}

// --- Controles ---
volumeSlider.oninput = (e) => { audioPlayer.volume = e.target.value; };

btnPlayPause.onclick = () => {
    if (!audioPlayer.src) return;
    initAudioContext();
    if (audioPlayer.paused) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        isPlayingManually = true;
        requestWakeLock();
        audioPlayer.play();
        btnPlayPause.textContent = "Pausa";
        btnPlayPause.classList.add('playing');
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