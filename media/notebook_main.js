
(function () {
    const vscode = acquireVsCodeApi();
    //MainContainer( [(CellContainer(..,CellRuleContainer)) for each cell] )

    function setArrows(cells){
        const container = document.getElementById('mainContainer');
        container.innerHTML = container.innerHTML + `<svg class="connectionSVG">
<defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
            refX="0" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" />
    </marker>
</defs>
<line id="myLine" stroke="black" stroke-width="2" 
        marker-end="url(#arrowhead)" />
</svg>`;
        let distanceFromDiv = 20;
        cells.cells.forEach((element, index) => {
            Object.entries(element.dependsOn).forEach(
                ([key, value]) => {
                    const c1 = document.getElementById('cell_container_'+index).getBoundingClientRect();
                    const c2 = document.getElementById('cell_container_'+value).getBoundingClientRect();
                    const mainRect = document.getElementById('MainContainer').getBoundingClientRect();
                    const svg = document.getElementById('connectionSVG');
                    svg.setAttribute('width', mainRect.width);
                    svg.setAttribute('height', mainRect.height);

                    const line = document.getElementById('myLine');
                    const x = distanceFromDiv;  
                    const y1 = c1.top - mainRect.top + c1.height / 2;
                    const y2 = c2.top - mainRect.top + c2.height / 2;
                    line.setAttribute('x1', x);
                    line.setAttribute('y1', y1);
                    line.setAttribute('x2', x);
                    line.setAttribute('y2', y2);
                    distanceFromDiv += 5;
                }
            );
        });
    }
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
            html += "</div>\n";
            html += `<div class="cell_rule_container" id="cell_rule_${index}"></div>\n`;
            html += "</div>\n";
        });
        container.innerHTML = html;
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
        }
    });
}());