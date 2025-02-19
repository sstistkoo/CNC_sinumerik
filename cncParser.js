export class CNCParser {
    constructor() {
        this.currentLine = 0;
        this.programBlocks = [];
    }

    parseProgram(programText) {
        this.programBlocks = [];
        const lines = programText.split('\n');

        // Přímé mapování řádků
        this.programBlocks = lines.map((line, index) => ({
            lineNumber: index + 1,
            originalLine: line,
            displayNumber: this.extractLineNumber(line),
            type: this.getBlockType(line)
        }));

        return this.programBlocks;
    }

    extractLineNumber(line) {
        const match = line.match(/^N(\d+)/);
        return match ? match[1].padStart(2, '0') : '';
    }

    getBlockType(line) {
        if (!line.trim()) return 'empty';
        if (line.includes(':MSG')) return 'header';
        if (line.trim().startsWith(';')) return 'comment';
        if (line.match(/^N[0-9]+/)) return 'numbered';
        return 'code';
    }

    getFormattedBlock(block) {
<<<<<<< HEAD
        // Vrátit přesně původní řádek bez jakýchkoliv úprav
=======
        // Vrátit přesně původní řádek bez úprav
>>>>>>> b44715124eddb1dd3105908983a45662c06629b7
        return block.originalLine;
    }
}
