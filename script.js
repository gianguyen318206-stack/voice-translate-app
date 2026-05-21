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
                // Thêm cấu hình tắt lọc tiếng ồn để tránh HĐH tự động giảm âm lượng (ducking)
                waveformStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } 
                });
                source = audioCtx.createMediaStreamSource(waveformStream);
                if (!analyser) analyser = audioCtx.createAnalyser();
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
        
        // QUAN TRỌNG: Phải tắt hẳn micro để hệ điều hành không bị nhầm là đang gọi điện thoại
        // Từ đó khôi phục lại âm lượng loa ngoài ở mức tối đa (không bị ducking)
        if (waveformStream) {
            waveformStream.getTracks().forEach(track => track.stop());
            waveformStream = null;
        }
        if (source) {
            source.disconnect();
            source = null;
        }
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

    // Prefer female and premium/enhanced voices for natural, emotional sound
    function findBestVoice(langFullCode) {
        if (!availableVoices.length) loadVoices();
        const short = langFullCode.split('-')[0];

        // Get all voices for this language
        const langVoices = availableVoices.filter(v =>
            v.lang === langFullCode || v.lang.startsWith(short)
        );
        if (langVoices.length === 0) return null;

        // Keywords for female voices
        const femaleHints = ['linh', 'an', 'mai', 'lan', 'huong', 'female',
                             'woman', 'girl', 'zira', 'hazel', 'samantha',
                             'susan', 'kate', 'fiona', 'heera', 'neerja'];
        const maleHints   = ['male', 'man', 'david', 'mark', 'daniel',
                             'nam', 'tung', 'hung', 'jorge', 'diego'];
        
        // Keywords for high quality/expressive voices
        const premiumHints = ['premium', 'enhanced', 'natural', 'online', 'neural'];

        // Score voices to find the best match
        let bestVoice = langVoices[0];
        let highestScore = -1;

        langVoices.forEach(v => {
            let score = 0;
            const name = v.name.toLowerCase();
            
            if (femaleHints.some(h => name.includes(h))) score += 10;
            if (maleHints.some(h => name.includes(h))) score -= 10;
            if (premiumHints.some(h => name.includes(h))) score += 5; // Bonus for high quality

            if (score > highestScore) {
                highestScore = score;
                bestVoice = v;
            }
        });

        return bestVoice;
    }

    function splitTextToChunks(text, maxLen) {
        const chunks = [];
        let rem = text;
        while (rem.length > 0) {
            if (rem.length <= maxLen) { chunks.push(rem); break; }
            let cut = rem.lastIndexOf('.', maxLen);
            if (cut < maxLen / 2) cut = rem.lastIndexOf(',', maxLen);
            if (cut < maxLen / 2) cut = rem.lastIndexOf(' ', maxLen);
            if (cut < maxLen / 2) cut = maxLen;
            
            let chunkLen = (cut === maxLen) ? maxLen : cut + 1;
            chunks.push(rem.substring(0, chunkLen).trim());
            rem = rem.substring(chunkLen).trim();
        }
        return chunks.filter(c => c.length > 0);
    }

    // Global audio elements to bypass iOS autoplay restrictions
    const googleTTSAudio = new Audio();
    const googleTTSAudio2 = new Audio(); // Kênh đôi để khuếch đại âm lượng to hơn (Dual-channel boost)

    // Play via Google Translate TTS (better quality, natural female voice)
    function playGoogleTTS(text, langCode) {
        return new Promise((resolve, reject) => {
            const chunks = splitTextToChunks(text, 200);
            let i = 0;
            function next() {
                if (i >= chunks.length) { showStatus('Sẵn sàng'); resolve(); return; }
                const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langCode}&q=${encodeURIComponent(chunks[i])}`;
                
                googleTTSAudio.src = url;
                googleTTSAudio2.src = url; // Nạp cùng URL
                
                googleTTSAudio.onended = () => { i++; next(); };
                googleTTSAudio.onerror = () => reject(new Error('Google TTS fail'));
                
                googleTTSAudio.play().catch(reject);
                googleTTSAudio2.play().catch(() => {}); // Phát đồng thời để tạo hiệu ứng âm thanh to hơn (+3dB)
            }
            next();
        });
    }

    // Play via speechSynthesis (iOS + fallback)
    function doSpeakSynthesis(text, langFullCode) {
        if (!('speechSynthesis' in window)) { showStatus('Sẵn sàng'); return; }
        window.speechSynthesis.cancel();
        const delay = isIOS ? 200 : 0;
        
        const chunks = splitTextToChunks(text, 150); // smaller chunks for synthesis
        
        setTimeout(() => {
            let chunksFinished = 0;
            
            // Android Chrome 15s keep-alive
            const keepAlive = setInterval(() => {
                if (!window.speechSynthesis.speaking) clearInterval(keepAlive);
                else { window.speechSynthesis.pause(); window.speechSynthesis.resume(); }
            }, 10000);

            chunks.forEach((chunk) => {
                const utterance = new SpeechSynthesisUtterance(chunk);
                utterance.lang    = langFullCode;
                utterance.rate    = 1.0;  // 1.0 is most natural
                utterance.pitch   = 1.0;  // 1.0 allows built-in emotion to shine
                utterance.volume  = 1.0;
                const voice = findBestVoice(langFullCode);
                if (voice) utterance.voice = voice;

                utterance.onend = () => {
                    chunksFinished++;
                    if (chunksFinished >= chunks.length) {
                        clearInterval(keepAlive);
                        showStatus('Sẵn sàng');
                    }
                };
                utterance.onerror = (e) => {
                    chunksFinished++;
                    if (chunksFinished >= chunks.length) {
                        clearInterval(keepAlive);
                        if (e.error !== 'interrupted' && e.error !== 'canceled')
                            showStatus('Sẵn sàng');
                    }
                };
                window.speechSynthesis.speak(utterance);
            });
        }, delay);
    }

    function playAudio(text, langFullCode) {
        if (!text) return;
        showStatus('Đang phát âm...');
        const langCode = langFullCode.split('-')[0];

        // Use Google TTS universally for the best human-like female voice
        // (iOS is now supported because we prime googleTTSAudio on click)
        playGoogleTTS(text, langCode)
            .catch(() => {
                // Fallback to synthesis only if Google TTS completely fails
                doSpeakSynthesis(text, langFullCode);
            });
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
        recognition.continuous = true;       // KHÔNG tự dừng khi im lặng
        recognition.interimResults = true;   // Hiển thị chữ realtime khi đang nói
    }

    let currentMode = null;
    let accumulatedTranscript = '';  // Tích lũy toàn bộ lời nói
    let manualStop = false;         // Cờ: người dùng chủ động bấm dừng
    let isRecording = false;        // Trạng thái đang thu âm

    if (recognition) {
        recognition.onstart = () => {
            isRecording = true;
            if (currentMode === 'A') {
                btnA.classList.add('active');
                textA.textContent = 'Đang nghe bạn nói...';
                startWaveform('#3b82f6');
            } else {
                btnB.classList.add('active');
                textB.textContent = 'Đang nghe đối tác...';
                startWaveform('#f43f5e');
            }
            showStatus('🔴 Đang thu âm — Bấm lần nữa để dừng');
        };

        // Hiển thị chữ realtime và tích lũy kết quả cuối cùng
        recognition.onresult = (event) => {
            let finalText = accumulatedTranscript;
            let interimText = '';

            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    // Câu đã xác nhận xong → tích lũy
                    // Chỉ thêm nếu chưa có trong accumulatedTranscript (tránh trùng)
                    const newText = result[0].transcript;
                    if (!accumulatedTranscript.includes(newText.trim())) {
                        accumulatedTranscript += (accumulatedTranscript ? ' ' : '') + newText.trim();
                    }
                    finalText = accumulatedTranscript;
                } else {
                    // Đang nói dở → hiển thị tạm (chữ nhạt)
                    interimText += result[0].transcript;
                }
            }

            // Hiển thị lên màn hình
            const displayText = finalText + (interimText ? ' ' + interimText : '');
            if (currentMode === 'A') {
                textA.textContent = displayText || 'Đang nghe bạn nói...';
            } else {
                textB.textContent = displayText || 'Đang nghe đối tác...';
            }
        };

        recognition.onerror = (event) => {
            // Lỗi 'no-speech' hoặc 'aborted' → bỏ qua, tự khởi động lại
            if (event.error === 'no-speech' || event.error === 'aborted') {
                return; // onend sẽ tự restart
            }
            const errorMessages = {
                'audio-capture':      'Không truy cập được micro',
                'not-allowed':        'Hãy cho phép truy cập micro trong cài đặt',
                'network':            'Lỗi mạng, kiểm tra kết nối internet',
                'service-not-allowed':'Trình duyệt không hỗ trợ thu âm'
            };
            const msg = errorMessages[event.error] || `Lỗi: ${event.error}`;
            showStatus(msg, true);
            manualStop = true; // Lỗi nghiêm trọng → dừng hẳn
            resetRecordingState();
        };

        recognition.onend = () => {
            if (manualStop) {
                // Người dùng chủ động bấm dừng → xử lý bản dịch
                isRecording = false;
                resetRecordingState();
                processAccumulatedText();
            } else if (isRecording) {
                // Trình duyệt tự dừng (timeout/no-speech) → tự khởi động lại
                try {
                    recognition.start();
                } catch (e) {
                    isRecording = false;
                    resetRecordingState();
                    processAccumulatedText();
                }
            }
        };
    }

    // Xử lý bản dịch sau khi dừng thu âm
    async function processAccumulatedText() {
        const transcript = accumulatedTranscript.trim();
        accumulatedTranscript = ''; // Reset cho lần sau

        if (!transcript) {
            showStatus('Không nghe thấy giọng nói, thử lại nhé!', true);
            return;
        }

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

        // Đang thu âm → bấm lần nữa = DỪNG
        if (isRecording) {
            manualStop = true;
            recognition.stop();
            return;
        }

        // Bắt đầu thu âm mới
        currentMode = mode;
        accumulatedTranscript = '';
        manualStop = false;
        recognition.lang = mode === 'A' ? langA.value : langB.value;

        if (isIOS) {
            // Prime global Audio so Google TTS can play asynchronously later
            const silence = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            googleTTSAudio.src = silence;
            googleTTSAudio.play().catch(()=>{});
            googleTTSAudio2.src = silence;
            googleTTSAudio2.play().catch(()=>{});

            // iOS FIX: prime speechSynthesis FIRST (inside user gesture),
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
