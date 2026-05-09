// calibration.js

// старт системы
function startCalibration() {
    if (typeof webgazer === 'undefined') return alert('WebGazer не загружен!');

    if (typeof webgazer.params !== 'undefined') {
        webgazer.params.mediaPipePath = './mediapipe/face_mesh/';
    }

    document.getElementById('rulesOverlay').style.display = 'none';
    document.getElementById('videoMonitor').style.display = 'flex';

    webgazer.setRegression('ridge')
        .setGazeListener((data, timestamp) => {
            if (data) {
                updateGazeIndicator(data.x, data.y);
                if (window.gameActive) trackGazeOnCards(data.x, data.y);
            }
        })
        .begin()
        .then(() => {
            webgazer.showVideo(true).showPredictionPoints(false);
            setupVideoLayout();
            startFaceAPI();
            createCalibrationPoints();
        });
}

// монитор WebGazer
function setupVideoLayout() {
    setTimeout(() => {
        const wgContainer = document.getElementById('webgazerVideoContainer');
        const parent = document.getElementById('webgazerVideoParent');
        if (wgContainer && parent) {
            wgContainer.style.position = 'relative';
            wgContainer.style.width = '100%';
            wgContainer.style.top = '0';
            wgContainer.style.left = '0';
            parent.appendChild(wgContainer);
        }
    }, 1000);
}

// настройка faceAPI
async function startFaceAPI() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceExpressionNet.loadFromUri('/models');

    const faceContainer = document.getElementById('faceVideoContainer');
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.style.width = '100%';
    video.style.transform = 'scaleX(-1)';
    faceContainer.appendChild(video);

    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => { video.srcObject = stream; video.play(); })
        .catch(err => console.error(err));

    setInterval(async () => {
        if (video.videoWidth && video.videoHeight) {
            const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
            if (detection) {
                const expressions = detection.expressions;
                const dominant = Object.entries(expressions).reduce((a,b) => a[1] > b[1] ? a : b)[0];

                window.currentEmotion = dominant;
                window.currentEmotionConfidence = expressions[dominant];

                const faceValues = document.getElementById('faceValues');
                if (faceValues) {
                    const emoji = getEmotionEmoji(dominant);
                    faceValues.innerHTML = `${emoji} ${dominant}: ${Math.round(expressions[dominant]*100)}%`;
                }
            }
        }
    }, 200);
}

function getEmotionEmoji(emotion) {
    const map = { neutral:'😐', happy:'😊', sad:'😢', angry:'😠', fearful:'😨', disgusted:'🤢', surprised:'😲' };
    return map[emotion] || '😐';
}

function classifyEmotion(emotion) {
    const positive = ['happy', 'surprised'];
    const negative = ['sad', 'angry', 'fearful', 'disgusted'];

    if (positive.includes(emotion)) return 'positive';
    if (negative.includes(emotion)) return 'negative';
    return 'neutral';
}

// калибровка
function createCalibrationPoints() {
    const points = [
        {t: '10%', l: '10%'}, {t: '10%', l: '50%'}, {t: '10%', l: '90%'},
        {t: '50%', l: '10%'}, {t: '50%', l: '50%'}, {t: '50%', l: '90%'},
        {t: '90%', l: '10%'}, {t: '90%', l: '50%'}, {t: '90%', l: '90%'}
    ];

    points.forEach((pos, i) => {
        const pt = document.createElement('div');
        pt.className = 'CalibrationPoint';
        pt.dataset.clicks = 0;
        Object.assign(pt.style, {
            top: pos.t, left: pos.l, position: 'fixed', width: '25px', height: '25px',
            background: 'red', borderRadius: '50%', cursor: 'pointer', zIndex: '10010'
        });

        pt.onclick = function() {
            let clicks = parseInt(this.dataset.clicks) + 1;
            this.dataset.clicks = clicks;
            this.style.opacity = 1 - (clicks * 0.15);
            if (clicks >= 5) {
                this.style.background = 'yellow';
                this.style.pointerEvents = 'none';
                checkCalibrationStatus();
            }
        };
        document.body.appendChild(pt);
    });
}

// все ли точки нажаты
function checkCalibrationStatus() {
    const remainingPoints = document.querySelectorAll('.CalibrationPoint:not([style*="yellow"])');
    if (remainingPoints.length === 0) {
        startFinalValidation();
    }
}

// последняя точка
function startFinalValidation() {
    document.querySelectorAll('.CalibrationPoint').forEach(p => p.remove());

    const status = document.getElementById('calibrationStatus');
    if (status) status.innerText = "Посмотрите на синюю точку в центре";

    const vPoint = document.createElement('div');
    vPoint.className = 'FinalPoint';
    Object.assign(vPoint.style, {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%,-50%)',
        background: 'blue',
        width: '40px',
        height: '40px',
        position: 'fixed',
        borderRadius: '50%',
        zIndex: '10011',
        boxShadow: '0 0 15px rgba(0,0,255,0.5)'
    });

    document.body.appendChild(vPoint);

    setTimeout(() => {
        vPoint.remove();
        finishCalibration();
    }, 2000);
}

// запуск игры
function finishCalibration() {
    document.getElementById('videoMonitor').style.display = 'none';
    webgazer.showVideo(false);
    document.getElementById('gameContainer').style.display = 'block';

    document.getElementById('gazeIndicator').style.opacity = 0;
    window.gameActive = true;
    window.initGame();
}

function updateGazeIndicator(x, y) {
    const gi = document.getElementById('gazeIndicator');
    if (gi) {
        gi.style.display = 'block';
        gi.style.left = x + 'px';
        gi.style.top = y + 'px';
    }
}

// проверка попадания взгляда на карточку
function trackGazeOnCards(x, y) {
    const target = document.elementFromPoint(x, y);
    const card = target ? target.closest('.card') : null;

    if (card) {
        const index = card.dataset.index;
        window.gazeStats[index] = (window.gazeStats[index] || 0) + 1;

        const cardId = card.dataset.id;
        const isFlipped = card.classList.contains('flipped');
        const isMatched = card.classList.contains('matched');

        if (window.flippedCards.length === 1 && !isFlipped && !isMatched){
            const openedCardId = window.flippedCards[0].cardId;
            if (cardId === openedCardId) {
                if (window.currentHoverCard !== cardId) {
                    window.currentHoverCard = cardId;
                    window.hoverStartTime = Date.now();
                }
            }
        }
    }
}

// Экспорт функций в глобальную область видимости
window.startCalibration = startCalibration;
window.startFaceAPI = startFaceAPI;
window.classifyEmotion = classifyEmotion;
window.trackGazeOnCards = trackGazeOnCards;
window.updateGazeIndicator = updateGazeIndicator;