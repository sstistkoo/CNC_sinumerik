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
        this.lastGCode = '1';
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
        return (line.includes('G0') || line.includes('G1') ||
                line.includes('G2') || line.includes('G3')) &&
               (/[XZ]=?[-\d.()\s+R\d+*/]+/.test(trimmedLine)) &&
               !/^;/.test(trimmedLine) &&
               !/MSG/.test(trimmedLine);
    }

    parseMotion(line) {
        try {
            // Detekce G90/G91
            if (line.includes('G90')) this.activeMotion = 'G90';
            if (line.includes('G91')) this.activeMotion = 'G91';

            // Extrakce souřadnic
            const xMatch = line.match(/X\s*=?\s*([-()\d.+\/*\sR\d]+)/);
            const zMatch = line.match(/Z\s*=?\s*([-()\d.+\/*\sR\d]+)/);

            // Uchovat předchozí pozice
            const prevX = this.currentPosition.X;
            const prevZ = this.currentPosition.Z;

            // Pomocná funkce pro vyhodnocení výrazu s čištěním
            const evalCoord = (expr) => {
                if (!expr) return null;
                const cleaned = expr.replace(/^\((.*)\)$/, '$1'); // odstranit závorky
                return this.evaluateExpression(cleaned);
            };

            // Vypočítat nové pozice
            let newX = prevX;
            let newZ = prevZ;

            if (xMatch) {
                const xValue = evalCoord(xMatch[1]);
                if (xValue !== null) {
                    newX = this.activeMotion === 'G90' ? xValue : prevX + xValue;
                }
            }

            if (zMatch) {
                const zValue = evalCoord(zMatch[1]);
                if (zValue !== null) {
                    newZ = this.activeMotion === 'G90' ? zValue : prevZ + zValue;
                }
            }

            // Uložit nové pozice
            this.currentPosition = { X: newX, Z: newZ };
            this.absolutePosition = { X: newX, Z: newZ };

            // Debug log
            console.log(`Pohyb ${this.activeMotion}: ${line.trim()} -> X${newX.toFixed(3)} Z${newZ.toFixed(3)}`);

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
