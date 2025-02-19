export class RParameters {
    constructor() {
        this.params = new Map();
        this.history = [];
    }

    parseL105(programText) {
        console.log('Parsování L105:', programText);
        const params = [];
        let currentValue = null;

        const lines = programText.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();

            // Přeskočit komentáře a prázdné řádky
            if (!trimmedLine || trimmedLine.startsWith(';')) continue;

            // Hledat přiřazení R-parametrů
            const assignments = this.findRAssignments(trimmedLine);
            for (const [param, expr] of assignments) {
                try {
                    const value = this.evaluateExpression(expr);
                    // Zapamatovat hodnotu pro případné další výpočty
                    currentValue = value;
                    this.set(param, value);
                    params.push({ num: param, value });
                } catch (error) {
                    console.error(`Chyba při zpracování ${param}=${expr}:`, error);
                }
            }

            // Zpracovat výrazy jako "R04=(462.2-40)"
            const complexAssignments = line.match(/R(\d+)\s*=\s*\(([-\d.+\/*\s]+)\)/g);
            if (complexAssignments) {
                for (const assignment of complexAssignments) {
                    const [_, num, expr] = assignment.match(/R(\d+)\s*=\s*\(([-\d.+\/*\s]+)\)/);
                    try {
                        const value = this.evaluateExpression(expr);
                        this.set(num, value);
                        params.push({ num, value });
                    } catch (error) {
                        console.error(`Chyba při výpočtu ${assignment}:`, error);
                    }
                }
            }

            // Zpracovat výrazy s násobením jako "R54=R54*R69"
            const mulAssignments = line.match(/R(\d+)\s*=\s*R\d+\s*\*\s*R\d+/g);
            if (mulAssignments) {
                for (const assignment of mulAssignments) {
                    const [_, target, op1, op2] = assignment.match(/R(\d+)\s*=\s*R(\d+)\s*\*\s*R(\d+)/);
                    try {
                        const value = this.get(op1) * this.get(op2);
                        this.set(target, value);
                        params.push({ num: target, value });
                    } catch (error) {
                        console.error(`Chyba při násobení ${assignment}:`, error);
                    }
                }
            }
        }

        console.log('Načtené parametry:', params);
        return params;
    }

    findRAssignments(line) {
        const assignments = [];
        const regex = /R(\d+)\s*=\s*([-\d.+\/*\s()]+)/g;
        let match;

        while ((match = regex.exec(line)) !== null) {
            const [_, num, expr] = match;
            assignments.push([num, expr]);
        }

        return assignments;
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
        if (!expr) return 0;

        // Vyčistit výraz
        const cleanExpr = expr
            .replace(/\s+/g, '')
            .replace(/R(\d+)/g, (_, num) => this.get(num).toString());

        try {
            const result = Function('"use strict";return (' + cleanExpr + ')')();
            return parseFloat(result.toFixed(3));
        } catch (error) {
            console.error('Chyba při vyhodnocování:', expr, error);
            return 0;
        }
    }

    clear() {
        this.params.clear();
        this.history = [];
    }
}
