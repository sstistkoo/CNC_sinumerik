import { CNCParser } from './cncParser.js';
import { RParameters } from './RParameters.js';  // Přidat import

// Přidat na začátek souboru, před vytvoření CNCParser
const rParameters = new RParameters();
const cncParser = new CNCParser(rParameters);

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

// Přidat nové konstanty pro číslování řádků
const parserLineNumbers = document.getElementById('parserLineNumbers');
const editorLineNumbers = document.getElementById('editorLineNumbers');

// Přidat nové konstanty pro tlačítka
const loadButton = document.getElementById('loadButton');
const saveButton = document.getElementById('saveButton');

// Přidat po deklaraci konstant
const programBackups = new Map(); // Nová mapa pro zálohy kódu

function backupProgram(name, code) {
    if (!name) return;
    programBackups.set(name, Array.isArray(code) ? code : code.split('\n'));
}

function restoreProgram(name) {
    return programBackups.get(name) || [];
}

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

// Upravit funkci adjustHeightsForTopPanel pro menší výšku
function adjustHeightsForTopPanel(isOpen) {
    if (isOpen) {
        originalTopHeight = topHeight;
        originalBottomHeight = bottomHeight;
        const programList = document.getElementById('programList');
        const items = programList.children;

        // Konstanty pro výpočet výšky
        const controlsHeight = 45; // Základní výška panelu
        const itemHeight = 35;     // Výška jednoho programu
        const padding = 10;        // Padding

        // Výpočet řádků
        const availableWidth = window.innerWidth - 150;
        const itemWidth = 150;
        const itemsPerRow = Math.floor(availableWidth / itemWidth);
        const rows = Math.ceil(items.length / itemsPerRow) || 1;

        // Nová výška panelu - max 2 řádky
        const maxRows = 2;
        const actualRows = Math.min(rows, maxRows);
        const panelHeight = controlsHeight + (actualRows > 1 ? (itemHeight + padding) : 0);

        topPanel.style.height = `${panelHeight}px`;
        container.style.marginTop = `${panelHeight}px`;

        // Přepočet výšek editorů
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
        // Odstranit visibility property
        topPanel.style.removeProperty('visibility');
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

// Upravit funkci processAndDisplayCode
function processAndDisplayCode(programText, programName) {
    // Nejdřív uložit aktuální obsah
    if (activeProgram) {
        const currentCode = editorTextarea.value.split('\n');
        programCodes.set(activeProgram.textContent, currentCode);
        console.debug('Ukládám kód programu:', activeProgram.textContent, currentCode.length);
    }

    // Zpracovat nový kód
    let text = '';
    if (Array.isArray(programText)) {
        text = programText.join('\n');
    } else if (typeof programText === 'string') {
        text = programText;
    }

    // Uložit nový kód
    if (programName) {
        const code = text.split('\n');
        programCodes.set(programName, code);
        console.debug('Nastavuji kód programu:', programName, code.length);
    }

    // Zobrazit kód
    parserTextarea.value = text;
    editorTextarea.value = text;

    updateLineNumbers(editorTextarea, editorLineNumbers);
    updateLineNumbers(parserTextarea, parserLineNumbers);
}

// Upravit načítání souborů
fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    const programList = document.getElementById('programList');
    programList.innerHTML = '';
    programStorage.clear();

    console.log('Načítání CNC souborů:', files.map(f => f.name).join(', '));

    files.forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (['mpf', 'spf', 'nc', 'cnc'].includes(ext)) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const content = event.target.result;
                const lines = content.split('\n');
                console.log(`Načítám program ${file.name}:`, lines.length, 'řádků');

                // Uložit program do úložiště
                programStorage.save(file.name, lines);

                // Vytvořit DOM element
                const programItem = document.createElement('div');
                programItem.className = 'program-item';
                programItem.textContent = file.name;

                programItem.onclick = () => {
                    // Uložit aktuální program před přepnutím
                    if (activeProgram) {
                        const currentCode = editorTextarea.value.split('\n');
                        programStorage.save(activeProgram.textContent, currentCode);
                    }

                    // Načíst nový program
                    const code = programStorage.load(file.name);
                    const text = code.join('\n');

                    editorTextarea.value = text;
                    parserTextarea.value = text;

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

                programList.appendChild(programItem);

                // Aktivovat první program po načtení
                if (programList.children.length === 1) {
                    programItem.click();
                }
            };
            reader.readAsText(file);
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
    clearTimeout(parseTimeout);
    parseTimeout = setTimeout(() => {
        const programText = editorTextarea.value;
        // Zpracovat text přes parser
        const parsedBlocks = cncParser.parseProgram(programText);

        // Sestavit výsledný text včetně interpretovaných řádků
        const formattedText = parsedBlocks
            .map(block => {
                // Přidat odsazení pro interpretované řádky
                if (block.type === 'interpreted') {
                    return '    ' + block.originalLine;
                }
                return block.originalLine;
            })
            .join('\n');

        // Aktualizovat horní textareu
        parserTextarea.value = formattedText;

        // Aktualizovat číslování řádků
        updateLineNumbers(parserTextarea, parserLineNumbers);
    }, 300);
});

// Funkce pro aktualizaci čísel řádků
function updateLineNumbers(textarea, numberContainer) {
    const lines = textarea.value.split('\n');
    const lineCount = lines.length;
    const numbers = [];

    for (let i = 0; i < lineCount; i++) {
        const line = lines[i];
        if (textarea === parserTextarea && line.startsWith('    ;')) {
            // Pro interpretované řádky v parseru přidat prázdný řádek
            numbers.push('<div class="line-number empty"></div>');
        } else {
            // Pro ostatní řádky přidat číslo
            numbers.push(`<div data-line="${i + 1}" class="line-number">${i + 1}</div>`);
        }
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

// Upravit funkci synchronizeLines
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

    // Přidat detekci L105
    const clickedLine = lines[sourceLine - 1];
    if (clickedLine && clickedLine.includes('L105')) {
        // Aktualizovat panel s R-parametry v prostředním okně
        const panel = document.getElementById('middleRParamsPanel');
        const content = panel.querySelector('.r-params-content');
        const params = rParameters.getAll();

        content.innerHTML = params.map(p => `
            <div class="r-param-row">
                <span>R${p.num}</span>
                <span>${p.value.toFixed(3)}</span>
            </div>
        `).join('');

        // Zobrazit panel
        panel.classList.remove('hidden');
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

// Funkce pro inicializaci R-parametrů - definovat PŘED DOMContentLoaded
function initRParams() {
    const midRParamsButton = document.getElementById('midRParamsButton');
    if (!midRParamsButton) return;

    const paramsPanel = midRParamsButton.querySelector('.middle-r-params');
    const paramsContent = paramsPanel?.querySelector('.r-params-content');
    const overlay = document.querySelector('.overlay');

    function updateParamsContent() {
        const params = rParameters.getAll();
        if (paramsContent) {
            paramsContent.innerHTML = params.map(p => `
                <div class="r-param-row">
                    <span>R${p.num}</span>
                    <span>${p.value.toFixed(3)}</span>
                </div>
            `).join('');
        }
    }

    // Handler pro tlačítko
    midRParamsButton.querySelector('button')?.addEventListener('click', (e) => {
        e.stopPropagation();
        console.debug('Otevírám R-parametry');
        updateParamsContent();
        paramsPanel?.classList.remove('hidden');
        overlay?.classList.add('visible');
    });

    // Handler pro zavírání
    paramsPanel?.querySelector('.close-button')?.addEventListener('click', (e) => {
        e.stopPropagation();
        paramsPanel?.classList.add('hidden');
        overlay?.classList.remove('visible');
    });

    // Handler pro overlay
    overlay?.addEventListener('click', () => {
        paramsPanel?.classList.add('hidden');
        overlay?.classList.remove('visible');
    });
}

// Jediný DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', function() {
    // Přidat event listener na editor-label pro otevření horního panelu
    const editorLabel = document.querySelector('.editor-label');
    if (editorLabel) {
        editorLabel.addEventListener('click', () => {
            // Přepínat třídu open místo visibility
            const isOpen = topPanel.classList.toggle('open');
            adjustHeightsForTopPanel(isOpen);
        });
    }

    // Přidat event listener na close button v horním panelu
    const topPanelCloseBtn = topPanel.querySelector('.close-button');
    if (topPanelCloseBtn) {
        topPanelCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Zavřít panel stejným způsobem jako tlačítko Prog.
            topPanel.classList.remove('open');
            adjustHeightsForTopPanel(false);
        });
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

    // Zavolat načtení programů
    loadDefaultProgram();

    // Inicializace R-parametrů - POUZE JEDNOU
    initRParams();
});

// Odstranit všechny staré handlery pro R-parametry
const oldHandlers = [
    'midRParamsButton',
    'rParamsButton',
    'rParamsPanel'
].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.replaceWith(element.cloneNode(true));
    }
});

async function loadDefaultProgram() {
    try {
        console.log('Načítám programy...');

        const response = await fetch('data/K1_03_4431.json');
        const fullProgram = await response.json();
        await loadProgramsFromJSON(fullProgram);

    } catch (error) {
        console.error('Chyba při načítání programů:', error);
    }
}

// Přepsat původní funkci loadProgramsFromJSON
async function loadProgramsFromJSON(data) {
    try {
        console.log('Načítání programů z JSON...');

        if (!data?.programs?.length) {
            throw new Error('JSON neobsahuje žádné programy');
        }

        // Vyčistit seznam a úložiště
        const programList = document.getElementById('programList');
        programList.innerHTML = '';
        programStorage.clear();

        // Nejdřív načteme všechny programy do úložiště
        data.programs.forEach(program => {
            const { name, code } = program;
            if (!name || !code) return;

            programStorage.save(name, code);
        });

        // Pak vytvoříme DOM elementy
        data.programs.forEach(program => {
            const { name } = program;
            if (!name) return;

            const item = document.createElement('div');
            item.className = 'program-item';
            item.textContent = name;
            item.onclick = createProgramClickHandler(item, program);

            programList.appendChild(item);
        });

        // Aktivovat první program
        const firstProgram = programList.querySelector('.program-item');
        if (firstProgram) {
            firstProgram.click();
        }

        topPanel.classList.add('open');
        adjustHeightsForTopPanel(true);

    } catch (error) {
        console.error('Chyba při načítání:', error);
    }
}

// Přepsat původní funkci pro ukládání
function saveProgramsToJSON() {
    try {
        // Uložit aktuální program
        if (activeProgram) {
            programStorage.save(
                activeProgram.textContent,
                editorTextarea.value
            );
        }

        // Vytvořit pole programů
        const programList = document.getElementById('programList');
        const programs = Array.from(programList.children).map(item => {
            const name = item.textContent;
            const code = programStorage.load(name);

            return {
                name: name,
                type: name.split('.').pop().toUpperCase(),
                description: `${name.endsWith('.MPF') ? 'Hlavní program' : 'Podprogram'} ${name}`,
                code: code
            };
        });

        // Debug výpis
        console.log('Programy k uložení:', programs.map(p => ({
            name: p.name,
            lines: p.code.length
        })));

        // Najít hlavní program
        const mainProgram = programs.find(p => p.name.endsWith('.MPF'));
        if (!mainProgram) throw new Error('Nenalezen hlavní program (*.MPF)');

        // Sestavit JSON
        const jsonData = {
            name: mainProgram.name.split('.')[0].replace(/^MPF_/, ''),
            description: "Kompletní program pro obrábění",
            programs: programs
        };

        // Uložit soubor
        const blob = new Blob([JSON.stringify(jsonData, null, 2)],
            { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${jsonData.name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Chyba při ukládání:', error);
    }
}

// Jednoduché úložiště pro kódy programů
const programStorage = {
    programs: new Map(),

    save(name, code) {
        if (!name) return;
        const lines = Array.isArray(code) ? [...code] :
                     typeof code === 'string' ? code.split('\n') : [];
        console.log(`Ukládám program ${name}:`, lines.length, 'řádků');
        this.programs.set(name, lines);
    },

    load(name) {
        const code = this.programs.get(name);
        console.log(`Načítám program ${name}:`, code?.length || 0, 'řádků');
        return code || [];
    },

    clear() {
        this.programs.clear();
        console.log('Úložiště vyčištěno');
    }
};

updateHeights();

// Nejprve odebrat všechny staré event listenery
document.getElementById('saveButton').removeEventListener('click', saveProgramsToJSON);

// Přidáme nový event listener na kliknutí na saveButton element (ne jQuery)
document.getElementById('saveButton').addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Save button clicked!');

    try {
        // Uložit aktuální program
        if (activeProgram) {
            const currentCode = editorTextarea.value.split('\n');
            programStorage.save(activeProgram.textContent, currentCode);
        }

        // Získat všechny programy
        const programList = document.getElementById('programList');
        const programs = Array.from(programList.children).map(item => {
            const name = item.textContent;
            const code = programStorage.load(name);

            return {
                name: name,
                type: name.split('.').pop().toUpperCase(),
                description: `${name.endsWith('.MPF') ? 'Hlavní program' : 'Podprogram'} ${name}`,
                code: code
            };
        });

        // Debug výpis
        programs.forEach(p => {
            console.log(`Program ${p.name}:`, p.code.length, 'řádků');
        });

        // Vytvořit a uložit JSON
        const mainProgram = programs.find(p => p.name.endsWith('.MPF'));
        if (!mainProgram) throw new Error('Nenalezen hlavní program (*.MPF)');

        const jsonData = {
            name: mainProgram.name.split('.')[0].replace(/^MPF_/, ''),
            description: "Kompletní program pro obrábění",
            programs: programs
        };

        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${jsonData.name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Soubor uložen:', jsonData.name, 'programů:', programs.length);

    } catch (error) {
        console.error('Chyba při ukládání:', error);
    }
});

updateHeights();

// Přidat event listenery pro nová tlačítka
loadButton.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const programData = JSON.parse(event.target.result);
                    await loadProgramsFromJSON(programData);
                } catch (error) {
                    console.error('Chyba při načítání programů:', error);
                }
            };
            reader.readAsText(file);
        }
    };

    input.click();
});

// Přidat globální proměnné pro ukládání kódů
const programCodes = new Map();

updateHeights();

// Upravit click handler pro program items
function createProgramClickHandler(item, program) {
    return () => {
        // Uložit aktuální program před přepnutím
        if (activeProgram) {
            const currentCode = editorTextarea.value.split('\n');
            programStorage.save(activeProgram.textContent, currentCode);
        }

        // Načíst nový program
        const code = programStorage.load(program.name);
        console.log(`Načítám program ${program.name}:`, code.length, 'řádků');

        // Nastavit kód do editoru
        editorTextarea.value = code.join('\n');

        // Spustit parsování
        const parsedBlocks = cncParser.parseProgram(code.join('\n'));
        const formattedText = parsedBlocks
            .map(block => block.type === 'interpreted' ? '    ' + block.originalLine : block.originalLine)
            .join('\n');

        // Nastavit parsovaný text do horního editoru
        parserTextarea.value = formattedText;

        // Aktualizovat číslování řádků
        updateLineNumbers(editorTextarea, editorLineNumbers);
        updateLineNumbers(parserTextarea, parserLineNumbers);

        // Aktualizovat aktivní program
        if (activeProgram) {
            activeProgram.classList.remove('active');
        }
        item.classList.add('active');
        activeProgram = item;

        // Skrýt panel pouze pokud není zamrzlý
        if (!isPanelFrozen) {
            toggleTopPanel();
        }
    };
}

// Přidat novou funkci pro ukládání CNC souboru
function saveCncFile(type = 'MPF') {
    if (!activeProgram) {
        console.warn('Není vybrán žádný program k uložení');
        return;
    }

    const code = editorTextarea.value;
    const originalName = activeProgram.textContent;
    const baseName = originalName.split('.')[0].replace(/^MPF_/, '');

    // Vytvořit název souboru podle typu
    const fileName = type === 'MPF' ?
        `MPF_${baseName}.MPF` :
        `${baseName}.SPF`;

    // Vytvořit a stáhnout soubor
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Uložen CNC soubor: ${fileName}`);
}

// Přidat event listener pro ukládání CNC souboru
document.getElementById('saveCncButton').addEventListener('click', () => {
    // Zobrazit dialog pro výběr typu souboru
    const type = confirm('Uložit jako hlavní program (OK) nebo podprogram (Cancel)?') ?
        'MPF' : 'SPF';
    saveCncFile(type);
});

updateHeights();

/* ...existing code... */

// Upravit event listener pro R tlačítko
document.getElementById('rParamsButton').addEventListener('click', () => {
    const params = rParameters.getAll();
    const panel = document.getElementById('rParamsPanel');
    const overlay = document.getElementById('rParamsOverlay');
    const content = panel.querySelector('.r-params-content');

    content.innerHTML = params.map(p => `
        <div class="r-param-row">
            <span>R${p.num}</span>
            <span>${p.value.toFixed(3)}</span>
        </div>
    `).join('');

    panel.classList.remove('hidden');
    overlay.classList.add('visible');
});

// Upravit event listener pro zavírání
document.querySelector('#rParamsPanel .close-button').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('rParamsPanel');
    const overlay = document.getElementById('rParamsOverlay');

    panel.classList.add('hidden');
    overlay.classList.remove('visible');
});

// Přidat event listener pro kliknutí na overlay
document.getElementById('rParamsOverlay').addEventListener('click', () => {
    const panel = document.getElementById('rParamsPanel');
    const overlay = document.getElementById('rParamsOverlay');

    panel.classList.add('hidden');
    overlay.classList.remove('visible');
});

/* ...existing code... */
