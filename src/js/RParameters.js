export class RParameters {
    constructor() {
        this.params = new Map();
        this.history = [];
        this.originalValues = new Map(); // Pro uchování původních hodnot
    }

    parseL105(programText) {
        console.log('Parsování L105:', programText);
        const params = [];
        this.originalValues.clear(); // Reset původních hodnot

        const lines = programText.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith(';')) continue;

            // Načíst základní přiřazení R-parametrů
            const assignments = this.findRAssignments(trimmedLine);
            for (const [num, expr] of assignments) {
                try {
                    const value = this.evaluateExpression(expr);
                    this.set(num, value);
                    // Uložit původní hodnotu
                    this.originalValues.set(num, value);
                    params.push({ num, value });
                    console.log(`Nastavuji původní R${num} = ${value}`);
                } catch (error) {
                    console.error(`Chyba při výpočtu R${num}:`, error);
                }
            }
        }

        return params;
    }

    findRAssignments(line) {
        const assignments = [];

        // Rozdělit řádek na jednotlivá přiřazení podle mezery nebo závorky
        const parts = line.split(/[\s()]+/);

        for (const part of parts) {
            // Hledat vzor "R číslo = hodnota"
            const match = part.match(/R(\d+)\s*=\s*([-\d.+\/*]+)/);
            if (match) {
                const [_, num, value] = match;
                assignments.push([num, value]);
            }
        }

        // Pokud není nalezeno žádné přiřazení, zkusit alternativní formát
        if (assignments.length === 0) {
            // Hledat všechny výskyty "R číslo = výraz"
            const regex = /R(\d+)\s*=\s*([-\d.+\/*\s()R]+?)(?=\s+R\d+\s*=|$)/g;
            let match;
            while ((match = regex.exec(line)) !== null) {
                const [_, num, expr] = match;
                assignments.push([num, expr.trim()]);
            }
        }

        if (assignments.length > 0) {
            console.log('Nalezená přiřazení:', assignments);
        }

        return assignments;
    }

    set(num, value) {
        console.log(`Nastavuji R${num} =`, value);
        this.params.set(num, value);
        this.history.push({ num, value, time: Date.now() });
    }

    get(num) {
        const value = this.params.get(num) ?? 0;
        console.log(`Čtu hodnotu R${num} =`, value);
        return value;
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

        try {
            // 1. Odstranit nadbytečné mezery
            let cleanExpr = expr.trim();

            // 2. Speciální případy
            // Pokud je výraz jen číslo, vrátit ho přímo
            if (/^-?\d+\.?\d*$/.test(cleanExpr)) {
                return parseFloat(parseFloat(cleanExpr).toFixed(3));
            }

            // 3. Zpracování závorek
            if (cleanExpr.startsWith('(') && cleanExpr.endsWith(')')) {
                cleanExpr = cleanExpr.slice(1, -1).trim();
            }

            // 4. Nahrazení R-parametrů jejich hodnotami
            cleanExpr = cleanExpr.replace(/R(\d+)/g, (_, num) => {
                const value = this.params.get(num);
                if (value === undefined) {
                    console.warn(`Chybí hodnota pro R${num}, používám 0`);
                    return '0';
                }
                // Obalit hodnotu závorkami pro bezpečnost výpočtu
                return `(${value})`;
            });

            // 5. Debug výpis
            console.log('Vyhodnocuji:', {
                original: expr,
                processed: cleanExpr
            });

            // 6. Vyhodnocení výrazu s vyšší přesností
            const result = Function(`"use strict";return (${cleanExpr})`)();

            // 7. Zaokrouhlení na 3 desetinná místa
            return parseFloat(result.toFixed(3));

        } catch (error) {
            console.error('Chyba při vyhodnocování výrazu:', expr);
            console.error('Detaily:', error);
            return 0;
        }
    }

    clear() {
        this.params.clear();
        this.history = [];
    }

    // Přidat novou metodu pro reset parametrů
    resetToOriginal() {
        for (const [num, value] of this.originalValues) {
            this.set(num, value);
        }
        console.log('Parametry resetovány na původní hodnoty');
    }

    // Přidat metodu pro ověření hodnot
    verifyParameters(expectedValues) {
        let hasErrors = false;
        for (const [param, expectedValue] of Object.entries(expectedValues)) {
            const actualValue = this.get(param.replace('R', ''));
            const diff = Math.abs(actualValue - expectedValue);

            if (diff > 0.001) {  // Tolerance 0.001
                console.error(`Nesouhlasí R${param}: očekáváno ${expectedValue}, ale je ${actualValue}`);
                hasErrors = true;
            }
        }
        return !hasErrors;
    }
}
