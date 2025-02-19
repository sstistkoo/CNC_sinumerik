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

    parseProgram(programText) {
        this.reset();
        const lines = programText.split('\n');
        const result = [];

        // Najít L105 a jeho parametry, ale zatím je neukládat
        const l105Index = lines.findIndex(line => line.includes('L105'));
        let l105Params = [];
        if (l105Index !== -1) {
            console.log('🔍 Nalezen L105 na řádku:', l105Index + 1);
            const l105Text = lines.slice(l105Index).join('\n');
            console.log('Zpracovávám L105...');
            if (this.rParameters?.parseL105(l105Text)) {
                l105Params = this.rParameters.getAll();
                console.log('Načtené parametry:', l105Params);
            }
        }

        // Zpracovat všechny řádky
        lines.forEach((line, index) => {
            const trimmedLine = line.trim();

            // Standardní řádek
            result.push({
                lineNumber: index + 1,
                originalLine: line,
                type: 'original'
            });

            // Pro L105 přidat parametry až když se k němu dostaneme
            if (trimmedLine.includes('L105')) {
                // Přidat interpretované parametry
                l105Params.forEach(p => {
                    result.push({
                        lineNumber: index + 1,
                        originalLine: `    ; → R${p.num} = ${p.value.toFixed(3)}`,
                        type: 'interpreted'
                    });
                });
            }
            // Zpracování pohybových příkazů
            else if (this.hasCoordinates(trimmedLine)) {
                const coords = this.parseMotion(trimmedLine);
                if (coords) {
                    result.push({
                        lineNumber: index + 1,
                        originalLine: `    ; → X${coords.X.toFixed(3)} Z${coords.Z.toFixed(3)}`,
                        type: 'interpreted'
                    });
                }
            }
        });

        return result;
    }

    hasCoordinates(line) {
        return /[XZ][-\d.()\s+=R\d+*/]+/.test(line) &&
               !/^;/.test(line) &&
               !/MSG/.test(line);
    }

    parseMotion(line) {
        try {
            const xMatch = line.match(/X\s*=?\s*([-()\d.+\/*\s]+)/);
            const zMatch = line.match(/Z\s*=?\s*([-()\d.+\/*\s]+)/);

            if (!xMatch && !zMatch) return null;

            if (this.activeMotion === 'G90') {
                if (xMatch) {
                    const xValue = this.evaluateExpression(xMatch[1]);
                    this.currentPosition.X = xValue;
                    this.absolutePosition.X = xValue;
                }
                if (zMatch) {
                    const zValue = this.evaluateExpression(zMatch[1]);
                    this.currentPosition.Z = zValue;
                    this.absolutePosition.Z = zValue;
                }
            } else {
                if (xMatch) {
                    const deltaX = this.evaluateExpression(xMatch[1]);
                    this.currentPosition.X += deltaX;
                    this.absolutePosition.X += deltaX;
                }
                if (zMatch) {
                    const deltaZ = this.evaluateExpression(zMatch[1]);
                    this.currentPosition.Z += deltaZ;
                    this.absolutePosition.Z += deltaZ;
                }
            }

            return this.absolutePosition;
        } catch (error) {
            return null;
        }
    }

    evaluateExpression(expr) {
        if (!expr) return 0;
        const cleanExpr = expr.replace(/\s+/g, '')
            .replace(/R(\d+)/g, (_, num) => {
                const value = this.rParameters?.get(num) ?? this.getParameter(num);
                return value.toString();
            });
        try {
            return Function('"use strict";return (' + cleanExpr + ')')();
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
