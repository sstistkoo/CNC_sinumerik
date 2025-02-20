export class CNCParser {
    constructor(rParameters) {
        this.rParameters = rParameters;
        this.reset();
    }

    reset() {
        this.currentLine = 0;
        this.programBlocks = [];
        this.currentPosition = { X: 0, Z: 0 };
        this.absolutePosition = { X: 0, Z: 0 };
        this.activeMotion = 'G90';
        this.lastGCode = 'G1';
        this.modalG = 'G1';
        this.lastFeed = null;     // Poslední posuv
        this.lastSpeed = null;    // Poslední otáčky
        this.lastMCodes = [];     // Poslední M funkce
        this.lastCR = null;       // Poslední CR hodnota
        this.debug = true;  // Pro sledování výpočtů
    }

    async parseProgram(programText) {
        this.reset();
        const lines = programText.split('\n');
        const result = [];
        let l105Params = [];

        // Načíst L105 parametry
        if (lines.some(line => line.includes('L105'))) {
            const l105Text = await this.loadL105Text();
            if (l105Text) {
                l105Params = this.rParameters?.parseL105(l105Text) || [];
                console.log('Načtené L105 parametry:', l105Params);
            }
        }

        // Zpracovat řádky
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Přidat originální řádek
            result.push({
                lineNumber: i + 1,
                originalLine: lines[i],
                type: 'original'
            });

            // Zpracovat L105 parametry - zkrácený výstup
            if (line.includes('L105')) {
                result.push({
                    lineNumber: i + 1,
                    originalLine: '    ; → R parametry načteny',
                    type: 'interpreted'
                });
                continue;
            }

            // Zpracovat pohybové příkazy
            if (this.hasCoordinates(line)) {
                const parsedMotion = this.parseMotion(line);
                if (parsedMotion) {
                    result.push({
                        lineNumber: i + 1,
                        originalLine: parsedMotion.interpreted,
                        type: 'interpreted'
                    });
                }
            }
        }

        return result;
    }

    async loadL105Text() {
        try {
            const response = await fetch('./data/K1_03_4431.json');
            const data = await response.json();
            const l105 = data.programs.find(p => p.name === 'L105.SPF');
            return l105?.code.join('\n');
        } catch (error) {
            console.error('Chyba při načítání L105:', error);
            return null;
        }
    }

    hasCoordinates(line) {
        const trimmedLine = line.trim();

        // Kontrola zda není komentář nebo MSG
        if (/^;/.test(trimmedLine) || /MSG/.test(trimmedLine)) {
            return false;
        }

        // Vylepšená detekce souřadnic - zachytí všechny formáty
        return (
            // Standardní G-kód s koordináty
            /G[0123].*[XZ]/.test(trimmedLine) ||
            // Samostatné X/Z souřadnice na začátku řádku
            /^[XZ][-\d.]+/.test(trimmedLine) ||
            // X/Z s výrazem nebo R-parametrem
            /[XZ]\s*=?\s*[-\d.R()+\/*\s]+/.test(trimmedLine)
        );
    }

    parseMotion(line) {
        try {
            // Extrahovat informace z řádku
            const blockMatch = line.match(/^N(\d+)/);
            const blockNum = blockMatch ? blockMatch[1] : '';

            // Detekce G kódů
            const gCodes = line.match(/G[0-4]\d?/g) || [];
            if (gCodes.length > 0) {
                this.lastGCode = gCodes[gCodes.length - 1];
            }

            // Detekce G90/G91 pro interní výpočty
            const originalMotion = line.includes('G91') ? 'G91' : 'G90';
            if (line.includes('G90')) this.activeMotion = 'G90';
            if (line.includes('G91')) this.activeMotion = 'G91';

            // Zachovat předchozí hodnoty
            const prevX = this.currentPosition.X;
            const prevZ = this.currentPosition.Z;

            // Aktualizace parametrů
            const feedMatch = line.match(/F([\d.]+)/);
            if (feedMatch) this.lastFeed = feedMatch[1];

            const speedMatch = line.match(/S=?([\d.]+)/);
            if (speedMatch) this.lastSpeed = speedMatch[1];

            const mCodes = line.match(/M\d+/g);
            if (mCodes) this.lastMCodes = mCodes;

            const crMatch = line.match(/CR=([\d.]+)/);
            if (crMatch) this.lastCR = crMatch[1];

            // Zpracování souřadnic
            const xMatch = line.match(/X\s*=?\s*([-\d.R()+\/*\s]+)/);
            const zMatch = line.match(/Z\s*=?\s*([-\d.R()+\/*\s]+)/);

            // Výpočet nových pozic
            let newX = prevX;
            let newZ = prevZ;

            // Výpočet pozic podle aktuálního G90/G91 módu
            if (xMatch) {
                const xValue = this.evaluateExpression(xMatch[1]);
                newX = this.activeMotion === 'G90' ? xValue : prevX + xValue;
            }
            if (zMatch) {
                const zValue = this.evaluateExpression(zMatch[1]);
                newZ = this.activeMotion === 'G91' ? prevZ + zValue : zValue;
            }

            // Aktualizovat pozice
            this.currentPosition = { X: newX, Z: newZ };
            this.absolutePosition = { X: newX, Z: newZ };

            // Sestavit řádek - vždy v G90 formátu
            let interpreted = '    ; → ';

            // Číslo bloku
            if (blockNum) interpreted += `N${blockNum} `;

            // Vždy použít G90 v interpretovaném výstupu
            interpreted += `G90 ${this.lastGCode} `;

            // Absolutní souřadnice
            interpreted += `X${this.absolutePosition.X.toFixed(3)} Z${this.absolutePosition.Z.toFixed(3)}`;

            // Přidat další parametry
            if (crMatch) interpreted += ` CR=${crMatch[1]}`;
            if (this.lastFeed) interpreted += ` F${this.lastFeed}`;
            if (this.lastSpeed) interpreted += ` S=${this.lastSpeed}`;
            if (this.lastMCodes.length > 0) interpreted += ` ${this.lastMCodes.join(' ')}`;

            return {
                X: this.absolutePosition.X,
                Z: this.absolutePosition.Z,
                interpreted: interpreted
            };

        } catch (error) {
            console.error('Chyba parsování:', line, error);
            return null;
        }
    }

    evaluateExpression(expr) {
        if (!expr) return 0;
        try {
            // Předčištění výrazu
            let cleanExpr = expr
                .replace(/\s+/g, '')
                // Nahradit R-parametry jejich hodnotami
                .replace(/R(\d+)/g, (_, num) => {
                    const value = this.rParameters?.get(num);
                    if (value === undefined) {
                        console.warn(`Chybí hodnota pro R${num}, používám 0`);
                        return '0';
                    }
                    return value.toString();
                });

            // Vypočítat výsledek a zaokrouhlit na 3 desetinná místa
            const result = Function('"use strict";return (' + cleanExpr + ')')();
            return parseFloat(result.toFixed(3));
        } catch (error) {
            console.error('Chyba při vyhodnocování výrazu:', expr, error);
            return 0;
        }
    }

    getParameter(num) {
        const params = {
            '04': 462.2 - 40,
            '25': 151.0,
        };
        return params[num] || 0;
    }
}
