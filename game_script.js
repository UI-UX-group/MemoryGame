// game_script.js

let currentRound = 1; // текуший раунд
let isRoundFinished = false;
let revealTimeout = null; // таймер для скрытия карточек
let roundExposureTimes = {
    1: 1300,  // 1 раунд - 1300 мс
    2: 500,   // 2 раунд - 500 мс
    3: 1300   // 3 раунд - 1300 мс
};

let roundResults = {
    1:{ attempts: 0, timeToFind: [], roundTime: 0 },
    2:{ attempts: 0, timeToFind: [], roundTime: 0 },
    3:{ attempts: 0, timeToFind: [], roundTime: 0 }
}

let userID;

const cardImages = Array.from({length: 12}, (_, i) => `images/${i+1}.png`);
let cards = [], flippedCards = [], matchedPairs = 0, attempts = 0;
let waitForMatch = false, gameActive = false;
let gazeStats = {}; // храним количество взглядов на карту
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

let cntErrors = 0; // количество ошибок подряд
let currentErrors = []; // эмоции в текущей серии ошибок
let allErrors = []; // все списки эмоций при ошибке в игре

let currentHoverCard = null; // карта, на которую смотрит пользователь
let hoverStartTime = null; // время, когда пользователь начал смотреть на карту
let hesitationEvents = []; // все сомнения

// инициализация игры
function initGame() {
    // Сбрасываем игровые переменные для нового раунда
    gameActive = true;
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
    cntErrors = 0;
    currentErrors = [];
    allErrors = [];
    hesitationEvents = [];
    isRoundFinished = false;

    // Обновляем отображение на экране
    document.getElementById('attempts').innerText = "0";
    document.getElementById('pairsFound').innerText = "0";
    document.getElementById('roundIndicator').innerText = currentRound;

    // Перемешиваем карты
    cards = [...cardImages, ...cardImages].sort(() => Math.random() - 0.5);
    renderBoard();

    // Сообщаем игроку о начале раунда
    showRoundStartMessage();

    if (typeof webgazer !== 'undefined') {
        webgazer.resume();
    }
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
            if (cntErrors >= 3) {
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
            
            if (matchedPairs === 12) {
                saveCurrentRoundResults();
                if (currentRound < 3) {
                    // Переходим к следующему раунду
                    currentRound++;
                    setTimeout(() => {
                        startNextRound();
                    }, 2000);
                } else {
                    // Все 3 раунда завершены
                    setTimeout(() => {
                        finishAllRounds();
                    }, 1000);
                }
            }

            if (timeToFind.length === 0) {
                timeToFind.push(Date.now() - gameStartTime);
            } else {
                const lastPairTime = timeToFind[timeToFind.length - 1];
                const currentTime = Date.now() - gameStartTime;
                timeToFind.push(currentTime - lastPairTime);
            }
        } else {
            cntErrors++;

            const hoverDuration = Date.now() - hoverStartTime;
            if (hoverDuration >= 1500 && hoverDuration < 1600) {
                hesitationEvents.push(hoverDuration);
            }
            setTimeout(() => {recordEmotionForEvent('mismatch');}, 2000);

            currentHoverCard = null;
            hoverStartTime = null;

            currentErrors.push(currentEmotion);
            setTimeout(() => {
                flippedCards.forEach(c => c.card.classList.remove('flipped'));
                flippedCards = [];
                waitForMatch = false;
            }, roundExposureTimes[currentRound]);
        }
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

// эмоции
function recordEmotionForEvent(eventType) {
    if (!gameActive) return;

    const valence = classifyEmotion(currentEmotion);
    if (eventType === 'match') {
        emotionEvents.match[valence]++;
    } else if (eventType === 'mismatch') {
        emotionEvents.mismatch[valence]++;
    }
}

// сообщение о начале раунда
function showRoundStartMessage() {
    const msgDiv = document.createElement('div');
    msgDiv.textContent = `Раунд ${currentRound} из 3`;
    msgDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 20px 40px;
        border-radius: 15px;
        font-size: 28px;
        font-weight: bold;
        z-index: 20000;
        text-align: center;
        font-family: sans-serif;
    `;
    document.body.appendChild(msgDiv);

    setTimeout(() => {
        if (msgDiv && msgDiv.parentNode) {
            msgDiv.remove();
        }
    }, 1500);
}

function saveCurrentRoundResults() {
    const roundTime = Date.now() - gameStartTime;
    const timeFormatted = `${Math.floor(roundTime / 60000)}:${Math.floor((roundTime % 60000) / 1000).toString().padStart(2, '0')}`;

    roundResults[currentRound] = {
        attempts: attempts,
        matchedPairs: matchedPairs,
        timeToFind: [...timeToFind],
        roundTime: roundTime,
        roundTimeFormatted: timeFormatted,
        emotionEvents: JSON.parse(JSON.stringify(emotionEvents)),
        allErrors: [...allErrors],
        hesitationEvents: [...hesitationEvents],
        gazeStats: {...gazeStats},
        cardAttempts: {...cardAttempts}
    };

    console.log(`Раунд ${currentRound} завершён! Попыток: ${attempts}, Время: ${timeFormatted}`);
}

function startNextRound() {
    // Очищаем игровую доску
    const board = document.getElementById('board');
    board.innerHTML = '';

    // Сбрасываем временные переменные
    flippedCards = [];
    waitForMatch = false;

    // Запускаем новый раунд
    initGame();
}

function finishAllRounds() {
    gameActive = false;
    if (typeof webgazer !== 'undefined') {
        webgazer.pause();
    }

    // Показываем сообщение о завершении игры
    const msgDiv = document.createElement('div');
    msgDiv.textContent = `Игра завершена! Спасибо за участие!`;
    msgDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 20px 40px;
        border-radius: 15px;
        font-size: 24px;
        font-weight: bold;
        z-index: 20000;
        text-align: center;
    `;
    document.body.appendChild(msgDiv);

    setTimeout(() => {
        if (msgDiv && msgDiv.parentNode) {
            msgDiv.remove();
        }
        // Показываем форму опроса
        document.getElementById('result-modal').style.display = 'block';
    }, 2000);
}

// Экспорт в глобальную область видимости
window.initGame = initGame;
window.renderBoard = renderBoard;
window.handleCardClick = handleCardClick;
window.startNextRound = startNextRound;
window.finishAllRounds = finishAllRounds;
window.closeModal = closeModal;
window.FinishModal = FinishModal;
window.recordEmotionForEvent = recordEmotionForEvent;
window.showRoundStartMessage = showRoundStartMessage;
window.saveCurrentRoundResults = saveCurrentRoundResults;

// Экспорт переменных, которые используются в других файлах
window.currentRound = currentRound;
window.gameActive = gameActive;
window.gazeStats = gazeStats;
window.flippedCards = flippedCards;
window.currentHoverCard = currentHoverCard;
window.hoverStartTime = hoverStartTime;
window.currentEmotion = currentEmotion;
window.cardAttempts = cardAttempts;
window.roundResults = roundResults;