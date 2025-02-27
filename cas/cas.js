class Calculator {
    static calculateArc(params) {
        return {
            center: this.calculateCenter(params),
            angles: this.calculateAngles(params),
            time: this.calculateMachiningTime(params)
        };
    }

    static calculateCenter(params) {
        const { startX, startZ, endX, endZ, radius, direction } = params;
        // Přesunout výpočet středu z původního kódu
    }

    static calculateAngles(params) {
        // Přesunout výpočet úhlů z původního kódu
    }

    static calculateMachiningTime(params) {
        // Přesunout výpočet času z původního kódu
    }
}

// Event listenery
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
        const params = getInputValues();
        const results = Calculator.calculateArc(params);
        updateResults(results);
    });
});

// Pomocné funkce
function getInputValues() {
    // Získání hodnot z formuláře
}

function updateResults(results) {
    // Aktualizace UI
}
