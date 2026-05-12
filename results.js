// сохранение скриншота и json файла с результатами эмоций в зип архив
function downloadResults() {
    //результаты опроса
    const surveyData = {
        userID: window.userID,
        timestamp: new Date().toISOString(),
        easierEachRound: document.querySelector('input[name="easierEachRound"]:checked')?.value || null,
        strategyMoment: document.querySelector('select[name="strategyMoment"]')?.value || null,
        changedApproach: document.querySelector('input[name="changedApproach"]:checked')?.value || null,
        difficulty: document.querySelector('input[name="difficulty"]:checked')?.value || null,
        multiTask: document.querySelector('input[name="multiTask"]:checked')?.value || null,
        slowReaction: document.querySelector('input[name="slowReaction"]:checked')?.value || null,
        excitement: document.querySelector('input[name="excitement"]:checked')?.value || null,
        frustration: document.querySelector('input[name="frustration"]:checked')?.value || null,
        wantContinue: document.querySelector('input[name="wantContinue"]:checked')?.value || null,
    };

    const zip = new JSZip();

    const completeGameData = {
        userID: window.userID,
        timestamp: new Date().toISOString(),
        rounds: window.roundResults
    };

    zip.file(`game_results_${window.userID}.json`, JSON.stringify(completeGameData, null, 2));
    zip.file(`survey_${window.userID}.json`, JSON.stringify(surveyData, null, 2));

    const board = document.getElementById('board');
    if (!board) {
        console.error('Board не найден');
        generateZip(zip);
        return;
    }

    createHeatmapAndDownload(zip);
}


//создание тепловой карты
function createHeatmapAndDownload(zip) {
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.position = 'absolute';
    hiddenContainer.style.left = '-9999px';
    hiddenContainer.style.top = '-9999px';
    hiddenContainer.style.width = '500px';
    hiddenContainer.style.height = '500px';
    document.body.appendChild(hiddenContainer);

    if (typeof h337 === 'undefined') {
        console.error('Heatmap.js не загружен');
        generateZip(zip);
        hiddenContainer.remove();
        return;
    }

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

    // Проходим по всем картам на поле
    cardsElements.forEach((card, index) => {
        const count = window.gazeStats[index] || 0;
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
        max: maxVal || 1,
        data: points
    });

    setTimeout(() => {
        // Конвертируем контейнер с тепловой картой в PNG с помощью html2canvas
        html2canvas(hiddenContainer, {
            scale: 1,
            useCORS: true,
            logging: false
        }).then(canvas => {
            const heatmapDataURL = canvas.toDataURL("image/png");
            const heatmapBase64 = heatmapDataURL.split(',')[1];
            zip.file(`heatmap_user_${window.userID}.png`, heatmapBase64, { base64: true });
            hiddenContainer.remove();
            generateZip(zip);
        }).catch(error => {
            console.error('Ошибка html2canvas:', error);
            hiddenContainer.remove();
            generateZip(zip);
        });
    }, 500);
}


//собираем все файлы в zip архив
function generateZip(zip) {
    zip.generateAsync({ type: "blob" }).then(function(content) {
        const link = document.createElement('a');
        link.download = `game_results_${window.userID}.zip`;
        link.href = URL.createObjectURL(content);
        link.click();
        URL.revokeObjectURL(link.href);
        alert('Результаты успешно сохранены!');
    }).catch(error => {
        console.error('Ошибка создания ZIP:', error);
        alert('Ошибка при сохранении результатов');
    });
}

// Экспорт функций в глобальную область видимости
window.downloadResults = downloadResults;
window.createHeatmapAndDownload = createHeatmapAndDownload;
window.generateZip = generateZip;