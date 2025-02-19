export class RParameters {
    constructor() {
        this.params = new Map();
        this.history = [];
    }

    parseL105(programText) {
        console.group('Parsování L105:');
        console.log('Text k parsování:', programText);

        const lines = programText.split('\n');
        let inParamSection = false;

        lines.forEach(line => {
            const trimmedLine = line.trim();

            // Detekce začátku parametrické sekce
            if (trimmedLine.includes('PARAM:')) {
                inParamSection = true;
                console.log('Začátek parametrické sekce');
                return;
            }

            // Přeskočit komentáře a prázdné řádky
            if (!inParamSection || trimmedLine.startsWith(';') || !trimmedLine) {
                return;
            }

            // Najít všechna přiřazení R-parametrů na řádku
            const rAssignments = trimmedLine.match(/R\d+=[-\d.+\/*\s()]+/g);
            if (rAssignments) {
                rAssignments.forEach(assignment => {
                    const [param, expr] = assignment.split('=').map(s => s.trim());
                    const num = param.substring(1); // odstranit 'R' z čísla parametru
                    try {
                        const value = this.evaluateExpression(expr);
                        this.set(num, value);
                        console.log(`✅ Nastaven parametr ${param} = ${value} (výraz: ${expr})`);
                    } catch (error) {
                        console.error(`❌ Chyba při nastavení ${param}:`, error);
                    }
                });
            }
        });

        const params = this.getAll();
        console.log('Načtené parametry:', params);
        console.groupEnd();
        return params;
    }

    set(num, value) {
        this.params.set(num, value);
        this.history.push({ num, value, time: Date.now() });
    }

    get(num) {
        return this.params.get(num) ?? 0;
    }

    getAll() {
        return Array.from(this.params.entries()).map(([num, value]) => ({
            num,
            value,
            lastModified: this.history
                .filter(h => h.num === num)
                .pop()?.time
        }));
    }

    evaluateExpression(expr) {
        const cleanExpr = expr.replace(/\s+/g, '')
            .replace(/R(\d+)/g, (_, num) => this.get(num));
        return Function('"use strict";return (' + cleanExpr + ')')();
    }

    clear() {
        this.params.clear();
        this.history = [];
    }
}
