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
        this.speedFormat = 'S';     // Změněno z 'S=' na 'S'
        this.lastSpeedValue = null;  // Hodnota otáček
        this.spindleActive = false;  // Přidat sledování stavu vřetene
    }

    async parseProgram(programText) {
        this.reset();
        const lines = programText.split('\n');
        const result = [];
        let isL105Processing = false;

        // Reset parametrů na počáteční hodnoty
        this.rParameters.resetToOriginal();

        // Nejdřív zkontrolovat jestli máme L105 v programu
        if (lines.some(line => /L105\s*;/.test(line))) {
            console.log('Detekován L105 podprogram - načítám parametry...');
            const l105Text = await this.loadL105Text();
            if (l105Text) {
                try {
                    // Načíst a parsovat parametry z L105
                    const params = await this.rParameters?.parseL105(l105Text);
                    console.log('Načtené parametry z L105:', params);

                    if (!params || params.length === 0) {
                        console.error('Nepodařilo se načíst parametry z L105');
                    }
                } catch (error) {
                    console.error('Chyba při parsování L105:', error);
                }
            }
        }

        // Zpracovat řádky programu
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Ignorovat prázdné řádky
            if (!line) continue;

            // Přidat originální řádek
            result.push({
                lineNumber: i + 1,
                originalLine: lines[i],
                type: 'original'
            });

            // Detekovat začátek L105
            if (line.includes(';PODPROGRAM: L105.SPF')) {
                isL105Processing = true;
                result.push({
                    lineNumber: i + 1,
                    originalLine: '    ; → R parametry načteny',
                    type: 'interpreted'
                });
                continue;
            }

            // Speciální zpracování pro L105
            if (isL105Processing) {
                // Interpretovat pouze M-kódy a konce programu v L105
                if (line.match(/^N\d+\s*M\d+/)) {
                    const mMatch = line.match(/M(\d+)/);
                    if (mMatch) {
                        result.push({
                            lineNumber: i + 1,
                            originalLine: `    ; → M${mMatch[1]}`,
                            type: 'interpreted'
                        });
                    }
                }
                // Detekovat přiřazení R-parametrů a výpočty
                else if (line.match(/R\d+\s*=/)) {
                    const assignments = this.findParameterAssignments(line);
                    for (const [num, expr] of assignments) {
                        try {
                            const value = this.rParameters.evaluateExpression(expr);
                            this.rParameters.set(num, value);
                            console.log(`Nastavuji R${num} = ${value}`);
                        } catch (error) {
                            console.error(`Chyba při výpočtu R${num}:`, error);
                        }
                    }
                }
                continue;
            }

            // Zpracovat změny R-parametrů v každém řádku
            const assignments = this.findParameterAssignments(line);
            if (assignments.length > 0) {
                for (const [num, expr] of assignments) {
                    const value = this.rParameters.evaluateExpression(expr);
                    this.rParameters.set(num, value);
                    console.log(`Změna parametru R${num} = ${value}`);
                }
            }

            // Detekovat a zpracovat L-příkazy (podprogramy)
            if (line.match(/^N\d*\s*L\d+/)) {
                const lMatch = line.match(/L(\d+)/);
                if (lMatch) {
                    const lNumber = lMatch[1];
                    if (lNumber === '105') {
                        // Speciální zpracování pro L105 - vypiš info o načtení parametrů
                        const params = this.rParameters.getAll();
                        if (params && params.length > 0) {
                            result.push({
                                lineNumber: i + 1,
                                originalLine: '    ; → R parametry načteny z L105',
                                type: 'interpreted'
                            });
                        }
                    } else {
                        // Pro ostatní L-příkazy
                        result.push({
                            lineNumber: i + 1,
                            originalLine: `    ; → Volání podprogramu L${lNumber}`,
                            type: 'interpreted'
                        });
                    }
                    continue;
                }
            }

            // Zpracovat L105
            if (line.includes('L105')) {
                // Získat aktuální hodnoty parametrů
                const currentParams = this.rParameters.getAll();
                console.log('Aktuální parametry:', currentParams);

                if (currentParams && currentParams.length > 0) {
                    // Seřadit parametry podle čísel
                    const sortedParams = currentParams.sort((a, b) => {
                        return parseInt(a.num) - parseInt(b.num);
                    });

                    result.push({
                        lineNumber: i + 1,
                        originalLine: '    ; → R parametry načteny',
                        type: 'interpreted'
                    });
                } else {
                    result.push({
                        lineNumber: i + 1,
                        originalLine: '    ; → Chyba: Parametry nebyly načteny',
                        type: 'interpreted'
                    });
                }
                continue;
            }

            // Detekce otáček pro všechny řádky
            const speedMatch = line.match(/S=?(\d+(?:\.\d+)?)/);
            if (speedMatch) {
                this.lastSpeedValue = speedMatch[1];
                this.speedFormat = 'S';
            }

            // Zpracovat M-kódy a samostatné otáčky
            if (!this.hasCoordinates(line) && (line.includes('M') || speedMatch)) {
                const mCodes = line.match(/M\d+/g) || [];
                if (mCodes.length > 0 || (speedMatch && this.spindleActive)) {
                    let interpreted = '    ; → ';
                    if (mCodes.length > 0) {
                        // Zpracovat každý M-kód
                        mCodes.filter(code => !['M7', 'M8'].includes(code))
                              .forEach(code => {
                                  interpreted += `${code} `;
                                  this.processMCode(code);
                              });
                    }
                    // Přidat otáčky pouze pokud je vřeteno aktivní
                    if (this.lastSpeedValue && this.spindleActive) {
                        interpreted += `S${this.lastSpeedValue}`;
                    }
                    result.push({
                        lineNumber: i + 1,
                        originalLine: interpreted.trim(),
                        type: 'interpreted'
                    });
                }
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

            // Vylepšená detekce otáček - zachytí všechny formáty
            const speedMatch = line.match(/S=?(\d+(?:\.\d+)?)/);
            if (speedMatch) {
                this.lastSpeedValue = speedMatch[1];
                this.speedFormat = 'S';  // Vždy použít formát bez '='
            }

            // Filtrovat M-kódy - vynechat M7 a M8
            const mCodes = line.match(/M\d+/g);
            if (mCodes) {
                this.lastMCodes = mCodes.filter(code => !['M7', 'M8'].includes(code));
            }

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
            // Upravený výstup otáček podle původního formátu
            if (this.lastSpeedValue) {
                interpreted += ` ${this.speedFormat}${this.lastSpeedValue}`;
            }
            // Přidat M-kódy kromě M7 a M8
            if (this.lastMCodes.length > 0) {
                interpreted += ` ${this.lastMCodes.join(' ')}`;
            }

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
            // Předčištění výrazu a zpracování R-parametrů
            let cleanExpr = expr
                .replace(/\s+/g, '')
                .replace(/R(\d+)/g, (_, num) => {
                    const value = this.rParameters?.get(num);
                    if (value === undefined) {
                        // Zkusit získat hodnotu z getParameter
                        const paramValue = this.getParameter(num);
                        if (paramValue !== 0) {
                            return paramValue.toString();
                        }
                        console.warn(`Chybí hodnota pro R${num}, používám 0`);
                        return '0';
                    }
                    return value.toString();
                });

            // Debug výpis pro kontrolu výpočtu
            if (this.debug) {
                console.log('Výraz:', expr);
                console.log('Čistý výraz:', cleanExpr);
            }

            // Výpočet
            const result = Function('"use strict";return (' + cleanExpr + ')')();
            return parseFloat(result.toFixed(3));
        } catch (error) {
            console.error('Chyba při vyhodnocování výrazu:', expr, error);
            return 0;
        }
    }

    getParameter(num) {
        // Rozšířit sadu parametrů
        const params = {
            '04': 462.2 - 40,  // 422.2
            '25': 151.0,
            '57': 517.5 - 40,  // 477.5 pro X=R57+15
        };
        return params[num] || 0;
    }

    findParameterAssignments(line) {
        const assignments = [];
        // Regular expression pro zachycení všech typů přiřazení:
        // - R44=25.326 (přímé přiřazení)
        // - R47=(82-10) (výraz v závorkách)
        // - R54=R54*R69 (výraz s R-parametry)
        const regex = /R(\d+)\s*=\s*(\([^)]+\)|[-\d.R()+\/*\s]+)(?=\s+R\d+|$|;|$)/g;

        let match;
        while ((match = regex.exec(line)) !== null) {
            const [_, num, expr] = match;
            // Vyčistit výraz od nadbytečných mezer
            const cleanExpr = expr.trim();
            console.log(`Nalezeno přiřazení: R${num} = ${cleanExpr}`);
            assignments.push([num, cleanExpr]);
        }

        if (assignments.length > 1) {
            console.log(`Nalezeno více přiřazení na řádku: ${line}`);
            console.log('Přiřazení:', assignments);
        }

        return assignments;
    }

    processMCode(code) {
        switch (code) {
            case 'M3':
            case 'M4':
                this.spindleActive = true;
                break;
            case 'M5':
                this.spindleActive = false;
                this.lastSpeedValue = null; // Reset otáček
                break;
        }
    }
}
