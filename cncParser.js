export class CNCParser {
    constructor() {
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

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();

            // Uložit původní řádek
            result.push({
                lineNumber: index + 1,
                originalLine: trimmedLine,
                type: 'original'
            });

            // Zkontrolovat jestli řádek obsahuje pohyb
            if (this.hasCoordinates(trimmedLine)) {
                // Aktualizovat G-kód a mód
                const gMatch = trimmedLine.match(/G([0-1])\s/);
                if (gMatch) this.lastGCode = gMatch[1];
                if (trimmedLine.includes('G90')) this.activeMotion = 'G90';
                if (trimmedLine.includes('G91')) this.activeMotion = 'G91';

                // Zpracovat souřadnice
                const coords = this.parseMotion(trimmedLine);
                if (coords) {
                    result.push({
                        lineNumber: index + 1,
                        originalLine: `; → G90 G${this.lastGCode} X${this.absolutePosition.X.toFixed(3)} Z${this.absolutePosition.Z.toFixed(3)}`,
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
        const cleanExpr = expr.replace(/\s+/g, '')
                             .replace(/R(\d+)/g, (_, num) => this.getParameter(num));
        try {
            return Function('"use strict";return (' + cleanExpr + ')')();
        } catch (error) {
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
