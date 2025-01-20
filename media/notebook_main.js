
(function () {
    const vscode = acquireVsCodeApi();
    
    function set_cells(cells) {
        const container = document.getElementById('mainContainer');
        let html = "";
        cells.forEach((element, index) => {
            html += `<div class="cell_container">\n`;
            html += `<div class="cell_code_container">\n`;
            html += `<label for="cell${index}">Cell ${index}</label>\n`;
            html += `<div id="cell${index}" class="cell">\n`;
            element.forEach((subelement) => {
                html += `<p>${subelement}</p>\n`;});
            html += "</div>\n";
            html += "</div>\n";
            html += `<div class="cell_rule_container" id="cell_rule_${index}"></div>\n`;
            html += "</div>\n";
        });
        container.innerHTML = html;
    }

    function set_rule_candidates(candidates){
        candidates.forEach((element, index) => {
            const container = document.getElementById(`cell_rule_${element.cell_index}`);
            let html = "";
            html += `<label for="cell_rule_${index}">Candidate rule</label>\n`;
            html += `<div class="cell_rule" id="cell_rule_${index}">\n`;
            html += `<p>Rule name: ${element.rule_name}</p>`;
            html += `<p>Output: ${element.output_names}</p>`;
            html += `<p>Inputs: ${element.other_rules_outputs}</p>`;
            html += `<p>Strong dependencies: ${element.strong_dependencies}</p>`;
            html += `<p>Weak dependencies: ${element.weak_dependencies}</p>`;
            html += "</div>\n";
            container.innerHTML = html;
        });
        
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'set_cells':
                const cells = message.data;
                set_cells(cells);
                break;
            case 'set_candidates':
                const candidates = message.data;
                set_rule_candidates(candidates);
                break;
        }
    });
}());