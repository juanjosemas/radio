const stations = [
    { name: "COPE Nacional", url: "https://net1-cope-rrcast.flumotion.com/cope/net1-low.mp3" },
    { name: "Radio Nacional (RNE 1)", url: "https://rtvelivestream.rtve.es/rtvesec/rne/rne_r1_main.m3u8" },
    { name: "Cadena SER", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASER.mp3" },
    { name: "O", url: "https://ondacero.es/directo/" },
    { name: "Radio Marca", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOMARCA_NACIONAL.mp3" }, 
    { name: "Los 40 Principales", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40.mp3" },
    { name: "Funky house", url: "https://stream.technolovers.fm/funky-house" },
    { name: "Funky disco", url: "https://funky-disco-hits.stream.laut.fm/funky-disco-hits" },
    { name: "Funky 80's", url: "https://play.radioking.io/fm80funkymusic/523739" },
    { name: "Deep House", url: "https://hits1deep-audiomediaradio.radioca.st/deep" }, 
    { name: "Lo mejor del Deep House", url: "http://HearMe.fm:8023/stream" } 
];

// Estado global de la app
let favorites = JSON.parse(localStorage.getItem('myRadiosFavs')) || [];
let timerInterval = null;
let timerSeconds = 0;

// Referencias a elementos del DOM
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

// Elementos del Menú
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
        
        li.onclick = () => {
            playStation(station);
            closeMenu();
        };

        const nameSpan = document.createElement('span');
        nameSpan.textContent = station.name;

        const favBtn = document.createElement('span');
        favBtn.className = `fav-btn ${favorites.includes(station.name) ? 'is-fav' : ''}`;
        favBtn.textContent = "⭐";
        favBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(station.name);
        };

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

// --- Función para evitar el corte en segundo plano ---
function updateMediaSession(stationName) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: stationName,
            artist: "Radio Online",
            album: "En directo",
            artwork: [
                { src: 'https://cdn-icons-png.flaticon.com/512/3103/3103181.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        // Permitir controlar la radio desde la pantalla de bloqueo
        navigator.mediaSession.setActionHandler('play', () => audioPlayer.play());
        navigator.mediaSession.setActionHandler('pause', () => audioPlayer.pause());
    }
}

function playStation(station) {
    statusText.textContent = "Conectando...";
    currentStationTitle.textContent = station.name;
    
    audioPlayer.pause();
    audioPlayer.src = ""; 
    audioPlayer.load(); 
    audioPlayer.src = station.url;
    
    // Configurar la sesión de medios para segundo plano
    updateMediaSession(station.name);
    
    audioPlayer.play()
        .then(() => {
            statusText.textContent = "En directo";
            btnPlayPause.textContent = "Pausa";
            visualizer.style.display = "flex";
            liveBadge.style.display = "block";
            renderStations(searchInput.value);
        })
        .catch(() => {
            statusText.textContent = "Error de conexión";
            visualizer.style.display = "none";
            liveBadge.style.display = "none";
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
            audioPlayer.pause();
            btnPlayPause.textContent = "Reproducir";
            visualizer.style.display = "none";
            liveBadge.style.display = "none";
            timerDisplay.textContent = "⏰ Radio apagada";
        }
    }, 1000);
}

function updateTimerUI() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    timerDisplay.textContent = `Apagado en: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

btnPlayPause.onclick = () => {
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
        audioPlayer.play();
        btnPlayPause.textContent = "Pausa";
        visualizer.style.display = "flex";
        liveBadge.style.display = "block";
    } else {
        audioPlayer.pause();
        btnPlayPause.textContent = "Reproducir";
        visualizer.style.display = "none";
        liveBadge.style.display = "none";
    }
};

searchInput.oninput = (e) => renderStations(e.target.value);

setInterval(updateClock, 1000);
updateClock();
renderStations();