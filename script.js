const stations = [
    { name: "COPE Nacional", url: "https://net1-cope-rrcast.flumotion.com/cope/net1-low.mp3", desc: "Noticias y Deportes" },
    { name: "Radio Nacional (RNE 1)", url: "https://rtvelivestream.rtve.es/rtvesec/rne/rne_r1_main.m3u8", desc: "Radio Pública" },
    { name: "Cadena SER", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASER.mp3", desc: "Actualidad y Entretenimiento" },
    { name: "Radio Marca", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOMARCA_NACIONAL.mp3", desc: "El Deporte que se Vive" }, 
    { name: "Los 40 Principales", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3", desc: "Éxitos del Momento" },
    { name: "Funky house", url: "https://stream.technolovers.fm/funky-house", desc: "Lo mejor del Funky House" },
    { name: "Funky disco", url: "https://funky-disco-hits.stream.laut.fm/funky-disco-hits", desc: "Disco y Funk clásico" },
    { name: "Funky 80's", url: "https://play.radioking.io/fm80funkymusic/523739", desc: "Clásicos de los 80" },
    { name: "Deep House", url: "https://hits1deep-audiomediaradio.radioca.st/deep", desc: "Sonido Deep Relax" }, 
    { name: "181.FM Soul", url: "https://listen.181fm.com/181-soul_128k.mp3", desc: "R&B y Soul" },
    { name: "Soulful House", url: "https://radio4.vip-radios.fm:18057/stream-128kmp3-SoulfulHouse", desc: "House con Alma" }, 
    { name: "Deep Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/DEEP_RADIO.mp3", desc: "Deep & Chill" }, 
    { name: "Nostalgie Funky", url: "https://streaming.nrjaudio.fm/ou7x6kf3s5gi", desc: "Grandes Clásicos Funk" }
];

// --- Estado global ---
let favorites = JSON.parse(localStorage.getItem('myRadiosFavs')) || [];
let timerInterval = null;
let timerSeconds = 0;
let isPlayingManually = false; 

// --- Audio Context (Calidad Pro) ---
let audioCtx = null;
let analyser = null;
let source = null;
let masterGain = null; 
let dataArray = null;
let animationId = null;

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

// --- Funciones Menú ---
function openMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
}
function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// --- Inicialización Audio ---
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
    }
}

// --- Animación Visualizador ---
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

// --- Reloj Digital ---
function updateClock() {
    const now = new Date();
    clockDisplay.textContent = now.toLocaleTimeString('es-ES', { hour12: false });
}

// --- Gestión de Emisoras ---
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

// Función para actualizar la info del track (Simulada/Best-effort)
function updateTrackInfo(station) {
    trackInfoDisplay.textContent = "Sintonizando...";
    
    // Como los navegadores bloquean metadatos ICY por CORS, 
    // usamos la descripción predefinida como fallback tras 3 segundos
    setTimeout(() => {
        if (isPlayingManually) {
            // Si la emisora tiene una descripción propia, la usamos
            trackInfoDisplay.textContent = station.desc || "Emisión en directo";
        }
    }, 4000);
}

function playStation(station) {
    initAudioContext(); 
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    statusText.textContent = "Conectando...";
    currentStationTitle.textContent = station.name;
    isPlayingManually = true;
    
    // Intentamos cargar la info de la canción
    updateTrackInfo(station);
    
    audioPlayer.src = station.url;
    audioPlayer.play()
        .then(() => {
            statusText.textContent = "En directo";
            btnPlayPause.textContent = "Pausa";
            visualizer.style.display = "flex";
            liveBadge.style.display = "block";
            animateVisualizer(); 
            renderStations(searchInput.value);
            
            // Actualizamos la MediaSession (lo que sale en la pantalla de bloqueo del móvil)
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: station.name,
                    artist: station.desc || "Radio Online",
                    album: "En directo",
                    artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/3103/3103181.png', sizes: '512x512', type: 'image/png' }]
                });
            }
        })
        .catch(() => {
            statusText.textContent = "Error de conexión";
            trackInfoDisplay.textContent = "";
        });
}

function stopPlayback() {
    isPlayingManually = false;
    audioPlayer.pause();
    btnPlayPause.textContent = "Reproducir";
    visualizer.style.display = "none";
    liveBadge.style.display = "none";
    trackInfoDisplay.textContent = "";
}

// --- Temporizador ---
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

// --- Eventos de Controles ---
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
        audioPlayer.play();
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