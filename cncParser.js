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

            // Zpracovat L105 parametry
            if (line.includes('L105')) {
                l105Params.forEach(p => {
                    result.push({
                        lineNumber: i + 1,
                        originalLine: `    ; → R${p.num} = ${p.value.toFixed(3)}`,
                        type: 'interpreted'
                    });
                });
                continue;
            }

            // Zpracovat pohybové příkazy
            if (this.hasCoordinates(line)) {
                const coords = this.parseMotion(line);
                if (coords) {
                    result.push({
                        lineNumber: i + 1,
                        originalLine: `    ; → X${coords.X.toFixed(3)} Z${coords.Z.toFixed(3)}`,
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
            // Zachovat předchozí pozice
            const prevX = this.currentPosition.X;
            const prevZ = this.currentPosition.Z;

            // Aktualizace G kódů
            const gMatch = line.match(/G([0123])/);
            if (gMatch) {
                this.lastGCode = `G${gMatch[1]}`;
            }
            if (line.includes('G90')) this.activeMotion = 'G90';
            if (line.includes('G91')) this.activeMotion = 'G91';

            // Extrakce souřadnic s lepší detekcí
            const xMatch = line.match(/X\s*=?\s*([-\d.R()+\/*\s]+)/);
            const zMatch = line.match(/Z\s*=?\s*([-\d.R()+\/*\s]+)/);

            // Výpočet nových pozic
            let newX = prevX;
            let newZ = prevZ;

            // Zpracování podle G90/G91 módu
            if (xMatch) {
                const xValue = this.evaluateExpression(xMatch[1]);
                newX = this.activeMotion === 'G90' ? xValue : prevX + xValue;
            }
            if (zMatch) {
                const zValue = this.evaluateExpression(zMatch[1]);
                newZ = this.activeMotion === 'G91' ? prevZ + zValue : zValue;
            }

            // Debug výpis
            console.log(`Řádek: ${line}`);
            console.log(`Mód: ${this.activeMotion}, G: ${this.lastGCode}`);
            console.log(`Předchozí: X${prevX.toFixed(3)} Z${prevZ.toFixed(3)}`);
            console.log(`Delta: X${xMatch ? this.evaluateExpression(xMatch[1]).toFixed(3) : 'none'} Z${zMatch ? this.evaluateExpression(zMatch[1]).toFixed(3) : 'none'}`);
            console.log(`Nové: X${newX.toFixed(3)} Z${newZ.toFixed(3)}`);

            // Aktualizace pozic
            this.currentPosition = { X: newX, Z: newZ };
            this.absolutePosition = { X: newX, Z: newZ };

            return this.absolutePosition;
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
