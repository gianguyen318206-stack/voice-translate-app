document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const langA = document.getElementById('lang-a');
    const langB = document.getElementById('lang-b');
    const textA = document.getElementById('text-a');
    const textB = document.getElementById('text-b');
    const btnA = document.getElementById('btn-a');
    const btnB = document.getElementById('btn-b');
    const labelA = document.getElementById('label-a');
    const labelB = document.getElementById('label-b');
    const userHalf = document.querySelector('.user-half');
    const partnerHalf = document.querySelector('.partner-half');
    const statusIndicator = document.getElementById('status-indicator');
    const flipBtn = document.getElementById('flip-btn');
    const partnerArea = document.getElementById('partner-area');

    // UI Updates
    const updateLabels = () => {
        labelA.textContent = langA.options[langA.selectedIndex].text.split('(')[0].trim();
        labelB.textContent = langB.options[langB.selectedIndex].text.split('(')[0].trim();
    };
    langA.addEventListener('change', updateLabels);
    langB.addEventListener('change', updateLabels);
    updateLabels();

    flipBtn.addEventListener('click', () => partnerArea.classList.toggle('flipped'));

    function showStatus(message, isError = false) {
        statusIndicator.textContent = message;
        statusIndicator.style.color = isError ? '#ef4444' : '#4ade80';
        statusIndicator.style.borderColor = isError ? '#ef4444' : '#4ade80';
        statusIndicator.classList.add('show');
        if (!isError && message === 'Sẵn sàng') {
            setTimeout(() => statusIndicator.classList.remove('show'), 1000);
        }
    }

    // --- LỊCH SỬ HỘI THOẠI (CHAT LOG) ---
    const historyBtn = document.getElementById('history-btn');
    const historyOverlay = document.getElementById('history-overlay');
    const closeHistoryBtn = document.getElementById('close-history');
    const historyContent = document.getElementById('history-content');
    let conversationHistory = [];

    historyBtn.addEventListener('click', () => historyOverlay.classList.add('show'));
    closeHistoryBtn.addEventListener('click', () => historyOverlay.classList.remove('show'));

    function addHistory(srcText, srcLang, tgtText, tgtLang) {
        conversationHistory.push({ srcText, srcLang, tgtText, tgtLang });
        renderHistory();
    }

    function renderHistory() {
        if (conversationHistory.length === 0) return;
        historyContent.innerHTML = conversationHistory.map(item => `
            <div class="history-item">
                <div class="hist-source">
                    <span class="lang-tag">${item.srcLang}</span> ${item.srcText}
                </div>
                <div class="hist-target">
                    <span class="lang-tag">${item.tgtLang}</span> ${item.tgtText}
                </div>
            </div>
        `).reverse().join('');
    }

    // --- HIỆU ỨNG SÓNG ÂM THANH (WAVEFORM) ---
    const canvas = document.getElementById('waveform');
    const canvasCtx = canvas.getContext('2d');
    let audioCtx, analyser, source, drawVisual;
    let waveformStream = null;

    async function startWaveform(color) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (!waveformStream) {
            try {
                waveformStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                source = audioCtx.createMediaStreamSource(waveformStream);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
            } catch (err) {
                console.log("Audio Stream Error for Waveform:", err);
                return;
            }
        }
        
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function draw() {
            drawVisual = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            for(let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 3;
                canvasCtx.fillStyle = color;
                canvasCtx.fillRect(x, (canvas.height - barHeight) / 2, barWidth, barHeight);
                x += barWidth + 1;
            }
        }
        draw();
    }

    function stopWaveform() {
        if (drawVisual) cancelAnimationFrame(drawVisual);
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // --- API DỊCH VÀ ĐỌC ---
    const translateAPI = async (text, from, to) => {
        if (!text) return '';
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
            const res = await fetch(url);
            const data = await res.json();
            let translated = '';
            if (data && data[0]) {
                data[0].forEach(item => { if (item[0]) translated += item[0]; });
                return translated;
            }
            throw new Error("API Error");
        } catch (error) {
            return 'Lỗi dịch thuật';
        }
    };

    // =====================================================
    // CROSS-BROWSER AUDIO ENGINE
    // - iOS Safari: must call speak() inside user gesture
    //   → use "primer" technique to unlock audio channel
    // - Chrome (desktop/Android): works from async context
    //   → wait for voices to load, then speak normally
    // =====================================================

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // Voice management (Chrome Android loads voices async)
    let availableVoices = [];
    function loadVoices() {
        if ('speechSynthesis' in window) {
            availableVoices = window.speechSynthesis.getVoices();
        }
    }
    loadVoices();
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Wait until voice list is populated (needed on Chrome Android)
    function waitForVoices() {
        return new Promise(resolve => {
            loadVoices();
            if (availableVoices.length > 0) { resolve(); return; }
            const onChanged = () => { loadVoices(); resolve(); };
            window.speechSynthesis.addEventListener('voiceschanged', onChanged, { once: true });
            setTimeout(resolve, 1500); // fallback timeout
        });
    }

    // Prefer female voice for natural sound
    function findBestVoice(langFullCode) {
        if (!availableVoices.length) loadVoices();
        const short = langFullCode.split('-')[0];

        // Get all voices for this language
        const langVoices = availableVoices.filter(v =>
            v.lang === langFullCode || v.lang.startsWith(short)
        );
        if (langVoices.length === 0) return null;

        // Keywords for female voices (Vietnamese + general)
        const femaleHints = ['linh', 'an', 'mai', 'lan', 'huong', 'female',
                             'woman', 'girl', 'zira', 'hazel', 'samantha',
                             'susan', 'kate', 'fiona', 'heera', 'neerja'];
        const maleHints   = ['male', 'man', 'david', 'mark', 'daniel',
                             'nam', 'tung', 'hung', 'jorge', 'diego'];

        const femaleVoice = langVoices.find(v => {
            const name = v.name.toLowerCase();
            return femaleHints.some(h => name.includes(h)) &&
                  !maleHints.some(h => name.includes(h));
        });

        return femaleVoice || langVoices[0];
    }

    // Play via Google Translate TTS (better quality, natural female voice)
    function playGoogleTTS(text, langCode) {
        return new Promise((resolve, reject) => {
            // chunk at 200 chars
            const maxLen = 200;
            const chunks = [];
            let rem = text;
            while (rem.length > 0) {
                if (rem.length <= maxLen) { chunks.push(rem); break; }
                let cut = rem.lastIndexOf('.', maxLen);
                if (cut < maxLen / 2) cut = rem.lastIndexOf(' ', maxLen);
                if (cut < maxLen / 2) cut = maxLen;
                chunks.push(rem.substring(0, cut + 1));
                rem = rem.substring(cut + 1).trim();
            }
            let i = 0;
            function next() {
                if (i >= chunks.length) { showStatus('Sẵn sàng'); resolve(); return; }
                const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langCode}&q=${encodeURIComponent(chunks[i])}`;
                const audio = new Audio(url);
                audio.onended = () => { i++; next(); };
                audio.onerror = () => reject(new Error('Google TTS fail'));
                audio.play().catch(reject);
            }
            next();
        });
    }

    // Play via speechSynthesis (iOS + fallback)
    function doSpeakSynthesis(text, langFullCode) {
        if (!('speechSynthesis' in window)) { showStatus('Sẵn sàng'); return; }
        window.speechSynthesis.cancel();
        const delay = isIOS ? 200 : 0;
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang    = langFullCode;
            utterance.rate    = 0.95;
            utterance.pitch   = 1.1;  // slightly higher = more feminine
            utterance.volume  = 1.0;
            const voice = findBestVoice(langFullCode);
            if (voice) utterance.voice = voice;

            // Android Chrome 15s keep-alive
            const keepAlive = setInterval(() => {
                if (!window.speechSynthesis.speaking) clearInterval(keepAlive);
                else { window.speechSynthesis.pause(); window.speechSynthesis.resume(); }
            }, 10000);

            utterance.onend = () => { clearInterval(keepAlive); showStatus('Sẵn sàng'); };
            utterance.onerror = (e) => {
                clearInterval(keepAlive);
                if (e.error !== 'interrupted' && e.error !== 'canceled')
                    showStatus('Sẵn sàng');
            };
            window.speechSynthesis.speak(utterance);
        }, delay);
    }

    function playAudio(text, langFullCode) {
        if (!text) return;
        showStatus('Đang phát âm...');
        const langCode = langFullCode.split('-')[0];

        if (isIOS) {
            // iOS: audio channel primed in startListening() — use speechSynthesis
            // iOS has 'Linh' (female, vi-VN) built-in
            doSpeakSynthesis(text, langFullCode);
        } else {
            // Chrome/Android: Google TTS for Vietnamese (best quality + female voice)
            // speechSynthesis for all other languages
            waitForVoices().then(() => {
                if (langCode === 'vi') {
                    playGoogleTTS(text, langCode)
                        .catch(() => doSpeakSynthesis(text, langFullCode));
                } else {
                    doSpeakSynthesis(text, langFullCode);
                }
            });
        }
    }

    // iOS ONLY: unlock audio channel inside user gesture,
    // then call onDone() AFTER primer finishes so mic can start safely.
    // iOS cannot record mic AND play audio at the same time!
    function primeAudioForIOS(langFullCode, onDone) {
        if (!isIOS || !('speechSynthesis' in window)) {
            if (onDone) onDone();
            return;
        }
        window.speechSynthesis.cancel();
        const primer = new SpeechSynthesisUtterance('.');
        primer.volume = 0.01;
        primer.rate   = 10; // super fast ~100ms
        primer.lang   = langFullCode;
        const voice = findBestVoice(langFullCode);
        if (voice) primer.voice = voice;
        primer.onend  = () => { if (onDone) onDone(); };
        primer.onerror = () => { if (onDone) onDone(); }; // failsafe
        window.speechSynthesis.speak(primer);
    }

    // --- GHI ÂM (VOICE) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = SpeechRecognition ? new SpeechRecognition() : null;
    if (recognition) {
        recognition.continuous = false;
        recognition.interimResults = false;
    }

    let currentMode = null; 

    if (recognition) {
        recognition.onstart = () => {
            if (currentMode === 'A') {
                btnA.classList.add('active');
                textA.textContent = 'Đang nghe bạn nói...';
                startWaveform('#3b82f6');
            } else {
                btnB.classList.add('active');
                textB.textContent = 'Đang nghe đối tác...';
                startWaveform('#f43f5e');
            }
            showStatus('Đang thu âm...');
        };

        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            
            if (currentMode === 'A') {
                textA.textContent = transcript;
                textB.textContent = 'Đang dịch...';
                showStatus('Đang xử lý...');
                const translated = await translateAPI(transcript, langA.value, langB.value);
                textB.textContent = translated;
                
                addHistory(transcript, labelA.textContent, translated, labelB.textContent);
                playAudio(translated, langB.value);
            } else {
                textB.textContent = transcript;
                textA.textContent = 'Đang dịch...';
                showStatus('Đang xử lý...');
                const translated = await translateAPI(transcript, langB.value, langA.value);
                textA.textContent = translated;
                
                addHistory(transcript, labelB.textContent, translated, labelA.textContent);
                playAudio(translated, langA.value);
            }
        };

        recognition.onerror = (event) => {
            const errorMessages = {
                'no-speech':          'Không nghe thấy giọng nói, thử lại nhé!',
                'audio-capture':      'Không truy cập được micro',
                'not-allowed':        'Hãy cho phép truy cập micro trong cài đặt',
                'network':            'Lỗi mạng, kiểm tra kết nối internet',
                'aborted':            '',
                'service-not-allowed':'Trình duyệt không hỗ trợ thu âm'
            };
            const msg = errorMessages[event.error] || `Lỗi: ${event.error}`;
            if (msg) showStatus(msg, true);
            resetRecordingState();
        };
        recognition.onend = () => resetRecordingState();
    }

    function resetRecordingState() {
        btnA.classList.remove('active');
        btnB.classList.remove('active');
        stopWaveform();
    }

    const startListening = (mode) => {
        if (!recognition) {
            showStatus('Trình duyệt không hỗ trợ thu âm', true);
            return;
        }
        if (btnA.classList.contains('active') || btnB.classList.contains('active')) {
            recognition.stop();
            return;
        }
        currentMode = mode;
        recognition.lang = mode === 'A' ? langA.value : langB.value;

        if (isIOS) {
            // iOS FIX: prime audio FIRST (inside user gesture),
            // then start recognition AFTER primer finishes.
            // They CANNOT run at the same time (mic vs speaker conflict).
            const targetLang = mode === 'A' ? langB.value : langA.value;
            showStatus('Đang chuẩn bị...');
            primeAudioForIOS(targetLang, () => {
                try { recognition.start(); } catch(e) {}
            });
        } else {
            // Chrome/Android: no priming needed, start directly
            try { recognition.start(); } catch(e) {}
        }
    };

    btnA.addEventListener('click', () => startListening('A'));
    btnB.addEventListener('click', () => startListening('B'));

    // Tính năng thông minh: Chạm vào nửa màn hình nào thì thu âm tiếng người đó (Giữ nguyên vì rất hữu ích)
    userHalf.addEventListener('click', (e) => {
        if(e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'I') {
            startListening('A');
        }
    });
    
    partnerHalf.addEventListener('click', (e) => {
        if(e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'I') {
            startListening('B');
        }
    });

    // --- LOGIC CHỤP DỊCH (CAMERA OCR) ---
    const btnCamera = document.getElementById('btn-camera');
    const cameraOverlay = document.getElementById('camera-overlay');
    const closeCameraBtn = document.getElementById('close-camera');
    const cameraFeed = document.getElementById('camera-feed');
    const cameraCanvas = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const ocrStatus = document.getElementById('ocr-status');
    let videoStream = null;

    btnCamera.addEventListener('click', async () => {
        cameraOverlay.style.display = 'flex';
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            cameraFeed.srcObject = videoStream;
        } catch (err) {
            alert('Lỗi truy cập Camera');
            cameraOverlay.style.display = 'none';
        }
    });

    closeCameraBtn.addEventListener('click', () => {
        cameraOverlay.style.display = 'none';
        if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    });

    captureBtn.addEventListener('click', async () => {
        if (!videoStream) return;
        cameraCanvas.width = cameraFeed.videoWidth;
        cameraCanvas.height = cameraFeed.videoHeight;
        cameraCanvas.getContext('2d').drawImage(cameraFeed, 0, 0);
        ocrStatus.classList.add('show');
        
        const tesseractLangMap = {
            'vi-VN': 'vie', 'en-US': 'eng', 'zh-CN': 'chi_sim',
            'ja-JP': 'jpn', 'ko-KR': 'kor', 'th-TH': 'tha',
            'fr-FR': 'fra', 'es-ES': 'spa', 'de-DE': 'deu',
            'ru-RU': 'rus', 'pt-BR': 'por', 'id-ID': 'ind'
        };
        const tLang = tesseractLangMap[langB.value] || 'eng';

        try {
            const imageData = cameraCanvas.toDataURL('image/jpeg');
            const result = await Tesseract.recognize(imageData, tLang);
            const extracted = result.data.text.trim();
            ocrStatus.classList.remove('show');
            closeCameraBtn.click();
            
            if (!extracted) { showStatus('Không tìm thấy văn bản', true); return; }

            textB.textContent = extracted;
            textA.textContent = 'Đang dịch ảnh...';
            showStatus('Đang dịch...');
            const translated = await translateAPI(extracted, langB.value, langA.value);
            textA.textContent = translated;
            addHistory("[Ảnh] " + extracted, labelB.textContent, translated, labelA.textContent);
            playAudio(translated, langA.value);
        } catch (err) {
            ocrStatus.classList.remove('show');
            closeCameraBtn.click();
            showStatus('Lỗi phân tích ảnh', true);
        }
    });

    // --- PWA (Progressive Web App) ĐĂNG KÝ SERVICE WORKER ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('ServiceWorker đã được đăng ký thành công:', registration.scope);
                })
                .catch(err => {
                    console.log('Lỗi đăng ký ServiceWorker:', err);
                });
        });
    }
});
