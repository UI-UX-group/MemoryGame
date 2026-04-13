const cardImages = Array.from({length: 12}, (_, i) => `images/${i+1}.png`);
let cards = [], flippedCards = [], matchedPairs = 0, attempts = 0;
let waitForMatch = false, gameActive = false;
let gazeStats = {}; //храним количество взглядов на карту
let cardAttempts = {};

let currentEmotion = 'neutral';
let currentEmotionConfidence = 0;
let emotionStats = {
    happy: 0, sad: 0, angry: 0, surprised: 0,
    fearful: 0, disgusted: 0, neutral: 0
};
let emotionEvents = [];
let gameStartTime = null;

// старт системы
function startCalibration() {
    if (typeof webgazer === 'undefined') return alert('WebGazer не загружен!');

    document.getElementById('calibrationOverlay').style.display = 'none';
    document.getElementById('videoMonitor').style.display = 'flex';

    webgazer.setRegression('ridge')
        .setGazeListener((data, timestamp) => {
            if (data) {
                updateGazeIndicator(data.x, data.y);
                if (gameActive) trackGazeOnCards(data.x, data.y);
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

                currentEmotion = dominant;
                currentEmotionConfidence = expressions[dominant];

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

    //2 секунды посмотреть
    setTimeout(() => {
        vPoint.remove();
        finishCalibration();
    }, 2000);
}

// проверка попадания взгляда на карточку
function trackGazeOnCards(x, y) {
    const target = document.elementFromPoint(x, y);
    const card = target ? target.closest('.card') : null;

    if (card) {
        const index = card.dataset.index;
        gazeStats[index] = (gazeStats[index] || 0) + 1;
    }
}

// запуск игры
function finishCalibration() {
    document.getElementById('videoMonitor').style.display = 'none';
    webgazer.showVideo(false);
    document.getElementById('gameContainer').style.display = 'block';

    document.getElementById('gazeIndicator').style.opacity = 0;
    gameActive = true;
    initGame();
}

// инициализация игры
function initGame() {
    attempts = 0;
    matchedPairs = 0;
    gazeStats = {};
    cardAttempts = {};
    emotionStats = {
        happy: 0, sad: 0, angry: 0, surprised: 0,
        fearful: 0, disgusted: 0, neutral: 0
    };
    emotionEvents = [];

    gameStartTime = Date.now();

    document.getElementById('attempts').innerText = "0";
    document.getElementById('pairsFound').innerText = "0";

    cards = [...cardImages, ...cardImages].sort(() => Math.random() - 0.5);
    renderBoard();
    webgazer.resume();
}

// загрузка игровой доски
function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    cards.forEach((imgSrc, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;

        const cardId = imgSrc.match(/\d+/)?.[0] || Math.floor(index / 2) + 1;
        card.dataset.id = cardId;

        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back" style="background-image: url('${imgSrc}')"></div>
                <div class="card-heat-indicator">0</div>
            </div>
        `;

        card.onclick = () => handleCardClick(card, imgSrc);
        board.appendChild(card);
    });
}

// открытие карты
function handleCardClick(card, img) {
    if (!gameActive || waitForMatch || card.classList.contains('flipped') || card.classList.contains('matched')) return;

    const cardId = card.dataset.id;

    // увеличиваем счетчик открытия карты, только если она первая в паре
    if (flippedCards.length === 0) {
        cardAttempts[cardId] = (cardAttempts[cardId] || 0) + 1;
    }

    card.classList.add('flipped');
    flippedCards.push({card, img, cardId});

    if (flippedCards.length === 2) {
        waitForMatch = true;
        attempts++;
        document.getElementById('attempts').innerText = attempts;

        if (flippedCards[0].img === flippedCards[1].img) {
            setTimeout(() => {recordEmotionForEvent('match');}, 2000);
            matchedPairs++;
            document.getElementById('pairsFound').innerText = matchedPairs;
            flippedCards.forEach(c => c.card.classList.add('matched'));
            flippedCards = [];
            waitForMatch = false;
            if (matchedPairs === 12) setTimeout(() => FinishModal(), 500);
        }
        else {
            setTimeout(() => {recordEmotionForEvent('mismatch');}, 2000);
            setTimeout(() => {
                flippedCards.forEach(c => c.card.classList.remove('flipped'));
                flippedCards = [];
                waitForMatch = false;
            }, 1000);
        }
    }
}

function updateGazeIndicator(x, y) {
    const gi = document.getElementById('gazeIndicator');
    if (gi) {
        gi.style.display = 'block';
        gi.style.left = x + 'px';
        gi.style.top = y + 'px';
    }
}

// отрисовка финального окна с результатами
function FinishModal() {
    gameActive = false;

    let gameTime = 0;
    let gameTimeFormatted = "00:00";
    gameTime = Date.now() - gameStartTime;
    const totalSeconds = Math.floor(gameTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    gameTimeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('gameTimeValue').innerText = gameTimeFormatted;

    const modal = document.getElementById('result-modal');
    const container = document.getElementById('heatmap-result-container');

    modal.style.display = 'block';
    container.innerHTML = '';

    const heatmapInstance = h337.create({
        container: container,
        radius: 50,
        maxOpacity: .6,
        blur: .8
    });

    const points = [];
    let maxVal = 0;

    const cardsElements = document.querySelectorAll('.card');
    const board = document.getElementById('board');
    const boardRect = board.getBoundingClientRect();

    cardsElements.forEach((card, index) => {
        const count = gazeStats[index] || 0;
        if (count > 0) {
            const rect = card.getBoundingClientRect();
            points.push({
                x: Math.floor((rect.left - boardRect.left + rect.width / 2) / boardRect.width * container.offsetWidth),
                y: Math.floor((rect.top - boardRect.top + rect.height / 2) / boardRect.height * container.offsetHeight),
                value: count
            });
            if (count > maxVal) maxVal = count;
        }
    });

    heatmapInstance.setData({
        max: maxVal,
        data: points
    });

    // находим самые простые и сложные карты
    let maxAttempts = 0;
    let minAttempts = Infinity;
    let hardestCardId = -1;
    let easiestCardId = -1;

    for (let id = 1; id <= 12; id++) {
        const attemptsCount = cardAttempts[id] || 0;
        if (attemptsCount > maxAttempts) {
            maxAttempts = attemptsCount;
            hardestCardId = id;
        }
        if (attemptsCount < minAttempts && attemptsCount > 0) {
            minAttempts = attemptsCount;
            easiestCardId = id;
        }
    }

    const hardestCardImage = hardestCardId !== -1 ? `images/${hardestCardId}.png` : '';
    const easiestCardImage = easiestCardId !== -1 ? `images/${easiestCardId}.png` : '';

    const difficultyBlock = document.getElementById('difficultyStatsBlock');
    if (difficultyBlock) {
        difficultyBlock.style.display = 'block';

        // самая сложная карта
        const hardestImgDiv = document.getElementById('hardestCardImage');
        if (hardestImgDiv && hardestCardImage) {
            hardestImgDiv.innerHTML = `<img src="${hardestCardImage}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.innerHTML='❓'">`;
        }
        document.getElementById('hardestCardId').innerHTML = `Карта ${hardestCardId}`;
        document.getElementById('hardestCardAttempts').innerHTML = `${maxAttempts} попыток`;

        // самая простая карта
        const easiestImgDiv = document.getElementById('easiestCardImage');
        if (easiestImgDiv && easiestCardImage) {
            easiestImgDiv.innerHTML = `<img src="${easiestCardImage}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onerror="this.innerHTML='❓'">`;
        }
        document.getElementById('easiestCardId').innerHTML = `Карта ${easiestCardId}`;
        document.getElementById('easiestCardAttempts').innerHTML = `${minAttempts === Infinity ? 0 : minAttempts} попыток`;
    }

    // эмоции
    const emotionBlock = document.getElementById('emotionStatsBlock');
    if (emotionBlock) {
        emotionBlock.style.display = 'block';
        document.getElementById('happyCount').innerText = emotionStats.happy || 0;
        document.getElementById('sadCount').innerText = emotionStats.sad || 0;
        document.getElementById('angryCount').innerText = emotionStats.angry || 0;
        document.getElementById('surprisedCount').innerText = emotionStats.surprised || 0;
        document.getElementById('fearfulCount').innerText = emotionStats.fearful || 0;
        document.getElementById('disgustedCount').innerText = emotionStats.disgusted || 0;
        document.getElementById('neutralCount').innerText = emotionStats.neutral || 0;
    }
}


// закрытие окна
function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
    location.reload();
}


// сохранение скриншота и json файла с результатами эмоций
function downloadHeatmap() {
    const container = document.getElementById('heatmap-result-container');

    // сохранение тепловой карты
    html2canvas(container).then(canvas => {
        const screenshotLink = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        screenshotLink.download = `heatmap-result-${timestamp}.png`;
        screenshotLink.href = canvas.toDataURL("image/png");
        screenshotLink.click();

    });

    // сохранение json с эмоциями
   const blob = new Blob([JSON.stringify({
                gameTime: `${Math.floor((Date.now() - gameStartTime) / 60000)}:${Math.floor(((Date.now() - gameStartTime) % 60000) / 1000).toString().padStart(2, '0')}`,
                emotionEvents: emotionEvents
                }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `emotion-events-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
}

//эмоции
function recordEmotionForEvent(eventType) {
    if (!gameActive) return;

    emotionStats[currentEmotion] = (emotionStats[currentEmotion] || 0) + 1;

    emotionEvents.push({
        emotion: currentEmotion,
        eventType: eventType
    });
}