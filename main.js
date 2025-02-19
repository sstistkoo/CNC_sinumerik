import { CNCParser } from './cncParser.js';

const container = document.querySelector('.container');
const topEditor = document.getElementById('topEditor');
const middleWindow = document.getElementById('middleWindow');
const bottomEditor = document.getElementById('bottomEditor');
const middleContent = document.querySelector('.middle-content');
const fileInput = document.getElementById('fileInput');
const parserTextarea = topEditor.querySelector('textarea');
const editorTextarea = bottomEditor.querySelector('textarea');
const leftPanel = document.getElementById('leftPanel');
const rightPanel = document.getElementById('rightPanel');
const lpButton = document.getElementById('lpButton');
const ppButton = document.getElementById('ppButton');
const topPanel = document.getElementById('topPanel');
const editorHandle = document.getElementById('editorHandle');
let isMiddleOpen = false;
let isDragging = false;
let startY, startTopHeight, startBottomHeight;
const MIDDLE_HEIGHT = 10;
let topHeight = 49.5;
let bottomHeight = 49.5;
let originalTopHeight;
let originalBottomHeight;

const cncParser = new CNCParser();

// Přidat nové konstanty pro číslování řádků
const parserLineNumbers = document.getElementById('parserLineNumbers');
const editorLineNumbers = document.getElementById('editorLineNumbers');

// Opravit funkci updateHeights
function updateHeights() {
    const middleHeight = isMiddleOpen ? MIDDLE_HEIGHT : 0; // Změna z 1 na 0
    topEditor.style.height = `${topHeight}vh`;
    middleWindow.style.height = `${middleHeight}vh`;
    bottomEditor.style.height = `${bottomHeight}vh`;

    // Přidat visibility pro lepší skrývání
    middleWindow.style.visibility = isMiddleOpen ? 'visible' : 'hidden';
    middleContent.classList.toggle('hidden', !isMiddleOpen);
}

// Přidáme ResizeObserver pro lepší aktualizaci pozice
const resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(updateHeights);
});
resizeObserver.observe(bottomEditor);
resizeObserver.observe(topEditor);

editorHandle.addEventListener('click', (e) => {
    if (isDragging) return;
    e.stopPropagation();

    isMiddleOpen = !isMiddleOpen;
    const availableSpace = 100 - (isMiddleOpen ? MIDDLE_HEIGHT : 0);
    const currentRatio = topHeight / (topHeight + bottomHeight);

    // Zachovat poměr výšek při přepínání
    topHeight = availableSpace * currentRatio;
    bottomHeight = availableSpace * (1 - currentRatio);

    updateHeights();
});

editorHandle.addEventListener('touchstart', (e) => {
    isDragging = true;
    startY = e.touches[0].clientY;
    startTopHeight = topHeight;
    startBottomHeight = bottomHeight;
});

document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - startY;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const availableSpace = 100 - (isMiddleOpen ? MIDDLE_HEIGHT : 1);
    const newTopHeight = Math.max(20, Math.min(availableSpace - 20, startTopHeight + deltaPercent));
    const newBottomHeight = availableSpace - newTopHeight;
    if (newBottomHeight >= 20) {
        topHeight = newTopHeight;
        bottomHeight = newBottomHeight;
        updateHeights();
    }
}, { passive: false });

document.addEventListener('touchend', () => {
    isDragging = false;
});

editorHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startTopHeight = topHeight;
    startBottomHeight = bottomHeight;
    e.preventDefault(); // Zabránit výchozímu chování
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const deltaY = e.clientY - startY;
    const totalHeight = window.innerHeight;
    const deltaPercent = (deltaY / totalHeight) * 100;

    // Výpočet nových výšek s omezením
    const availableSpace = 100 - (isMiddleOpen ? MIDDLE_HEIGHT : 0);
    const minHeight = 20; // Minimální výška okna
    const maxHeight = availableSpace - minHeight;

    let newTopHeight = Math.min(maxHeight, Math.max(minHeight, startTopHeight + deltaPercent));
    let newBottomHeight = availableSpace - newTopHeight;

    // Aplikovat změny pouze pokud jsou v povoleném rozsahu
    if (newBottomHeight >= minHeight && newBottomHeight <= maxHeight) {
        topHeight = newTopHeight;
        bottomHeight = newBottomHeight;
        updateHeights();
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        updateHeights();
    }
});

function adjustHeightsForTopPanel(isOpen) {
    if (isOpen) {
        originalTopHeight = topHeight;
        originalBottomHeight = bottomHeight;
        const programList = document.getElementById('programList');
        const items = programList.children;
        // Konstanty pro výpočet výšky
        const controlsHeight = 45; // Výška panelu s ovládacími prvky
        const itemPadding = 10;    // Padding pro položky
        // Výpočet skutečné šířky dostupné pro položky
        const availableWidth = window.innerWidth - 150; // Odečteme prostor pro controls
        const itemWidth = 150;      // Přibližná šířka jedné položky
        const itemsPerRow = Math.floor(availableWidth / itemWidth);
        const rows = Math.ceil(items.length / itemsPerRow) || 1;
        // Vypočítáme celkovou výšku - pokud je jeden řádek, použijeme controlsHeight
        const panelHeight = rows === 1 ? controlsHeight : controlsHeight * rows;
        topPanel.style.height = `${panelHeight}px`;
        container.style.marginTop = `${panelHeight}px`;
        const reduction = (panelHeight / window.innerHeight) * 100;
        const ratio = topHeight / (topHeight + bottomHeight);
        const availableSpace = 100 - reduction;
        topHeight = availableSpace * ratio;
        bottomHeight = availableSpace * (1 - ratio);
    } else {
        if (originalTopHeight && originalBottomHeight) {
            topHeight = originalTopHeight;
            bottomHeight = originalBottomHeight;
        }
        container.style.marginTop = '0';
    }
    updateHeights();
}

window.toggleTopPanel = function() {
    const isOpen = topPanel.classList.toggle('open');
    adjustHeightsForTopPanel(isOpen);
}

window.toggleLeftPanel = function() {
    leftPanel.classList.toggle('open');
}

window.toggleRightPanel = function() {
    rightPanel.classList.toggle('open');
}

lpButton.addEventListener('click', toggleLeftPanel);
ppButton.addEventListener('click', toggleRightPanel);

document.addEventListener('click', (e) => {
    if (leftPanel.classList.contains('open') &&
        !leftPanel.contains(e.target) &&
        e.target !== lpButton) {
        toggleLeftPanel();
    }
    if (rightPanel.classList.contains('open') &&
        !rightPanel.contains(e.target) &&
        e.target !== ppButton) {
        toggleRightPanel();
    }
});

const freezeButton = document.getElementById('freezeButton');
let isPanelFrozen = false;
let activeProgram = null;

freezeButton.addEventListener('click', () => {
    isPanelFrozen = !isPanelFrozen;
    freezeButton.classList.toggle('active');
});

function processAndDisplayCode(programText) {
    editorTextarea.value = programText;
    const parsedBlocks = cncParser.parseProgram(programText);

    // Zachovat přesně stejný text v obou oknech
    parserTextarea.value = programText;

    updateLineNumbers(editorTextarea, editorLineNumbers);
    updateLineNumbers(parserTextarea, parserLineNumbers);
}

// Opravit event listener pro soubory
fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const programList = document.getElementById('programList');
    programList.innerHTML = '';

    files.forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (['mpf', 'spf', 'nc', 'cnc'].includes(ext)) {
            const programItem = document.createElement('div');
            programItem.className = 'program-item';
            programItem.textContent = file.name;

            const reader = new FileReader();
            reader.onload = function(event) {
                const content = event.target.result;
                programItem.onclick = () => {
                    editorTextarea.value = content;
                    parserTextarea.value = content;

                    updateLineNumbers(editorTextarea, editorLineNumbers);
                    updateLineNumbers(parserTextarea, parserLineNumbers);

                    if (activeProgram) {
                        activeProgram.classList.remove('active');
                    }
                    programItem.classList.add('active');
                    activeProgram = programItem;

                    if (!isPanelFrozen) {
                        toggleTopPanel();
                    }
                };
            };
            reader.readAsText(file);

            programList.appendChild(programItem);
        }
    });

    if (programList.children.length > 0) {
        topPanel.classList.add('open');
        adjustHeightsForTopPanel(true);
    }
});

// Přidat po inicializaci cncParser
let parseTimeout;
editorTextarea.addEventListener('input', () => {
    // Debounce parsování pro lepší výkon
    clearTimeout(parseTimeout);
    parseTimeout = setTimeout(() => {
        const programText = editorTextarea.value;
        const parsedBlocks = cncParser.parseProgram(programText);
        parserTextarea.value = parsedBlocks
            .map(block => cncParser.getFormattedBlock(block))
            .join('\n');
        updateLineNumbers(parserTextarea, parserLineNumbers);
    }, 300); // 300ms debounce
});

// Funkce pro aktualizaci čísel řádků
function updateLineNumbers(textarea, numberContainer) {
    const lines = textarea.value.split('\n');
    const lineCount = lines.length;
    const numbers = [];

    for (let i = 0; i < lineCount; i++) {
        // Vždy zobrazit pouze pořadové číslo řádku
        numbers.push(`<div data-line="${i + 1}" class="line-number">${i + 1}</div>`);
    }

    numberContainer.innerHTML = numbers.join('');
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
    Array.from(numberContainer.children).forEach(div => {
        div.style.height = `${lineHeight}px`;
    });

    syncScroll(textarea, numberContainer);
}

// Funkce pro synchronizaci scrollování
function syncScroll(textarea, lineNumbers) {
    lineNumbers.scrollTop = textarea.scrollTop;
}

// Přidat event listenery pro scroll
parserTextarea.addEventListener('scroll', () => syncScroll(parserTextarea, parserLineNumbers));
editorTextarea.addEventListener('scroll', () => syncScroll(editorTextarea, editorLineNumbers));

// Přesunout definici funkce getClickedLineNumber před její použití
function getClickedLineNumber(textarea, event) {
    const rect = textarea.getBoundingClientRect();
    const scrollTop = textarea.scrollTop;
    const lineHeight = 24;
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop);

    // Upravený výpočet pozice
    const y = event.clientY - rect.top + scrollTop - paddingTop;
    const lineNumber = Math.ceil(y / lineHeight);

    const lines = textarea.value.split('\n');
    return Math.max(1, Math.min(lineNumber, lines.length));
}

// Přidat definici funkce addLineHighlight před její použití
function addLineHighlight(textarea, lineNumber) {
    const highlightElement = document.createElement('div');
    highlightElement.className = 'line-highlight';
    const lineHeight = 24; // Pevná výška řádku 1.5rem = 24px
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop);
    const top = (lineNumber - 1) * lineHeight + paddingTop;
    highlightElement.style.top = `${top}px`;
    textarea.parentElement.appendChild(highlightElement);
}

function scrollToLine(textarea, lineNumber, forceCenter = false) {
    // Centrovat v parseru a také když je vyžádáno force center
    if (textarea === parserTextarea || forceCenter) {
        const lineHeight = 24;
        const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop);
        const targetPosition = (lineNumber - 1) * lineHeight + paddingTop;
        const centerOffset = (textarea.clientHeight - lineHeight) / 2;
        textarea.scrollTop = targetPosition - centerOffset;
    }
}

function synchronizeLines(sourceTextarea, targetTextarea, sourceLine) {
    // Odstranit předchozí zvýraznění
    document.querySelectorAll('.line-numbers div.active, .line-highlight').forEach(el => {
        el.classList.remove('active');
        if (el.classList.contains('line-highlight')) {
            el.remove();
        }
    });

    // Zvýraznit řádky v obou oknech
    const lines = sourceTextarea.value.split('\n');
    if (sourceLine > 0 && sourceLine <= lines.length) {
        // Zvýraznit čísla řádků
        sourceTextarea.parentElement.querySelector(`.line-numbers div[data-line="${sourceLine}"]`)?.classList.add('active');
        targetTextarea.parentElement.querySelector(`.line-numbers div[data-line="${sourceLine}"]`)?.classList.add('active');

        // Přidat zvýraznění řádků
        addLineHighlight(sourceTextarea, sourceLine);
        addLineHighlight(targetTextarea, sourceLine);

        // Upravená logika centrování
        if (sourceTextarea === parserTextarea) {
            // Když klikneme v parseru, centrujeme oba editory
            scrollToLine(parserTextarea, sourceLine, true);
            scrollToLine(editorTextarea, sourceLine, true);
        } else {
            // Když klikneme v editoru, centrujeme jen parser
            scrollToLine(parserTextarea, sourceLine, true);
        }
    }
}

// Sjednocené event listenery pro textareas a čísla řádků
parserTextarea.addEventListener('click', (e) => {
    const line = getClickedLineNumber(parserTextarea, e);
    synchronizeLines(parserTextarea, editorTextarea, line);
});

editorTextarea.addEventListener('click', (e) => {
    const line = getClickedLineNumber(editorTextarea, e);
    synchronizeLines(editorTextarea, parserTextarea, line);
});

parserLineNumbers.addEventListener('click', (e) => {
    if (e.target.matches('div[data-line]')) {
        const line = parseInt(e.target.dataset.line);
        synchronizeLines(parserTextarea, editorTextarea, line);
    }
});

editorLineNumbers.addEventListener('click', (e) => {
    if (e.target.matches('div[data-line]')) {
        const line = parseInt(e.target.dataset.line);
        synchronizeLines(editorTextarea, parserTextarea, line);
    }
});

// Upravit event listener pro změnu velikosti okna
window.addEventListener('resize', () => {
    updateHeights();
    if (topPanel.classList.contains('open')) {
        adjustHeightsForTopPanel(true);
    }
});

window.addEventListener('resize', updateHeights);

document.addEventListener('DOMContentLoaded', function() {
    // Přidat event listener na editor-label pro otevření horního panelu
    const editorLabel = document.querySelector('.editor-label');
    if (editorLabel) {
        editorLabel.addEventListener('click', toggleTopPanel);
    }

    // Přidat event listener na close button v horním panelu
    const topPanelCloseBtn = topPanel.querySelector('.close-button');
    if (topPanelCloseBtn) {
        topPanelCloseBtn.addEventListener('click', toggleTopPanel);
    }

    // Přidat event listenery pro zavírací tlačítka bočních panelů
    const leftPanelCloseBtn = leftPanel.querySelector('.close-button');
    const rightPanelCloseBtn = rightPanel.querySelector('.close-button');

    if (leftPanelCloseBtn) {
        leftPanelCloseBtn.addEventListener('click', toggleLeftPanel);
    }

    if (rightPanelCloseBtn) {
        rightPanelCloseBtn.addEventListener('click', toggleRightPanel);
    }

    // Inicializovat číslování řádků
    updateLineNumbers(editorTextarea, editorLineNumbers);
    updateLineNumbers(parserTextarea, parserLineNumbers);
});

updateHeights();
