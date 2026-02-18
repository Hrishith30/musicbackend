const searchInput = document.getElementById('searchInput');
const searchFilter = document.getElementById('searchFilter');
const resultsView = document.getElementById('resultsView');
const resultsGrid = document.getElementById('resultsGrid');
const homeView = document.getElementById('homeView');

const recentSection = document.getElementById('recentSection');
const recentGrid = document.getElementById('recentGrid');
const loadingSpinner = document.getElementById('loadingSpinner');

// Language Section Elements
const languageSelect = document.getElementById('languageSelect');
const languageGrid = document.getElementById('languageGrid');

// Navigation & Views
const navHome = document.getElementById('navHome');
const navSearch = document.getElementById('navSearch');
const navLibrary = document.getElementById('navLibrary');
const libraryView = document.getElementById('libraryView');
const albumView = document.getElementById('albumView');

// Album Elements
const albumArt = document.getElementById('albumArt');
const albumTitle = document.getElementById('albumTitle');
const albumArtist = document.getElementById('albumArtist');
const albumYear = document.getElementById('albumYear');
const albumTracks = document.getElementById('albumTracks');
const backFromAlbum = document.getElementById('backFromAlbum');
const playAlbumBtn = document.getElementById('playAlbumBtn');
const addAllToLibraryBtn = document.getElementById('addAllToLibraryBtn');

// Player Elements
const audioElement = document.getElementById('audioElement');
const playerArt = document.getElementById('playerArt');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');

// Mobile Player Elements
const mobilePlayerArt = document.getElementById('mobilePlayerArt');
const mobilePlayerTitle = document.getElementById('mobilePlayerTitle');
const mobilePlayerArtist = document.getElementById('mobilePlayerArtist');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const volumeBtn = document.getElementById('volumeBtn');
const volumeSlider = document.getElementById('volumeSlider');
let isDragging = false;
let lastVolume = 1.0;
// variable removed

// State
// Queue Management
let queue = [];
let originalQueue = []; // To restore order after un-shuffle
let currentIndex = -1;
let isShuffle = false;
let repeatMode = 0; // 0: off, 1: all, 2: one

// State tracking for Smart Sync
let currentAlbumState = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {

    loadRecentlyPlayed();
    setupFilters();
    setupNavigation();
    setupAlbumView();
    setupPlayerControls();
    setupVolumeControl();
    loadLibrary();

    // Check for language onboarding
    const savedLang = localStorage.getItem('userLanguage');
    if (savedLang) {
        if (languageSelect) {
            languageSelect.value = savedLang;
            if (currentLangLabel) currentLangLabel.textContent = savedLang;
            loadLanguageContent(savedLang);
            loadLanguageAlbums(savedLang);
        }
    } else {
        showLanguageOnboarding();
    }
});

function showLanguageOnboarding() {
    const modal = document.getElementById('languageOnboarding');
    const content = document.getElementById('onboardingContent');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    // Force reflow
    void modal.offsetWidth;

    modal.classList.remove('opacity-0');
    content.classList.remove('opacity-0', 'scale-90');
}

window.selectOnboardingLanguage = function (lang) {
    localStorage.setItem('userLanguage', lang);

    if (languageSelect) {
        languageSelect.value = lang;
        if (currentLangLabel) currentLangLabel.textContent = lang;
    }

    // Load content immediately
    loadLanguageContent(lang);
    loadLanguageAlbums(lang);

    // Fade out modal
    const modal = document.getElementById('languageOnboarding');
    const content = document.getElementById('onboardingContent');

    if (modal && content) {
        modal.classList.add('opacity-0');
        content.classList.add('opacity-0', 'scale-90');

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 700);
    }
};

// --- Player Logic ---

function savePlayerState() {
    if (currentIndex === -1) return;

    // IMPORTANT: If we are in the middle of a restore (pendingTime exists), 
    // use that instead of the current (reset) audioElement.currentTime.
    let savedTime = audioElement.dataset.pendingTime ? parseFloat(audioElement.dataset.pendingTime) : audioElement.currentTime;
    let savedDuration = audioElement.duration;

    // If duration is NaN (still loading), try to preserve the existing one from localStorage
    if (isNaN(savedDuration) || !isFinite(savedDuration)) {
        const existingState = JSON.parse(localStorage.getItem('playerPlaybackState') || '{}');
        savedDuration = existingState.duration || 0;
    }

    const state = {
        queue,
        originalQueue,
        currentIndex,
        isShuffle,
        repeatMode,
        currentTime: savedTime,
        duration: savedDuration,
        volume: audioElement.volume,
        wasPlaying: audioElement.dataset.autoResume === "true" || !audioElement.paused
    };
    localStorage.setItem('playerPlaybackState', JSON.stringify(state));
}

function restorePlayerState() {
    const stateStr = localStorage.getItem('playerPlaybackState');
    if (!stateStr) return;

    try {
        const state = JSON.parse(stateStr);
        queue = state.queue || [];
        originalQueue = state.originalQueue || [];
        currentIndex = state.currentIndex !== undefined ? state.currentIndex : -1;
        isShuffle = !!state.isShuffle;
        repeatMode = state.repeatMode || 0;

        if (state.volume !== undefined) {
            audioElement.volume = state.volume;
            if (volumeSlider) volumeSlider.value = state.volume;
            updateVolumeIcon(state.volume);
        }

        if (currentIndex !== -1 && queue[currentIndex]) {
            const track = queue[currentIndex];
            playerTitle.textContent = track.title;
            playerArtist.textContent = track.artist || 'Unknown Artist';
            const defaultThumb = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100%25\' height=\'100%25\' viewBox=\'0 0 1 1\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%23333\'/%3E%3C/svg%3E';
            playerArt.src = track.thumb || defaultThumb;
            playerArt.classList.remove('opacity-50');

            if (mobilePlayerTitle) mobilePlayerTitle.textContent = track.title;
            if (mobilePlayerArtist) mobilePlayerArtist.textContent = track.artist || 'Unknown Artist';
            if (mobilePlayerArt) mobilePlayerArt.src = track.thumb || playerArt.src;

            // Flag to restore position once user interacts or metadata loads
            if (state.currentTime) {
                audioElement.dataset.pendingTime = state.currentTime;

                // Immediate UI restore if we have duration
                if (state.duration && !isNaN(state.duration)) {
                    document.getElementById('currentTime').textContent = formatTime(state.currentTime);
                    document.getElementById('totalDuration').textContent = formatTime(state.duration);
                    const percent = (state.currentTime / state.duration) * 100;
                    progressBar.style.width = `${percent}%`;
                }
            }

            // Attempt auto-resume if it was playing
            if (state.wasPlaying) {
                // We need to wait for user interaction usually, but we can try
                // or just prepare the UI to look "ready"
                audioElement.dataset.autoResume = "true";
            }

            updateQueueUI();
        }

        // Sync button states
        if (shuffleBtn) {
            shuffleBtn.classList.toggle('text-accent', isShuffle);
            shuffleBtn.classList.toggle('text-gray-400', !isShuffle);
        }
        updateRepeatUI();
    } catch (e) {
        console.error("Error restoring state", e);
    }
}

function setupPlayerControls() {
    audioElement.volume = 1.0; // Default max volume

    // Restore state BEFORE adding listeners that might trigger saves
    restorePlayerState();

    playPauseBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', playPrev);
    nextBtn.addEventListener('click', playNext);
    shuffleBtn.addEventListener('click', toggleShuffle);
    repeatBtn.addEventListener('click', toggleRepeat);

    // Audio Events
    let lastSaveTime = 0;
    audioElement.addEventListener('timeupdate', () => {
        updateProgress();
        // Periodic save for current position
        const now = Date.now();
        if (now - lastSaveTime > 3000) { // Every 3s
            savePlayerState();
            lastSaveTime = now;
        }
    });

    audioElement.addEventListener('play', savePlayerState);
    audioElement.addEventListener('pause', savePlayerState);
    audioElement.addEventListener('volumechange', savePlayerState);
    audioElement.addEventListener('ended', handleTrackEnd);

    // Final save on window close or tab change
    window.addEventListener('beforeunload', savePlayerState);
    window.addEventListener('pagehide', savePlayerState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') savePlayerState();
    });

    audioElement.addEventListener('loadedmetadata', () => {
        if (audioElement.duration && isFinite(audioElement.duration)) {
            document.getElementById('totalDuration').textContent = formatTime(audioElement.duration);

            // Restore pending time if present
            if (audioElement.dataset.pendingTime) {
                audioElement.currentTime = parseFloat(audioElement.dataset.pendingTime);
                delete audioElement.dataset.pendingTime;
                updateProgress();

                // If auto-resume was requested
                if (audioElement.dataset.autoResume === "true") {
                    delete audioElement.dataset.autoResume;
                    audioElement.play().catch(e => {
                        console.log("Auto-resume blocked by browser, waiting for user interaction.");
                    });
                }
            }
        }
    });

    // Progress Bar Interaction (Click & Drag)

    const handleSeek = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX); // Support touch
        if (clientX === undefined) return;

        const width = rect.width;
        const clickX = Math.max(0, Math.min(clientX - rect.left, width)); // Clamp
        const percent = (clickX / width) * 100;

        // Update UI immediately
        progressBar.style.width = `${percent}%`;

        // Return calculated time for final seek
        const duration = audioElement.duration;
        const seekTime = duration ? (clickX / width) * duration : 0;

        // Update time display while dragging
        if (duration) {
            document.getElementById('currentTime').textContent = formatTime(seekTime);
        }

        return seekTime;
    };

    progressContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        handleSeek(e); // Jump to click
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            e.preventDefault(); // Prevent text selection
            handleSeek(e);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            const newTime = handleSeek(e);
            if (audioElement.duration) {
                audioElement.currentTime = newTime;
            }
        }
    });

    // Mobile / Touch support
    progressContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        handleSeek(e);
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            e.preventDefault();
            handleSeek(e);
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (isDragging) {
            isDragging = false;
            // Only seek if we have a valid time from last move, logic is implicitly handled by handleSeek updating UI, 
            // but we need the exact time. Let's recalculate or store it.
            // Simplified: Just update time on end based on last position if needed, 
            // but mouseup handler pattern uses the event. Touchend might not have coordinates.
            // Better: update currentTime during drag? No, causes audio glitches.
            // Let's stick to mouseup/touchend commit.
            // For touchend, we might need the last known pct.
            // Re-use logic:
            // Actually, let's just update currentTime ONCE at end.
            // We need to know the 'newTime' from the last move. 
            // Let's attach 'newTime' to the element or shared var?
            // Simplest: `handleSeek` returns time.
            // For touchend, we don't have clientX.
            // Let's rely on the last style width? 
            // Or just update currentTime smoothly during drag if performance allows? 
            // Standard is: update UI during drag, seek on drop.

            // To fix touchend missing coords: 
            // We can just set currentTime based on current progressBar width %
            const percent = parseFloat(progressBar.style.width);
            if (audioElement.duration) {
                audioElement.currentTime = (percent / 100) * audioElement.duration;
            }
        }
    });
}

function setupVolumeControl() {
    if (!volumeBtn || !volumeSlider) return;

    volumeSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        audioElement.volume = value;
        updateVolumeIcon(value);
        if (value > 0) lastVolume = value;
    });

    volumeBtn.addEventListener('click', () => {
        if (audioElement.volume > 0) {
            lastVolume = audioElement.volume;
            audioElement.volume = 0;
            volumeSlider.value = 0;
            updateVolumeIcon(0);
        } else {
            const newVol = lastVolume || 1.0;
            audioElement.volume = newVol;
            volumeSlider.value = newVol;
            updateVolumeIcon(newVol);
        }
    });

    // Init
    volumeSlider.value = audioElement.volume;
    updateVolumeIcon(audioElement.volume);
}

function updateVolumeIcon(vol) {
    if (vol === 0) {
        volumeBtn.className = 'text-gray-500 hover:text-white transition-colors p-2';
        volumeBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
    } else {
        volumeBtn.className = 'text-gray-400 hover:text-white transition-colors p-2';
        if (vol < 0.5) {
            // Low volume
            volumeBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
        } else {
            // High volume
            volumeBtn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
        }
    }
}

function togglePlay() {
    if (audioElement.paused) {
        if (audioElement.src) {
            audioElement.play();
            updatePlayPauseIcon(true);
        } else if (queue.length > 0 && currentIndex !== -1) {
            playTrack(currentIndex);
        }
    } else {
        audioElement.pause();
        updatePlayPauseIcon(false);
    }
}

function updatePlayPauseIcon(isPlaying) {
    if (isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
    } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
    }
}

function handleTrackEnd() {
    if (repeatMode === 2) {
        audioElement.currentTime = 0;
        audioElement.play();
    } else {
        playNext(true); // true = auto (don't stop if end of queue unless repeat off)
    }
}

function playNext(auto = false) {
    if (queue.length === 0) return;

    if (repeatMode === 1 && currentIndex === queue.length - 1) {
        currentIndex = 0;
        playTrack(currentIndex);
    } else if (currentIndex < queue.length - 1) {
        currentIndex++;
        playTrack(currentIndex);
    } else if (!auto) {
        // If user clicked next at end of queue, wrap around or stop? 
        // Usually wrap around if repeat all, else stop. 
        // But "Next" button usually wraps or does nothing. Let's wrap for UX.
        currentIndex = 0;
        playTrack(currentIndex);
    } else {
        // Auto end of queue -> Stop
        updatePlayPauseIcon(false);
    }
}

function playPrev() {
    if (queue.length === 0) return;

    // If > 3 seconds in, restart song
    if (audioElement.currentTime > 3) {
        audioElement.currentTime = 0;
        return;
    }

    if (currentIndex > 0) {
        currentIndex--;
        playTrack(currentIndex);
    } else {
        // Wrap to end?
        currentIndex = queue.length - 1;
        playTrack(currentIndex);
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('text-accent', isShuffle);
    shuffleBtn.classList.toggle('text-gray-400', !isShuffle);
    shuffleBtn.blur(); // Fix sticky focus on mobile

    if (isShuffle) {
        // Shuffle current queue
        originalQueue = [...queue];
        const currentTrack = queue[currentIndex];
        const otherTracks = queue.filter((_, i) => i !== currentIndex);
        for (let i = otherTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
        }
        queue = [currentTrack, ...otherTracks];
        currentIndex = 0;
    } else {
        if (originalQueue.length > 0) {
            const currentTrack = queue[currentIndex];
            queue = [...originalQueue];
            currentIndex = queue.findIndex(t => t.videoId === currentTrack.videoId);
            if (currentIndex === -1) currentIndex = 0;
        }
    }
    savePlayerState();
    updateQueueUI();
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    repeatBtn.blur(); // Fix sticky focus on mobile
    updateRepeatUI();
    savePlayerState();
}

function updateRepeatUI() {
    if (!repeatBtn) return;
    if (repeatMode === 0) {
        repeatBtn.className = 'text-gray-400 md:hover:text-white transition-colors p-1 md:p-2';
        repeatBtn.innerHTML = `<svg class="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    } else if (repeatMode === 1) { // Repeat All
        repeatBtn.className = 'text-accent md:hover:text-green-300 transition-colors p-1 md:p-2';
        repeatBtn.innerHTML = `<svg class="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    } else if (repeatMode === 2) { // Repeat One
        repeatBtn.className = 'text-accent md:hover:text-green-300 transition-colors p-1 md:p-2 relative';
        repeatBtn.innerHTML = `<svg class="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
        <span class="absolute top-0.5 right-0.5 text-[8px] md:text-[10px] font-bold bg-black text-white rounded-full w-2.5 h-2.5 md:w-3 md:h-3 flex items-center justify-center">1</span>`;
    }
}

function updateProgress() {
    if (isDragging) return; // Don't fight drag
    const { duration, currentTime } = audioElement;

    // Update labels
    document.getElementById('currentTime').textContent = formatTime(currentTime);
    if (duration && !isNaN(duration) && isFinite(duration)) {
        document.getElementById('totalDuration').textContent = formatTime(duration);
        const percent = (currentTime / duration) * 100;
        progressBar.style.width = `${percent}%`;
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Low-level play function
async function playTrack(index) {
    if (index < 0 || index >= queue.length) return;

    const track = queue[index];
    const { videoId, title, artist, thumb } = track;

    // Update UI
    playerTitle.textContent = title;
    playerArtist.textContent = artist || 'Unknown Artist';
    playerArt.src = thumb || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100%25\' height=\'100%25\' viewBox=\'0 0 1 1\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%23333\'/%3E%3C/svg%3E';
    playerArt.classList.remove('opacity-50');

    // Sync Mobile Player UI
    if (mobilePlayerTitle) mobilePlayerTitle.textContent = title;
    if (mobilePlayerArtist) mobilePlayerArtist.textContent = artist || 'Unknown Artist';
    if (mobilePlayerArt) mobilePlayerArt.src = thumb || playerArt.src;

    updatePlayPauseIcon(false); // Show play (loading)
    audioElement.volume = 1.0; // Enforce max volume

    // Add to history
    addToHistory(videoId, title, artist, thumb);

    try {
        const response = await fetch(`/play/${videoId}`);
        if (!response.ok) throw new Error("Failed to get stream");

        const data = await response.json();

        if (data.url) {
            audioElement.src = data.url;
            // If we have a pending time (from restore), set it before playing
            if (audioElement.dataset.pendingTime) {
                audioElement.currentTime = parseFloat(audioElement.dataset.pendingTime);
                delete audioElement.dataset.pendingTime;
            }
            await audioElement.play();
            updatePlayPauseIcon(true);
            savePlayerState();
        } else {
            alert('Could not generate stream URL.');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            // console.log('Playback aborted (likely interrupted by new play request).');
            return;
        }
        console.error('Error fetching stream:', error);
        // alert("Failed to play song."); 
        // Auto skip error?
    }
}

// Queue Builders helpers

function playSingleSong(videoId, title, artist, thumb) {
    // Reset Queue to just this song
    queue = [{ videoId, title, artist, thumb }];
    originalQueue = [...queue]; // Reset shuffle base
    currentIndex = 0;
    isShuffle = false;
    // Reset controls
    shuffleBtn.classList.remove('text-accent');
    shuffleBtn.classList.add('text-gray-400');

    playTrack(0);
    updateQueueUI();

    // Fetch "Radio" / Autoplay tracks in background
    fetchRadioTracks(videoId);
}

async function fetchRadioTracks(videoId) {
    try {
        const response = await fetch(`/radio/${videoId}`);
        const data = await response.json();

        if (data && data.tracks && data.tracks.length > 0) {
            // Transform tracks to our format
            const newTracks = data.tracks.map(track => {
                // Skip if same as current
                if (track.videoId === videoId) return null;

                // Handle inconsistent keys (thumbnail vs thumbnails)
                const thumbs = track.thumbnails || track.thumbnail || [];

                return {
                    videoId: track.videoId,
                    title: track.title,
                    artist: track.artists ? track.artists.map(a => a.name).join(', ') : (track.byline || 'Unknown'),
                    thumb: getHighResArt(thumbs)
                };
            }).filter(t => t !== null);

            // Append to queue
            queue.push(...newTracks);
            originalQueue.push(...newTracks); // Sync

            // Update UI
            updateQueueUI();
            savePlayerState();
            // console.log(`Autoplay: Added ${newTracks.length} tracks.`);
        }
    } catch (e) {
        console.error("Autoplay fetch failed", e);
    }
}

function updateQueueUI() {
    // Basic implementation to debug and allow flow to continue
    // Future: implement actual UI rendering
    if (queue.length > 0) {
        // console.log(`[Queue] Updated. Length: ${queue.length}. Next: ${queue[1]?.title || 'None'}`);
    }

    // Attempt to update UI if element exists (future proofing)
    const queueContainer = document.getElementById('queueContainer');
    if (queueContainer) {
        queueContainer.innerHTML = '';
        queue.forEach((track, index) => {
            const div = document.createElement('div');
            div.className = `p-2 ${index === currentIndex ? 'text-accent font-bold' : 'text-gray-400'}`;
            div.textContent = `${index + 1}. ${track.title}`;
            div.onclick = () => playTrack(index);
            queueContainer.appendChild(div);
        });
    }
}

function playAlbumQueue(tracks, startVideoId, artUrl) {
    // Normalize tracks to queue format
    const newQueue = tracks.map(t => ({
        videoId: t.videoId,
        title: t.title,
        artist: t.artists ? t.artists.map(a => a.name).join(', ') : 'Unknown',
        thumb: artUrl // Use album art for all
    }));

    queue = newQueue;
    originalQueue = [...queue];

    // Find start index
    const startIndex = queue.findIndex(t => t.videoId === startVideoId);
    currentIndex = startIndex !== -1 ? startIndex : 0;

    // Logic: if shuffle was on, we should probably shuffle the new queue immediately?
    // User expectation: "Play Album" plays in order usually. 
    // "Shuffle Album" is usually a separate button.
    // If we click a track in album, it plays that track and queues rest in order.
    // So let's turn shuffle OFF for explicit track selection unless we implement "Shuffle Play" button.
    isShuffle = false;
    shuffleBtn.classList.remove('text-accent');
    shuffleBtn.classList.add('text-gray-400');

    playTrack(currentIndex);
    savePlayerState();
}


// --- Updated Helpers ---

function setupNavigation() {
    navHome.addEventListener('click', (e) => {
        e.preventDefault();
        showHome();
    });

    navSearch.addEventListener('click', (e) => {
        e.preventDefault();
        showResults();
        searchInput.focus();
    });

    navLibrary.addEventListener('click', (e) => {
        e.preventDefault();
        showLibrary();
        loadLibrary();
    });
}

function setupAlbumView() {
    backFromAlbum.addEventListener('click', () => {
        if (resultsGrid.children.length > 0) {
            showResults();
        } else {
            showHome();
        }
    });
}

function setActiveNav(activeElement) {
    [navHome, navSearch, navLibrary].forEach(el => {
        el.className = 'nav-item flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 transition-colors text-gray-400 hover:text-white';
    });
    activeElement.className = 'nav-item flex items-center gap-4 px-4 py-3 rounded-2xl bg-white/10 text-accent font-medium transition-all';
}

function setupFilters() {
    const trigger = document.getElementById('dropdownTrigger');
    const menu = document.getElementById('dropdownMenu');
    const items = document.querySelectorAll('.dropdown-item');
    const label = document.getElementById('currentFilterLabel');
    const hiddenInput = document.getElementById('searchFilter');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('hidden');
    });

    items.forEach(item => {
        item.addEventListener('click', () => {
            const value = item.dataset.value;
            const text = item.textContent;
            label.textContent = text;
            hiddenInput.value = value;
            items.forEach(i => i.classList.remove('text-accent', 'font-bold'));
            item.classList.add('text-accent', 'font-bold');
            menu.classList.add('hidden');
            if (searchInput.value.trim()) performSearch();
        });
    });

    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });
}

// --- Search Logic ---
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

const liveSearchResults = document.getElementById('liveSearchResults');
let searchDebounce;
let searchTimeout; // Added for main search debounce

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const query = e.target.value.trim();

    // Clear search if empty
    if (!query) {
        liveSearchResults.classList.add('hidden');
        resultsView.classList.add('hidden'); // Assuming resultsView exists
        homeView.classList.remove('hidden'); // Assuming homeView exists
        return;
    }

    // Debounce live search
    searchDebounce = setTimeout(() => {
        performLiveSearch(query);
    }, 300);

    // Debounce actual search (for when user stops typing and we want to show full results)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch(query);
    }, 500); // Wait 500ms
});

// Quick Search Handler
window.quickSearch = (term) => {
    // Context-Aware Search
    // Since buttons are next to Language Dropdown, we use the selected language.
    const lang = languageSelect ? languageSelect.value : '';

    let query = '';
    if (lang) {
        query = `${term} ${lang} Songs`; // "Latest Telugu Songs"
    } else {
        // Fallback if no language selected (unexpected but safe)
        query = `${term} Songs`;
    }

    // Update Input
    searchInput.value = query;

    // Trigger Search
    performSearch(query);
};

function hideLiveResults() {
    setTimeout(() => {
        liveSearchResults.classList.add('hidden');
    }, 200);
}

// Hide live search on click outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !liveSearchResults.contains(e.target)) {
        liveSearchResults.classList.add('hidden');
    }
});

searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim() && liveSearchResults.children.length > 0) {
        liveSearchResults.classList.remove('hidden');
    }
});

async function performLiveSearch(query) {
    const filter = searchFilter.value; // Respect current filter? Or just search songs?
    // Let's perform a broad search or current filter
    const url = `/search?query=${encodeURIComponent(query)}&filter=${filter || 'songs'}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        renderLiveResults(data);
    } catch (error) {
        console.error('Error live searching:', error);
    }
}

function renderLiveResults(results) {
    liveSearchResults.innerHTML = '';

    if (!results || results.length === 0) {
        liveSearchResults.classList.add('hidden');
        return;
    }

    // Limit to 5-8 results
    const limitedResults = results.slice(0, 8);

    limitedResults.forEach(item => {
        const div = document.createElement('div');
        div.className = 'px-4 py-3 hover:bg-white/10 cursor-pointer text-sm text-gray-300 hover:text-white transition-colors border-b border-white/5 last:border-0 flex items-center gap-3';

        let subtitle = '';
        if (item.artists) subtitle = item.artists.map(a => a.name).join(', ');
        else if (item.artist) subtitle = item.artist;

        // Icon based on type
        let icon = '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 10l12-3"></path></svg>'; // Note
        if (item.resultType === 'video') icon = '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
        if (item.resultType === 'album') icon = '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 10l12-3"></path></svg>'; // Disc icon replacement

        div.innerHTML = `
            ${icon}
            <div class="flex-1 truncate">
                <span class="font-medium text-white">${item.title}</span>
                <span class="text-xs text-gray-500 ml-2">${subtitle}</span>
            </div>
        `;

        div.onclick = () => {
            if (item.resultType === 'song' || item.resultType === 'video') {
                const thumb = item.thumbnails ? item.thumbnails[item.thumbnails.length - 1].url : '';
                playSingleSong(item.videoId, item.title, subtitle, thumb);
            } else if (item.resultType === 'album') {
                loadAlbum(item.browseId);
            }
            liveSearchResults.classList.add('hidden');
            searchInput.value = ''; // Clear search on selection? Or keep?
        };

        liveSearchResults.appendChild(div);
    });

    liveSearchResults.classList.remove('hidden');
}

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        showHome();
        return;
    }
    showLoading();
    const filter = searchFilter.value;
    const url = `/search?query=${encodeURIComponent(query)}${filter ? `&filter=${filter}` : ''}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        renderResults(data);
    } catch (error) {
        console.error('Error searching:', error);
        alert('Failed to fetch results');
        showHome();
    }
}

function renderResults(results) {
    resultsGrid.innerHTML = '';
    if (!results || results.length === 0) {
        resultsGrid.innerHTML = '<p class="col-span-full text-center text-gray-500">No results found.</p>';
        showResults();
        return;
    }

    results.forEach(item => {
        const type = item.resultType;
        const title = item.title;
        const thumbnails = item.thumbnails || [];
        const thumbUrl = getHighResArt(thumbnails);

        let subtitle = '';
        if (item.artists) {
            subtitle = item.artists.map(a => a.name).join(', ');
        } else if (item.artist) {
            subtitle = item.artist;
        } else if (item.year) {
            subtitle = item.year;
        }

        const card = createCard(title, subtitle, thumbUrl, () => {
            if (type === 'song' || type === 'video') {
                playSingleSong(item.videoId, title, subtitle, thumbUrl); // USE NEW FUNCTION
            } else if (type === 'album') {
                loadAlbum(item.browseId);
            }
        }, false, item.videoId || item.browseId);

        resultsGrid.appendChild(card);
    });
    showResults();
}

// --- Home Page Logic ---



// --- Library / Favorites Logic ---

function loadLibrary() {
    const favorites = JSON.parse(localStorage.getItem('musicFavorites') || '[]');
    let libraryGrid = document.getElementById('libraryGrid');

    if (!libraryGrid) {
        libraryView.innerHTML = `
            <h2 class="text-xl font-bold text-white mb-4 flex items-center">
                <span class="w-1 h-6 bg-accent rounded-full mr-3"></span>
                Your Library
            </h2>
            <div id="libraryGrid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"></div>
        `;
        libraryGrid = document.getElementById('libraryGrid');
    }

    // Cleanup: Remove any favorites with invalid IDs to prevent "default" love icons
    const filteredFavs = favorites.filter(item => item.id && item.id !== 'undefined' && item.id !== 'null');
    if (filteredFavs.length !== favorites.length) {
        localStorage.setItem('musicFavorites', JSON.stringify(filteredFavs));
        favorites = filteredFavs;
    }

    const songs = favorites.filter(item => !item.isAlbum);

    if (songs.length === 0) {
        libraryView.innerHTML = `
            <h2 class="text-xl font-bold text-white mb-4 flex items-center">
                <span class="w-1 h-6 bg-accent rounded-full mr-3"></span>
                Your Library
            </h2>
            <div class="p-12 text-center text-gray-500 bg-white/5 rounded-3xl mx-auto max-w-lg border border-white/5">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                </svg>
                <h3 class="text-lg font-bold text-gray-300">Your Library is Empty</h3>
                <p class="text-sm mt-2">Love songs to save them here.</p>
                <button class="mt-6 px-6 py-2 bg-accent text-black font-bold rounded-full md:hover:bg-green-400 transition-colors" onclick="document.getElementById('navSearch').click()">Start Searching</button>
            </div>
        `;
        return;
    }

    // Sort Alphabetically
    favorites.sort((a, b) => a.title.localeCompare(b.title));

    libraryGrid.innerHTML = '';
    songs.forEach(item => {
        const card = createCard(item.title, item.artist, item.thumb, () => {
            playSingleSong(item.id, item.title, item.artist, item.thumb);
        }, false, item.id);
        libraryGrid.appendChild(card);
    });
}

function syncHeartIcons(id, isFav) {
    if (!id) return;
    const buttons = document.querySelectorAll(`button[data-id="${id}"]`);
    buttons.forEach(btn => updateHeartIcon(btn, isFav));
}

function addToFavorites(id, title, artist, thumb, skipRefresh = false) {
    if (!id || id === 'undefined' || id === 'null') return;
    const favorites = JSON.parse(localStorage.getItem('musicFavorites') || '[]');
    if (!favorites.some(item => item.id === id)) {
        const isAlbum = id && id.startsWith('MPREb_');
        favorites.unshift({ id, title, artist, thumb, isAlbum });
        localStorage.setItem('musicFavorites', JSON.stringify(favorites));
        syncHeartIcons(id, true);

        // Re-check current album completeness if a song was added
        if (currentAlbumState && currentAlbumState.id.startsWith('MPREb_')) {
            updateAlbumFavoriteStatus(currentAlbumState.id, currentAlbumState.tracks, currentAlbumState.title, currentAlbumState.artist, currentAlbumState.thumb);
        }

        if (!skipRefresh && !libraryView.classList.contains('hidden')) loadLibrary();
    }
}

function removeFromFavorites(id, skipRefresh = false) {
    if (!id) return;
    let favorites = JSON.parse(localStorage.getItem('musicFavorites') || '[]');
    favorites = favorites.filter(item => item.id !== id);
    localStorage.setItem('musicFavorites', JSON.stringify(favorites));
    syncHeartIcons(id, false);

    // Re-check current album completeness if a song was removed
    if (currentAlbumState && currentAlbumState.id.startsWith('MPREb_')) {
        updateAlbumFavoriteStatus(currentAlbumState.id, currentAlbumState.tracks, currentAlbumState.title, currentAlbumState.artist, currentAlbumState.thumb);
    }

    if (!skipRefresh && !libraryView.classList.contains('hidden')) loadLibrary();
}

function isFavorite(id) {
    const favorites = JSON.parse(localStorage.getItem('musicFavorites') || '[]');
    return favorites.some(item => item.id === id);
}

async function toggleFavorite(id, title, artist, thumb, btn) {
    const isAlbum = id && id.startsWith('MPREb_');

    if (isAlbum) {
        // ALBUM TOGGLE LOGIC
        const isCurrentlyFav = isFavorite(id);

        if (isCurrentlyFav) {
            // BULK REMOVE: Remove album and all its songs
            removeFromFavorites(id, true);

            // Use current tracks if we have them, otherwise fetch
            let tracks = currentAlbumState && currentAlbumState.id === id ? currentAlbumState.tracks : null;
            if (!tracks) {
                try {
                    const response = await fetch(`/album/${id}`);
                    const data = await response.json();
                    tracks = data.tracks;
                } catch (e) { console.error("Bulk remove fetch failed", e); }
            }

            if (tracks) {
                tracks.forEach(track => {
                    removeFromFavorites(track.videoId, true);
                });
            }
            if (!libraryView.classList.contains('hidden')) loadLibrary();
        } else {
            // BULK ADD: Add album and all its songs
            try {
                btn.classList.add('animate-pulse');

                // Use current tracks if available
                let tracks = currentAlbumState && currentAlbumState.id === id ? currentAlbumState.tracks : null;
                if (!tracks) {
                    const response = await fetch(`/album/${id}`);
                    const data = await response.json();
                    tracks = data.tracks;
                }

                if (tracks) {
                    tracks.forEach(track => {
                        const trackArtist = track.artists ? track.artists.map(a => a.name).join(', ') : artist;
                        addToFavorites(track.videoId, track.title, trackArtist, thumb, true);
                    });
                    addToFavorites(id, title, artist, thumb, false);
                }
                btn.classList.remove('animate-pulse');
            } catch (e) {
                console.error("Bulk add failed", e);
                btn.classList.remove('animate-pulse');
            }
        }
    } else {
        // INDIVIDUAL SONG TOGGLE
        if (isFavorite(id)) {
            removeFromFavorites(id);
        } else {
            addToFavorites(id, title, artist, thumb);
        }
    }
}

function updateAlbumFavoriteStatus(albumId, tracks, title, artist, thumb) {
    if (!albumId || !tracks || tracks.length === 0) return;

    const allSongsFavorited = tracks.every(track => isFavorite(track.videoId));
    const albumWasFavorited = isFavorite(albumId);

    if (allSongsFavorited && !albumWasFavorited) {
        // All songs are now in library -> mark album as loved
        addToFavorites(albumId, title, artist, thumb, true);
    } else if (!allSongsFavorited && albumWasFavorited) {
        // One or more songs removed -> unmark album as loved
        removeFromFavorites(albumId);
    }
}

function updateHeartIcon(btn, isFav) {
    const iconSize = "w-4 h-4 md:w-5 md:h-5"; // Consistent responsive sizing
    if (isFav) {
        btn.innerHTML = `<svg class="${iconSize} text-accent fill-accent" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
    } else {
        btn.innerHTML = `<svg class="${iconSize} text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>`;
    }
}

function loadRecentlyPlayed() {
    const history = JSON.parse(localStorage.getItem('musicHistory') || '[]');
    if (history.length > 0) {
        recentSection.classList.remove('hidden');
        recentGrid.innerHTML = '';
        history.forEach(item => {
            const card = createCard(item.title, item.artist, item.thumb, () => {
                playSingleSong(item.id, item.title, item.artist, item.thumb);
            }, true, item.id);
            recentGrid.appendChild(card);
        });
    }
}

function addToHistory(id, title, artist, thumb) {
    let history = JSON.parse(localStorage.getItem('musicHistory') || '[]');
    history = history.filter(item => item.id !== id);
    history.unshift({ id, title, artist, thumb });
    if (history.length > 20) history.pop();
    localStorage.setItem('musicHistory', JSON.stringify(history));
    loadRecentlyPlayed();
}

// --- Language Section Logic ---
// Variables moved to top

const langDropdownTrigger = document.getElementById('langDropdownTrigger');
const langDropdownMenu = document.getElementById('langDropdownMenu');
const currentLangLabel = document.getElementById('currentLangLabel');
// languageSelect is already defined at top
// New Album Grid
const languageAlbumsGrid = document.getElementById('languageAlbumsGrid');

if (langDropdownTrigger && langDropdownMenu) {
    // Toggle
    langDropdownTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdownMenu.classList.toggle('hidden');
    });

    // Selection
    document.querySelectorAll('.lang-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = item.getAttribute('data-value');

            // Update UI
            currentLangLabel.textContent = val;
            languageSelect.value = val;
            localStorage.setItem('userLanguage', val);

            // Close logic
            langDropdownMenu.classList.add('hidden');

            // Load content
            loadLanguageContent(val);
            loadLanguageAlbums(val);
        });
    });

    // Click outside
    document.addEventListener('click', (e) => {
        if (!langDropdownTrigger.contains(e.target) && !langDropdownMenu.contains(e.target)) {
            langDropdownMenu.classList.add('hidden');
        }
    });
}

// Filter Language Content (Buttons Handler)
window.filterLanguageContent = (term, btnElement) => {
    const lang = languageSelect ? languageSelect.value : 'Telugu';
    console.log(`Filtering Language Content: ${lang} -> Term: ${term}`);

    // Handle Active State
    if (btnElement) {
        // Reset all buttons in the same container
        const container = btnElement.parentElement;
        const buttons = container.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.className = "px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-medium text-gray-300 transition-colors whitespace-nowrap";
        });

        // Set Active State for clicked button
        btnElement.className = "px-3 py-1 rounded-full bg-accent text-black border border-accent text-[10px] font-bold shadow-[0_0_4px_rgba(74,222,128,0.25)] transition-all whitespace-nowrap";
    }

    // Update both sections with the specific term
    loadLanguageContent(lang, term);
    loadLanguageAlbums(lang, term);
};

// Removed window.quickSearch as it's no longer needed for this specific feature

async function loadLanguageContent(lang, specificTerm = null) {
    if (!languageGrid) return;
    languageGrid.innerHTML = '<div class="text-gray-500 text-sm pl-1">Loading...</div>';

    let query = '';

    if (specificTerm) {
        // Specific Button Clicked (e.g., "Latest" -> "Latest Telugu Songs")
        query = `${specificTerm} ${lang} Songs`;
    } else {
        // Randomize Queries on Load/Lang Change
        const patterns = [
            `Top ${lang} Tracks`,
            `Trending ${lang} Songs`,
            `New ${lang} Releases`,
            `${lang} Chartbusters`,
            `${lang} Evergreen Hits`,
            `${lang} Romantic Songs`,
            `${lang} Sad Songs`,
            `${lang} Dance Hits`,
            `${lang} Viral Songs`,
            `${lang} Classical Music`,
            `${lang} Devotional Songs`,
            `${lang} Acoustic Songs`,
            `${lang} Remix Hits`,
            `${lang} Mashup Collection`,
            `${lang} Old Classics`,
            `${lang} Golden Hits`,
            `${lang} Indie Songs`,
            `${lang} Rap Songs`,
            `${lang} Rock Hits`,
            `${lang} Instrumental Music`,
            `${lang} Wedding Songs`,
            `${lang} Road Trip Songs`,
            `${lang} Chill Vibes`,
            `${lang} Workout Playlist`,
            `${lang} Lofi Beats`,
            `${lang} Festival Special`,
            `${lang} Rainy Day Songs`,
            `${lang} Motivational Songs`,
            `${lang} Retro Collection`,
            `${lang} Top 50 Songs`,
            `Best ${lang} Albums`,
            `${lang} Superhits`,
            `${lang} DJ Mix`,
            `${lang} Party Anthems`,
            `${lang} Soulful Songs`,
            `${lang} Latest Music 2024`,
            `${lang} Throwback Hits`,
            `${lang} Billboard Hits`,
            `${lang} Award Winning Songs`,
            `${lang} Weekend Playlist`
        ];
        query = patterns[Math.floor(Math.random() * patterns.length)];
    }

    const url = `/search?query=${encodeURIComponent(query)}&filter=songs`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        renderLanguageGrid(data);
    } catch (e) {
        console.error("Language fetch failed", e);
        languageGrid.innerHTML = '<div class="text-red-500 text-sm pl-1">Failed to load content</div>';
    }
}

async function loadLanguageAlbums(lang, specificTerm = null) {
    if (!languageAlbumsGrid) return;
    languageAlbumsGrid.innerHTML = '<div class="text-gray-500 text-sm pl-1">Loading...</div>';

    let query = '';

    if (specificTerm) {
        // Specific Button Clicked (e.g., "Latest" -> "Latest Telugu Albums")
        query = `${specificTerm} ${lang} Albums`;
    } else {
        // Randomize Queries for Albums
        const patterns = [
            `Top ${lang} Albums`,
            `${lang} Movie Albums`,
            `Best ${lang} Movie Soundtracks`,
            `${lang} Hit Albums 2024`,
            `${lang} Classic Albums`,
            `${lang} Love Songs Albums`,
            `${lang} Folk Albums`,
            `${lang} Devotional Albums`,
            `${lang} Instrumental Albums`,
            `${lang} Indie Albums`,
            `${lang} Remix Albums`,
            `${lang} DJ Albums`,
            `${lang} Party Albums`,
            `${lang} Sad Songs Albums`,
            `${lang} Romantic Albums`,
            `${lang} Old Movie Albums`,
            `${lang} New Movie Releases`,
            `${lang} Web Series Soundtracks`,
            `${lang} Composer Specials`,
            `${lang} Actor Specials`,
            `${lang} Superhit Albums`,
            `${lang} Evergreen Albums`,
            `${lang} Golden Era Albums`,
            `${lang} Retro Movie Albums`,
            `${lang} Blockbuster Soundtracks`,
            `${lang} Chartbuster Albums`,
            `${lang} Award Winning Albums`,
            `${lang} Top Rated Albums`,
            `${lang} Trending Albums`,
            `${lang} Latest Albums 2024`,
            `${lang} 90s Hit Albums`,
            `${lang} 2000s Hit Albums`,
            `${lang} Festival Special Albums`,
            `${lang} Wedding Special Albums`,
            `${lang} Dance Albums`,
            `${lang} Chillout Albums`,
            `${lang} Acoustic Albums`,
            `${lang} Live Concert Albums`,
            `${lang} Background Score Albums`,
            `${lang} OST Collections`,
            `${lang} Anthology Albums`,
            `${lang} Compilation Albums`,
            `${lang} Tribute Albums`,
            `${lang} Director Specials`,
            `${lang} Singer Specials`,
            `${lang} Duet Albums`,
            `${lang} Rap Albums`,
            `${lang} Rock Albums`,
            `${lang} Classical Albums`,
            `${lang} Spiritual Albums`,
            `${lang} Lofi Albums`,
            `${lang} Mashup Albums`,
            `${lang} Theme Based Albums`,
            `${lang} Limited Edition Albums`,
            `${lang} Platinum Albums`,
            `${lang} Gold Albums`
        ];
        query = patterns[Math.floor(Math.random() * patterns.length)];
    }

    const url = `/search?query=${encodeURIComponent(query)}&filter=albums`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        renderLanguageAlbums(data);
    } catch (e) {
        console.error("Language Albums fetch failed", e);
        languageAlbumsGrid.innerHTML = '<div class="text-red-500 text-sm pl-1">Failed to load albums</div>';
    }
}

function renderLanguageGrid(results) {
    languageGrid.innerHTML = '';
    if (!results || results.length === 0) {
        languageGrid.innerHTML = '<div class="text-gray-500 text-sm pl-1">No results found</div>';
        return;
    }

    results.forEach(item => {
        const thumbnails = item.thumbnails || [];
        const thumbUrl = getHighResArt(thumbnails);

        let subtitle = '';
        if (item.artists) subtitle = item.artists.map(a => a.name).join(', ');
        else if (item.artist) subtitle = item.artist;

        const card = createCard(item.title, subtitle, thumbUrl, () => {
            playSingleSong(item.videoId, item.title, subtitle, thumbUrl);
        }, true, item.videoId);

        languageGrid.appendChild(card);
    });
}

function renderLanguageAlbums(results) {
    languageAlbumsGrid.innerHTML = '';
    if (!results || results.length === 0) {
        languageAlbumsGrid.innerHTML = '<div class="text-gray-500 text-sm pl-1">No albums found</div>';
        return;
    }

    results.forEach(item => {
        const thumbnails = item.thumbnails || [];
        const thumbUrl = getHighResArt(thumbnails);

        let subtitle = 'Album';
        if (item.year) subtitle = item.year;
        else if (item.artist) subtitle = item.artist; // Fallback

        const card = createCard(item.title, subtitle, thumbUrl, () => {
            loadAlbum(item.browseId);
        }, true, item.browseId); // Pass browseId for heart icon

        languageAlbumsGrid.appendChild(card);
    });
}

// --- Album Logic ---

async function loadAlbum(albumId) {
    showLoading();
    try {
        const response = await fetch(`/album/${albumId}`);
        const data = await response.json();

        albumTitle.textContent = data.title;
        albumArtist.textContent = data.artists ? data.artists.map(a => a.name).join(', ') : 'Unknown Artist';
        albumYear.textContent = `${data.year || ''} • Album`;

        const thumbnails = data.thumbnails || [];
        const artUrl = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100%25\' height=\'100%25\' viewBox=\'0 0 1 1\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%23333\'/%3E%3C/svg%3E';
        albumArt.src = artUrl;

        // Set state for smart sync
        currentAlbumState = {
            id: albumId,
            tracks: data.tracks,
            title: data.title,
            artist: albumArtist.textContent,
            thumb: artUrl
        };

        albumTracks.innerHTML = '';
        if (data.tracks) {
            data.tracks.forEach((track, index) => {
                const tr = document.createElement('tr');
                tr.className = 'md:hover:bg-white/5 transition-colors cursor-pointer group';

                tr.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    // Play this track and queue the rest
                    playAlbumQueue(data.tracks, track.videoId, artUrl);
                };

                const isFav = isFavorite(track.videoId);
                const heartClass = isFav ? 'text-accent fill-accent' : 'text-gray-500 hover:text-white';
                const heartPath = isFav
                    ? 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
                    : 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z';
                const heartFill = isFav ? 'currentColor' : 'none';
                const heartStroke = isFav ? 'none' : 'currentColor';

                const albumCtx = {
                    id: albumId,
                    tracks: data.tracks,
                    title: data.title,
                    artist: albumArtist.textContent,
                    thumb: artUrl
                };

                tr.innerHTML = `
                    <td class="p-4 text-center text-gray-400 md:group-hover:text-accent">${index + 1}</td>
                    <td class="p-4">
                        <div class="font-medium text-white">${track.title}</div>
                        <div class="text-xs text-gray-400">${track.artists ? track.artists.map(a => a.name).join(', ') : ''}</div>
                    </td>
                    <td class="p-4 text-right">
                         <button data-id="${track.videoId}" class="mr-4 p-2 rounded-full md:hover:bg-white/10 transition-colors" 
                            onclick="toggleFavorite('${track.videoId}', '${track.title.replace(/'/g, "\\'")}', '${track.artists[0].name.replace(/'/g, "\\'")}', '${artUrl.replace(/'/g, "\\'")}', this)">
                            <svg class="w-5 h-5 ${heartClass}" fill="${heartFill}" stroke="${heartStroke}" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${heartPath}"></path>
                            </svg>
                         </button>
                         <span class="text-sm text-gray-500">${track.duration || ''}</span>
                    </td>
                `;
                albumTracks.appendChild(tr);
            });

            // Queue whole album starting at 0
            playAlbumBtn.onclick = () => {
                if (data.tracks.length > 0) {
                    playAlbumQueue(data.tracks, data.tracks[0].videoId, artUrl);
                }
            };

            // Batch Add All Songs to Library
            if (addAllToLibraryBtn) {
                // Initialize based on current favorite status
                addAllToLibraryBtn.dataset.id = albumId;
                updateHeartIcon(addAllToLibraryBtn, isFavorite(albumId));

                addAllToLibraryBtn.onclick = () => {
                    const artistStr = data.artists ? data.artists.map(a => a.name).join(', ') : 'Unknown Artist';
                    toggleFavorite(albumId, data.title, artistStr, artUrl, addAllToLibraryBtn);
                };
            }
        }
        showAlbum();
    } catch (error) {
        console.error('Error loading album:', error);
        alert('Failed to load album details');
        showResults();
    }
}

// --- Helper Functions ---

function getHighResArt(thumbnails) {
    // function getHighResArt(thumbnails) {
    //    if (!thumbnails || thumbnails.length === 0) return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMzMzMiLz48L3N2Zz4=';
    //    let url = thumbnails[thumbnails.length - 1].url;
    //    // Force high res if possible
    //    if (url.includes('=w')) return url.replace(/=w\d+-h\d+/, '=w544-h544');
    //    if (url.includes('=s')) return url.replace(/=s\d+/, '=s544');
    //    return url;
    // }
    if (!thumbnails || thumbnails.length === 0) return 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100%25\' height=\'100%25\' viewBox=\'0 0 1 1\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%23333\'/%3E%3C/svg%3E';
    let url = thumbnails[thumbnails.length - 1].url;
    // Force high res if possible
    if (url.includes('=w')) return url.replace(/=w\d+-h\d+/, '=w544-h544');
    if (url.includes('=s')) return url.replace(/=s\d+/, '=s544');
    return url;
}

function createCard(title, subtitle, thumbUrl, onClick, isHorizontal = false, id = null) {
    const card = document.createElement('div');
    // Base classes
    const baseClasses = "group relative cursor-pointer transition-all duration-300";

    if (isHorizontal) {
        // "Recently Played" style
        // Exact calc to match grid-cols-X with gap-4 (1rem)
        // 3 cols: (100% - 2rem) / 3
        // 4 cols: (100% - 3rem) / 4
        // 5 cols: (100% - 4rem) / 5
        // 6 cols: (100% - 5rem) / 6
        card.className = `${baseClasses} flex flex-col shrink-0 w-[calc((100%-2rem)/3)] md:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-4rem)/5)] xl:w-[calc((100%-5rem)/6)]`;
        card.innerHTML = `
             <div class="relative w-full aspect-square mb-1 rounded-2xl overflow-hidden shadow-lg border border-white/5 md:group-hover:shadow-[0_8px_20px_rgba(74,222,128,0.2)] transition-shadow">
                <img src="${thumbUrl}" alt="${title}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500">
                <div class="absolute inset-0 opacity-0 md:group-hover:opacity-100 flex items-center justify-center transition-all">
                    <div class="w-12 h-12 rounded-full bg-accent flex items-center justify-center shadow-[0_0_15px_rgba(74,222,128,0.8)] opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                         <svg class="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            </div>
            <div class="text-left px-1 pb-2"> 
                 <h3 class="font-bold text-gray-100 text-sm truncate leading-tight" title="${title}">${title}</h3>
                 <p class="text-xs text-gray-400 truncate mt-0.5">${subtitle}</p>
            </div>
        `;
    } else {
        // "Search Results" style - Cleaner, no background box, just image + text
        card.className = `${baseClasses} w-full flex flex-col shrink-0`;
        card.innerHTML = `
            <div class="relative w-full aspect-square mb-1 rounded-2xl overflow-hidden shadow-lg border border-white/5 group-hover:shadow-[0_8px_20px_rgba(74,222,128,0.2)] transition-shadow">
                <img src="${thumbUrl}" alt="${title}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500">
                 <div class="absolute inset-0 opacity-0 md:group-hover:opacity-100 flex items-center justify-center transition-all">
                    <div class="w-12 h-12 rounded-full bg-accent flex items-center justify-center shadow-[0_0_15px_rgba(74,222,128,0.8)] opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                         <svg class="w-6 h-6 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            </div>
            <div class="text-left px-1 pb-2"> 
                 <h3 class="font-bold text-gray-100 text-sm truncate leading-tight" title="${title}">${title}</h3>
                 <p class="text-xs text-gray-400 truncate mt-0.5">${subtitle}</p>
            </div>
        `;
    }

    card.onclick = onClick;

    if (id) {
        const loveBtn = document.createElement('button');
        loveBtn.dataset.id = id;
        // Pushed slightly in from corner for better bounds
        loveBtn.className = 'absolute top-1 right-1 p-1.5 md:p-2 rounded-full bg-black/50 md:hover:bg-black/70 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all z-20 shadow-md';

        updateHeartIcon(loveBtn, isFavorite(id));

        loveBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(id, title, subtitle, thumbUrl, loveBtn);
        };

        const imgContainer = card.querySelector('.relative'); // Inject into the image container for cleaner look
        if (imgContainer) imgContainer.appendChild(loveBtn);
    }

    return card;
}


// Navigation Elements
// Navigation Elements - Already declared at top
// const navHome = document.getElementById('navHome');
// const navSearch = document.getElementById('navSearch');
// const navLibrary = document.getElementById('navLibrary');
// Mobile Nav Elements
const mobileNavHome = document.getElementById('mobileNavHome');
const mobileNavSearch = document.getElementById('mobileNavSearch');
const mobileNavLibrary = document.getElementById('mobileNavLibrary');

function setActiveNav(activeElement) {
    // Reset Desktop Sidebar
    [navHome, navSearch, navLibrary].forEach(el => {
        if (el) el.className = 'nav-item flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 transition-colors text-gray-400 hover:text-white';
    });
    // Reset Mobile Nav - remove active state
    [mobileNavHome, mobileNavSearch, mobileNavLibrary].forEach(el => {
        if (el) {
            el.classList.remove('text-accent');
            el.classList.add('text-gray-400');
            // Hide pill background
            const pill = el.querySelector('div');
            if (pill) {
                pill.classList.remove('scale-100');
                pill.classList.add('scale-0');
            }
        }
    });

    // Determine equivalent active elements
    let desktopActive, mobileActive;

    if (activeElement === navHome || activeElement === mobileNavHome) {
        desktopActive = navHome;
        mobileActive = mobileNavHome;
    } else if (activeElement === navSearch || activeElement === mobileNavSearch) {
        desktopActive = navSearch;
        mobileActive = mobileNavSearch;
    } else if (activeElement === navLibrary || activeElement === mobileNavLibrary) {
        desktopActive = navLibrary;
        mobileActive = mobileNavLibrary;
    }

    // Set Active States
    if (desktopActive) desktopActive.className = 'nav-item flex items-center gap-4 px-4 py-3 rounded-2xl bg-white/10 text-accent font-medium transition-all';
    if (mobileActive) {
        mobileActive.classList.remove('text-gray-400');
        mobileActive.classList.add('text-accent');
        // Show pill background
        const pill = mobileActive.querySelector('div');
        if (pill) {
            pill.classList.remove('scale-0');
            pill.classList.add('scale-100');
        }
    }
}

function showHome() {
    homeView.classList.remove('hidden');
    resultsView.classList.add('hidden');
    libraryView.classList.add('hidden');
    albumView.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
    setActiveNav(navHome);
    // document.getElementById('mainContainer').scrollTop = 0;
}

function showResults() {
    homeView.classList.add('hidden');
    resultsView.classList.remove('hidden');
    libraryView.classList.add('hidden');
    albumView.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
    setActiveNav(navSearch);
}

function showLibrary() {
    homeView.classList.add('hidden');
    resultsView.classList.add('hidden');
    libraryView.classList.remove('hidden');
    albumView.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
    setActiveNav(navLibrary);
    loadLibrary(); // Refreshes content every time view is shown
}

function showAlbum() {
    homeView.classList.add('hidden');
    resultsView.classList.add('hidden');
    libraryView.classList.add('hidden');
    albumView.classList.remove('hidden');
    loadingSpinner.classList.add('hidden');
}

// Bind Events
// Bind Events - Handled in setupNavigation
// if (navHome) navHome.onclick = (e) => { e.preventDefault(); showHome(); };
// if (navSearch) navSearch.onclick = (e) => { e.preventDefault(); showResults(); };
// if (navLibrary) navLibrary.onclick = (e) => { e.preventDefault(); showLibrary(); };

if (mobileNavHome) mobileNavHome.onclick = (e) => { e.preventDefault(); showHome(); };
if (mobileNavSearch) mobileNavSearch.onclick = (e) => { e.preventDefault(); showResults(); };
if (mobileNavLibrary) mobileNavLibrary.onclick = (e) => { e.preventDefault(); showLibrary(); };

function showLoading() {
    homeView.classList.add('hidden');
    resultsView.classList.add('hidden');
    libraryView.classList.add('hidden');
    albumView.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');
}