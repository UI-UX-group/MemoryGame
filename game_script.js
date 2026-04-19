let currentRound = 1; // текуший раунд
let roundResults = {
    1:{ attempts: 0, timeToFind: [], roundTime: 0 },
    2:{ attempts: 0, timeToFind: [], roundTime: 0 },
    3:{ attempts: 0, timeToFind: [], roundTime: 0 }
}

let userID;

const cardImages = Array.from({length: 12}, (_, i) => `images/${i+1}.png`);
let cards = [], flippedCards = [], matchedPairs = 0, attempts = 0;
let waitForMatch = false, gameActive = false;
let gazeStats = {}; //храним количество взглядов на карту
let cardAttempts = {};

let currentEmotion = 'neutral';
let currentEmotionConfidence = 0;

let emotionEvents = {
    match: {
        positive: 0,   // happy, surprised
        neutral: 0,    // neutral
        negative: 0    // sad, angry, fearful, disgusted
    },
    mismatch: {
        positive: 0, // happy, surprised
        neutral: 0, // neutral
        negative: 0  // sad, angry, fearful, disgusted
    }
};

let gameStartTime = null;
let timeToFind = []; // время между нахождением пар в миллисекундах

let cntErrors = 0; //количество ошибок подряд
let currentErrors = []; //эмоции в текущей серии ошибок
let allErrors = []; // все списки эмоций при ошибке в игре


let currerntCardId = null; // карта, которая сейчас открыта
let currentHoverCard = null; // карта, на которую смотрит пользователь
let hoverStartTime = null; // время, когда пользователь начал смотреть на карту
let hesitationEvents = []; // все сомнения
//регистрация пользователя
function showRules(){
    const nameInput = document.getElementById('userID');
    const name = nameInput.value.trim();

    if (name === "") {
        alert("Пожалуйста, введите ваш ID");
        return;
    }

    userID = name;

    // Скрываем окно регистрации
    document.querySelector('.registration').style.display = 'none';

    // Показываем правила
    document.getElementById('rulesOverlay').style.display = 'flex';
}

// старт системы
function startCalibration() {
    if (typeof webgazer === 'undefined') return alert('WebGazer не загружен!');

    document.getElementById('rulesOverlay').style.display = 'none';
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

        const cardId = card.dataset.id;
        const isFlipped = card.classList.contains('flipped');
        const isMatched = card.classList.contains('matched');

        if (flippedCards.length === 1 && !isFlipped && !isMatched){
            const openedCardId = flippedCards[0].cardId;
            if (cardId === openedCardId) {

                //начали смотреть на правильную карту
                if (currentHoverCard !== cardId) {
                    currentHoverCard = cardId;
                    hoverStartTime = Date.now();
                }
            }
        }
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
    emotionEvents = {
        match: { positive: 0, neutral: 0, negative: 0 },
        mismatch: { positive: 0, neutral: 0, negative: 0 }
    };

    gameStartTime = Date.now();
    timeToFind = [];

    document.getElementById('attempts').innerText = "0";
    document.getElementById('pairsFound').innerText = "0";

    document.getElementById('roundIndicator').innerText = `${currentRound}`;

    cntErrors = 0;
    currentErrors = [];
    hesitationEvents = [];
    timeToFind = [];

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
            if (cntErrors >= 3)
            {
                allErrors.push([...currentErrors]);
            }
            cntErrors = 0;
            currentErrors = [];


            setTimeout(() => {recordEmotionForEvent('match');}, 2000);
            matchedPairs++;
            document.getElementById('pairsFound').innerText = matchedPairs;
            flippedCards.forEach(c => c.card.classList.add('matched'));
            flippedCards = [];
            waitForMatch = false;
            if (matchedPairs === 12) setTimeout(() => FinishModal(), 500);

            if (timeToFind.length === 0)
            {
                timeToFind.push(Date.now() - gameStartTime);
            }
            else
            {
                const lastPairTime = timeToFind[timeToFind.length - 1];
                const currentTime = Date.now() - gameStartTime;
                timeToFind.push(currentTime - lastPairTime);
            }
        }
        else {
            cntErrors ++;
            const hoverDuration = Date.now() - hoverStartTime;
            if (hoverDuration >= 1000 && hoverDuration < 1100){
                hesitationEvents.push(hoverDuration)
            }
            setTimeout(() => {recordEmotionForEvent('mismatch');}, 2000);

            currentErrors.push(currentEmotion);
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
    document.getElementById('result-modal').style.display = 'block';
}

// закрытие окна
function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
    location.reload();
}

// сохранение скриншота и json файла с результатами эмоций в зип архив
function downloadResults() {
    const container = document.getElementById('heatmap-result-container');

     const surveyData = {
        userID: userID,
        timestamp: new Date().toISOString(),

        // Когнитивная нагрузка
        easierEachRound: document.querySelector('input[name="easierEachRound"]:checked')?.value || null,
        strategyMoment: document.querySelector('select[name="strategyMoment"]')?.value || null,
        changedApproach: document.querySelector('input[name="changedApproach"]:checked')?.value || null,
        difficulty: document.querySelector('input[name="difficulty"]:checked')?.value || null,
        multiTask: document.querySelector('input[name="multiTask"]:checked')?.value || null,
        slowReaction: document.querySelector('input[name="slowReaction"]:checked')?.value || null,

        // Эмоциональное состояние
        excitement: document.querySelector('input[name="excitement"]:checked')?.value || null,
        frustration: document.querySelector('input[name="frustration"]:checked')?.value || null,
        wantContinue: document.querySelector('input[name="wantContinue"]:checked')?.value || null,
    };

    const zip = new JSZip();

    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.position = 'absolute';
    hiddenContainer.style.left = '-9999px';
    hiddenContainer.style.top = '-9999px';
    hiddenContainer.style.width = '500px';
    hiddenContainer.style.height = '500px';
    document.body.appendChild(hiddenContainer);

    // Создаём тепловую карту
    const heatmapInstance = h337.create({
        container: hiddenContainer,
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
                x: Math.floor((rect.left - boardRect.left + rect.width / 2) / boardRect.width * hiddenContainer.offsetWidth),
                y: Math.floor((rect.top - boardRect.top + rect.height / 2) / boardRect.height * hiddenContainer.offsetHeight),
                value: count
            });
            if (count > maxVal) maxVal = count;
        }
    });

    heatmapInstance.setData({
        max: maxVal,
        data: points
    });


    // сохранение тепловой карты
    html2canvas(hiddenContainer).then(canvas => {
        const heatmapDataURL = canvas.toDataURL("image/png");
        const heatmapBase64 = heatmapDataURL.split(',')[1];
        zip.file(`heatmap_user_${userID}.png`, heatmapBase64, { base64: true });

    hiddenContainer.remove();

    const gameTimeFormatted = `${Math.floor((Date.now() - gameStartTime) / 60000)}:${Math.floor(((Date.now() - gameStartTime) % 60000) / 1000).toString().padStart(2, '0')}`;

    const resultsData = {
            userID: userID, // id игрока
            time: gameTimeFormatted, // время прохождения

            // для метрики точности //
            pairs : matchedPairs, // количество пар
            attempts : attempts, // количество попыток

            // время нахождения последующей пары //
            timeToFind : timeToFind,

            // ухудшение эмоций //
            emotionError : allErrors,

            //время на сомнения //
            hesitationEvents : hesitationEvents,
            emotionEvents: emotionEvents, // эмоции при открытии пары
        };

    const jsonContent = JSON.stringify(resultsData, null, 2);
    zip.file(`results_user_${userID}.json`, jsonContent);


     const surveyContent = JSON.stringify(surveyData, null, 2);
     zip.file(`survey_user_${userID}.json`, surveyContent);

    zip.generateAsync({ type: "blob" }).then(function(content) {
            const link = document.createElement('a');
            link.download = `game_results_${userID}.zip`;
            link.href = URL.createObjectURL(content);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }).catch(error => {
        console.error('Ошибка при создании скриншота:', error);
        alert('Не удалось сохранить скриншот');
    });

}

function classifyEmotion(emotion) {
    const positive = ['happy', 'surprised'];
    const negative = ['sad', 'angry', 'fearful', 'disgusted'];

    if (positive.includes(emotion)) return 'positive';
    if (negative.includes(emotion)) return 'negative';
    return 'neutral'; // neutral
}

//эмоции
function recordEmotionForEvent(eventType) {
    if (!gameActive) return;

    const valence = classifyEmotion(currentEmotion);
    if (eventType === 'match') {
        emotionEvents.match[valence]++;
    } else if (eventType === 'mismatch') {
        emotionEvents.mismatch[valence]++;
    }
}