
(function () {
    const vscode = acquireVsCodeApi();
    function delete_cell(cell_index){
        vscode.postMessage({
            command: 'delete_cell',
            data: cell_index
        });
    }
    function merge_cell(index_top, index_bottom){
        vscode.postMessage({
            command: 'merge_cell',
            index_top: index_top, index_bottom: index_bottom
        });
    }

    function split_cell_view(cells, cell_index, container){
        code = cells.cells[cell_index].code;

        //const container = document.getElementById('mainContainer');
        const oldHtml = container.innerHTML;
        let html = "";
        html += `<div class="cell_container" id="cell_container_${cell_index}">\n`;
        html += "<h2>Split cell code</h2>\n";
        html += "<p>First part of split</p>\n";
        html += `<textarea id="area_1" class="cell" rows="10" cols="50">\n${code}\n</textarea>\n`;
        html += "<p>Second part of split</p>\n";
        html += `<textarea id="area_2" class="cell" rows="10" cols="50"></textarea>\n`;
        html += "<div class='cell_buttons'>\n";
        html += `<button id="cancel_button_${cell_index}">Cancel</button>\n`;
        html += `<button id="split_button_${cell_index}">Split</button>\n`;
        html += "</div>\n";
        html += "</div>\n";
        container.innerHTML = html;
        const splitButton = document.getElementById(`split_button_${cell_index}`);
        if (splitButton) {
            splitButton.onclick = () => {
                vscode.postMessage({
                    command: 'split_cell',
                    index: cell_index,
                    code1: document.getElementById('area_1').value,
                    code2: document.getElementById('area_2').value
                });
            };
        }
        const cancelButton = document.getElementById(`cancel_button_${cell_index}`);
        if (cancelButton) {
            cancelButton.onclick = () => {
                container.innerHTML = oldHtml;
            };
        }
    }

    //MainContainer( [(CellContainer(..,CellRuleContainer)) for each cell] )
    function set_cells(cells) {
        const container = document.getElementById('mainContainer');
        let html = "";
        cells.cells.forEach((element, index) => {
            html += `<div class="cell_container" id="cell_container_${index}">\n`;
            html += `<div class="cell_code_container">\n`;
            html += `<label for="cell${index}">Cell ${index}</label>\n`;
            html += `<div id="cell${index}" class="cell">\n`;
            html += `<p>${element.code}</p>\n`;
            html += "</div>\n";
            html += `<div id="cell${index}_details" class="cell_details">\n`;
            if (element.isFunctions){
                html += `<p>Declares: ${element.declares}</p>`;
            } else {
                html += `<p>Depends on: ${ Object.entries(element.dependsOn).map(([key, value]) => `(${key}: ${value})`).join(', ')}</p>\n`;
                //html += `<p>Depends on2: ${element.reads}</p>\n`;//Should have same entries as keys of dependsOn
                html += `<p>Writes: ${element.writes}</p>`;
            }
            html += "</div>\n";
            if (!element.isFunctions){
                html += "<div class='cell_buttons'>\n";
                html += `<button id="delete_button_${index}">Delete</button>\n`;
                if (index < cells.cells.length-1 && !cells.cells[index+1].isFunctions){
                    html += `<button id="merge_next_button_${index}">Merge with next</button>\n`;
                }
                if (index > 0 && !cells.cells[index-1].isFunctions){
                    html += `<button id="merge_prev_button_${index}">Merge with previous</button>\n`;
                }
                //TODO split
                html += `<button id="split_button_${index}">Split cell</button>\n`;
                html += "</div>\n";
            }
            html += "</div>\n";
            html += `<div class="cell_rule_container" id="cell_rule_${index}"></div>\n`;
            html += "</div>\n";
        });
        container.innerHTML = html;
        for (let i=0; i<cells.cells.length; i++){
            const deleteButton = document.getElementById(`delete_button_${i}`);
            if (deleteButton) {
                deleteButton.onclick = () => delete_cell(i);
            }
            const mergeNextButton = document.getElementById(`merge_next_button_${i}`);
            if (mergeNextButton) {
                mergeNextButton.onclick = () => merge_cell(i, i + 1);
            }
            const mergePrevButton = document.getElementById(`merge_prev_button_${i}`);
            if (mergePrevButton) {
                mergePrevButton.onclick = () => merge_cell(i - 1, i);
            }
            const splitButton = document.getElementById(`split_button_${i}`);
            if (splitButton) {
                splitButton.onclick = () => split_cell_view(cells, i, document.getElementById(`cell_container_${i}`));
            }
        }
        setArrows(cells);
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
            case 'set_loading':
                if (!message.loading){
                    document.getElementById('loadingscreen').style.display = 'none';
                } else {
                    document.getElementById('loadingscreen').style.display = 'block';
                    document.getElementById('loadingmessage').value = message.data;
                }
                break;
        }
    });
}());