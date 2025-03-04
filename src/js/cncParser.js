export class CNCParser {
    constructor(rParameters) {
        this.rParameters = rParameters;
        this.reset();

        // Přidat mapování G-kódů a jejich popisů
        this.gCodeDescriptions = {
            'G54': 'nastaveni offsetu',
            'G55': 'nastaveni offsetu 2',
            'G90': 'absolutni programovani',
            'G91': 'inkrementalni programovani',
            'G95': 'posuv na otacku',
            'G96': 'konstantni rezna rychlost',
            'G97': 'konstantni otacky'
        };

        // Přidat mapování M-kódů pro převodové stupně
        this.gearMCodes = {
            'M41': 'zařazeni prvniho převodoveho stupně',
            'M42': 'zařazeni druheho převodoveho stupně',
            'M43': 'zařazeni třetiho převodoveho stupně'
        };

        // Přidat mapování nástrojů a jejich popisů
        this.toolDescriptions = {
            'T1': 'hrubovací nůž pravý',
            'T2': 'dokončovací nůž pravý',
            'T3': 'vnitřní nůž pravý',
            'T4': 'zapichovací nůž',
            'T5': 'závitový nůž',
            'T8': 'hrubovací nůž levý',
            'T12': 'dokončovací nůž levý',
            'T15': 'vrták'
        };

        // Přidat mapování korekcí nástrojů
        this.toolCorrections = {
            'D1': 'nastaveni korekce D1',
            'D2': 'nastaveni korekce D2',
            'D3': 'nastaveni korekce D3'
        };

        // Opravit mapování speciálních M-kódů
        this.specialMCodes = {
            'M80': 'poloha vyměny nastroje',  // Zjednodušit na string
            'M17': 'ukončeni podprogramu a skok o uroven viš',
            'M5': 'zastaveni otaček',
            'M30': 'konec programu'
        };

        // Přidat separátní objekt pro speciální pozice
        this.specialPositions = {
            'M80': { X: 540, Z: 400 }
        };

        // Přidat mapování pro G-kódy s pohybem
        this.motionGCodes = {
            'G0': 'rychloposuv',
            'G1': 'lineární interpolace',
            'G2': 'kruhová interpolace ve směru hodinových ručiček',
            'G3': 'kruhová interpolace proti směru hodinových ručiček'
        };

        // Přidat property pro sledování L105
        this.isL105Processing = false;
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

        // Zjednodušená detekce L105
        this.isL105Processing = programText.includes('L105.SPF') ||
                              programText.includes(';PODPROGRAM: L105.SPF');

        console.debug('Parsování:', {
            isL105: this.isL105Processing,
            firstLine: programText.split('\n')[0]
        });

        try {
            // Nejdřív zpracovat L105 pokud existuje
            if (programText.includes('L105')) {
                const l105Text = await this.loadL105Text();
                if (l105Text) {
                    await this.rParameters.parseL105(l105Text);
                    console.log('L105 parametry načteny:', this.rParameters.getAll());
                }
            }

            // Pak pokračovat se zpracováním programu
            const lines = programText.split('\n');
            const result = [];

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

                // Detekovat L105 soubor
                if (i === 0 && line.includes('L105.SPF')) {
                    this.isL105Processing = true;
                    console.log('Detekován L105 soubor');
                }

                // Ignorovat prázdné řádky
                if (!line) continue;

                // UPRAVIT zpracování IF příkazů - přesunout před přidání originálního řádku
                if (this.isL105Processing && line.includes('IF')) {
                    console.log('IF příkaz:', {
                        line: line,
                        parameters: {
                            R70: this.rParameters.get('70'),
                            R00: this.rParameters.get('00')
                        }
                    });

                    // Přidat pouze originální řádek s IF příkazem
                    result.push({
                        lineNumber: i + 1,
                        originalLine: line,
                        type: 'original'
                    });
                    continue;
                }

                // Přidat originální řádek pro ostatní příkazy
                if (!line.includes('IF')) {
                    result.push({
                        lineNumber: i + 1,
                        originalLine: lines[i],
                        type: 'original'
                    });
                }

                // Zpracování R-parametrů - MUSÍ BÝT PRVNÍ
                if (line.match(/R\d+\s*=/)) {
                    const assignments = this.findParameterAssignments(line);
                    const commentMatch = line.match(/;(.+)/);
                    const comment = commentMatch ? ' ; ' + commentMatch[1].trim() : '';

                    // Zpracovat každý parametr samostatně
                    for (const [num, expr] of assignments) {
                        try {
                            const value = this.rParameters.evaluateExpression(expr);
                            this.rParameters.set(num, value);

                            // Přidat interpretační řádek pro každý parametr
                            result.push({
                                lineNumber: i + 1,
                                originalLine: `    ; → R${num} = ${value.toFixed(3)}${comment}`,
                                type: 'interpreted'
                            });
                        } catch (error) {
                            console.error(`Chyba při výpočtu R${num}:`, error);
                        }
                    }
                    continue;  // Přeskočit další zpracování
                }

                // Přidat detekci návěští (labels)
                const labelMatch = line.match(/^([A-Z]+[A-Z0-9_]*):/);
                if (labelMatch) {
                    const label = labelMatch[1];
                    result.push({
                        lineNumber: i + 1,
                        originalLine: `    ; → ${label}: ; místo skoku`,
                        type: 'interpreted'
                    });
                    continue;
                }

                // Upravit zpracování L105
                if (line.includes(';PODPROGRAM: L105.SPF')) {
                    this.isL105Processing = true;
                    result.push({
                        lineNumber: i + 1,
                        originalLine: '    ; → R parametry načteny',
                        type: 'interpreted'
                    });
                    continue;
                }

                // Použít this.isL105Processing místo lokální proměnné
                if (this.isL105Processing) {
                    // Přidat interpretaci pro STOPRE
                    if (line.includes('STOPRE')) {
                        result.push({
                            lineNumber: i + 1,
                            originalLine: '    ; → STOPRE ; zastavení zpracování',
                            type: 'interpreted'
                        });
                        continue;
                    }

                    // Zpracování M-kódů v L105
                    if (line.match(/^N\d+\s*M\d+/)) {
                        const mMatch = line.match(/M(\d+)/);
                        if (mMatch) {
                            const mCode = mMatch[1];
                            let interpretation = `    ; → M${mCode}`;

                            // Přidat popis pro známé M-kódy
                            if (this.specialMCodes[`M${mCode}`]) {
                                interpretation += ` ; ${this.specialMCodes[`M${mCode}`]}`;
                            }

                            result.push({
                                lineNumber: i + 1,
                                originalLine: interpretation,
                                type: 'interpreted'
                            });
                        }
                        continue;
                    }

                    // Zpracování R-parametrů v L105
                    if (line.match(/R\d+\s*=/)) {
                        const assignments = this.findParameterAssignments(line);
                        const commentMatch = line.match(/;(.+)/);
                        const comment = commentMatch ? ' ; ' + commentMatch[1].trim() : '';

                        for (const [num, expr] of assignments) {
                            try {
                                const value = this.rParameters.evaluateExpression(expr);
                                this.rParameters.set(num, value);
                                result.push({
                                    lineNumber: i + 1,
                                    originalLine: `    ; → R${num} = ${value.toFixed(3)}${comment}`,
                                    type: 'interpreted'
                                });
                            } catch (error) {
                                console.error(`Chyba při výpočtu R${num}:`, error);
                            }
                        }
                        continue;
                    }

                    // Přidat konzolový výpis pro IF příkazy
                    if (this.isL105Processing && line.includes('IF')) {
                        // Ponechat původní zpracování
                        const interpretation = this.interpretIfCondition(line);
                        if (interpretation) {
                            interpretation.lineNumber = i + 1;
                            result.push(interpretation);
                        }
                        continue;
                    }

                    // ...rest of L105 processing...
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

                // Upravit sekci pro zpracování L-příkazů
                if (line.match(/^N\d*\s*L\d+/)) {
                    const lMatch = line.match(/L(\d+)/);
                    if (lMatch) {
                        const lNumber = lMatch[1];
                        result.push({
                            lineNumber: i + 1,
                            originalLine: `    ; → L${lNumber} ; podprogram načten z L${lNumber}`,
                            type: 'interpreted'
                        });
                        continue;
                    }
                }

                // Pokud je to L105, nepotřebujeme speciální zpracování, protože je již zahrnuto výše
                if (line.includes('L105')) {
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
                        let description = '';

                        mCodes.filter(code => !['M7', 'M8'].includes(code))
                              .forEach(code => {
                                  interpreted += `${code} `;
                                  // Speciální zpracování pro M80
                                  if (code === 'M80') {
                                      const pos = this.specialPositions['M80'];
                                      interpreted = `    ; → M80 G90 X${pos.X} Z${pos.Z}`;
                                      description = `; ${this.specialMCodes['M80']}`;
                                  } else if (this.specialMCodes[code]) {
                                      // Vždy přidat popis pro M-kódy které mají definovaný popis
                                      description = `; ${this.specialMCodes[code]}`;
                                  } else if (this.gearMCodes[code]) {
                                      description = `; ${this.gearMCodes[code]}`;
                                  }
                                  this.processMCode(code);
                              });

                        // Sestavit finální řetězec s popisem
                        const finalLine = `${interpreted.trim()}${description ? ' ' + description : ''}`;

                        result.push({
                            lineNumber: i + 1,
                            originalLine: finalLine,
                            type: 'interpreted'
                        });
                        continue;
                    }
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

                // Upravit zpracování STOPRE v hlavní smyčce
                if (line.includes('STOPRE')) {
                    result.push({
                        lineNumber: i + 1,
                        originalLine: '    ; → STOPRE ; zastaveni otacek',
                        type: 'interpreted'
                    });
                    continue;
                }

                // Upravit sekci pro zpracování G-kódů a rušení korekcí
                if (line.match(/^N\d*\s*G\d+/)) {
                    const gCodes = line.match(/G\d+/g) || [];
                    const dCode = line.match(/D\d+/) || [];

                    if (gCodes.length > 0 || dCode.length > 0) {
                        let description = '';

                        // Přidat všechny G-kódy bez šipky
                        gCodes.forEach(code => {
                            if (this.gCodeDescriptions[code]) {
                                description = `; ${code} ${this.gCodeDescriptions[code]}`;
                            }
                        });

                        // Přidat pouze popis bez šipky v interpretaci
                        if (description) {
                            result.push({
                                lineNumber: i + 1,
                                originalLine: description,
                                type: 'interpreted'
                            });
                        }
                        continue;
                    }
                }

                // Upravit detekci samostatných D-kódů (korekcí) s poznámkami
                const correctionMatch = line.match(/^[N\d]*\s*D(\d+)\s*(;.*)?/);
                if (correctionMatch) {
                    const [_, dNumber, comment] = correctionMatch;
                    const dCode = `D${dNumber}`;
                    const originalComment = comment ? comment.trim() : '';

                    result.push({
                        lineNumber: i + 1,
                        originalLine: `    ; → ${dCode} ; nastaveni korekce ${dCode}${originalComment ? ' - ' + originalComment : ''}`,
                        type: 'interpreted'
                    });
                    continue;
                }

                // V sekci pro T-kódy upravit formátování
                const toolMatch = line.match(/^N\d*\s*T(\d+)/);
                if (toolMatch) {
                    const toolNumber = toolMatch[1];
                    const toolCode = `T${toolNumber}`;

                    result.push({
                        lineNumber: i + 1,
                        originalLine: `    ; → ${line.trim()} ; výběr nástroje ${toolCode}`,
                        type: 'interpreted'
                    });
                    continue;
                }

                // V sekci pro zpracování L105 přidat interpretaci přiřazení parametrů
                if (line.match(/R\d+\s*=/)) {
                    const assignments = this.findParameterAssignments(line);
                    // Sestavit interpretační řádek pro R-parametry
                    let interpretation = '';

                    // Pokud je na řádku komentář, zachováme ho
                    const commentMatch = line.match(/;(.+)/);
                    const comment = commentMatch ? commentMatch[1].trim() : '';

                    // Pro každé přiřazení na řádku
                    for (const [num, expr] of assignments) {
                        try {
                            const value = this.rParameters.evaluateExpression(expr);
                            this.rParameters.set(num, value);
                            // Přidat interpretaci s hodnotou
                            interpretation += `R${num}=${value.toFixed(3)} `;
                        } catch (error) {
                            console.error(`Chyba při výpočtu R${num}:`, error);
                        }
                    }

                    // Přidat řádek s interpretací
                    if (interpretation) {
                        result.push({
                            lineNumber: i + 1,
                            originalLine: `    ; → ${interpretation.trim()}${comment ? ' ; ' + comment : ''}`,
                            type: 'interpreted'
                        });
                    }
                }
            }

            return result;
        } catch (error) {
            console.error('Chyba při parsování programu:', error);
            return [];
        }
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

            // Sestavit řádek - pouze jeden řádek s interpretací
            let interpreted = '    ; → ';

            // Číslo bloku
            if (blockNum) interpreted += `N${blockNum} `;

            // Přidat G-kódy (pouze v rámci hlavní interpretace)
            if (gCodes.length > 0) {
                interpreted += gCodes.join(' ') + ' ';
            }

            // Absolutní souřadnice
            interpreted += `X${this.absolutePosition.X.toFixed(3)} Z${this.absolutePosition.Z.toFixed(3)}`;

            // Přidat další parametry
            if (crMatch) interpreted += ` CR=${crMatch[1]}`;
            if (this.lastFeed) interpreted += ` F${this.lastFeed}`;
            if (this.lastSpeedValue) {
                interpreted += ` ${this.speedFormat}${this.lastSpeedValue}`;
            }
            if (this.lastMCodes.length > 0) {
                interpreted += ` ${this.lastMCodes.join(' ')}`;
            }

            // Odstranili jsme duplicitní interpretaci G-kódů

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

    // Přidat pomocnou metodu pro vyhodnocení podmínky
    evaluateCondition(value1, operator, value2) {
        switch (operator) {
            case '==': return Math.abs(value1 - value2) < 0.001;
            case '<>': return Math.abs(value1 - value2) >= 0.001;
            case '>=': return value1 >= value2;
            case '<=': return value1 <= value2;
            case '>': return value1 > value2;
            case '<': return value1 < value2;
            default: return false;
        }
    }

    // Přidat novou metodu pro zpracování IF podmínek
    interpretIfCondition(line) {
        const ifMatch = line.match(/IF\s+R(\d+)(==|<>|>=|<=|>|<)R?(\d+)\s+(GOTOF?|GOTOB)\s+([A-Z0-9_]+)/);
        if (!ifMatch) return null;

        const [_, param1, operator, param2, jumpType, targetLabel] = ifMatch;
        const value1 = this.rParameters.get(param1);
        const value2 = this.rParameters.get(param2);
        const isTrue = this.evaluateCondition(value1, operator, value2);

        // Přidat do konzole detailní výpis podmínky včetně výsledku
        console.log('IF příkaz - kontrola:', {
            příkaz: line,
            parametry: {
                [`R${param1}`]: value1,
                [`R${param2}`]: value2
            },
            podmínka: `${value1} ${operator} ${value2}`,
            výsledek: isTrue ? 'SPLNĚNO' : 'NESPLNĚNO',
            akce: isTrue ? `skok ${jumpType === 'GOTOF' ? 'vpřed' : 'zpět'} na ${targetLabel}` : 'pokračování dál'
        });

        return {
            lineNumber: -1,
            originalLine: line,
            type: 'original'
        };
    }
}

async function parseBlock(block) {
    // Přidat podporu pro STOPRE
    if (block.includes('STOPRE')) {
        return {
            type: 'interpreted',
            originalLine: block,
            interpretation: 'STOPRE ; zastaveni otacek'
        };
    }
}
