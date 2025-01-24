
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

    var OldEventListener = [];

    function split_cell_view(cells, cell_index, container){
        code = cells.cells[cell_index].code;
        const overlay = document.getElementById('userinputoverlay');
        let html = "";
        html += `<div class="userinput" id="cell_container_${cell_index}">\n`;
        html += "<h2>Split cell code</h2>\n";
        html += "<p>First part of split</p>\n";
        html += `<textarea id="area_1" class="cell" rows="10" cols="50">\n${code}\n</textarea>\n`;
        html += "<p>Second part of split</p>\n";
        html += `<textarea id="area_2" class="cell" rows="10" cols="50"></textarea>\n`;
        html += "<div class='buttons_split'>\n";
        html += `<button id="cancel_button_${cell_index}">Cancel</button>\n`;
        html += `<button id="split_button_${cell_index}">Split</button>\n`;
        html += "</div>\n";
        html += "</div>\n";
        overlay.innerHTML = html;
        overlay.style.display = 'flex';
        const splitButton = document.getElementById(`split_button_${cell_index}`);
        if (splitButton) {
            splitButton.onclick = () => {
                vscode.postMessage({
                    command: 'split_cell',
                    index: cell_index,
                    code1: document.getElementById('area_1').value,
                    code2: document.getElementById('area_2').value
                });
                overlay.innerHTML = "";
                overlay.style.display = 'none';
            };
        }
        const cancelButton = document.getElementById(`cancel_button_${cell_index}`);
        if (cancelButton) {
            cancelButton.onclick = () => {
                overlay.innerHTML = "";
                overlay.style.display = 'none';
            };
        }
    }

    //MainContainer( [(CellContainer(..,CellRuleContainer)) for each cell] )
    function set_cells(cells) {
        //Remove old event listener
        if (OldEventListener.length > 0){
            OldEventListener.forEach((element) => {
                element[0].removeEventListener(element[1], element[2]);
            });
        }
        const container = document.getElementById('mainContainer');
        let html = "";
        let removeDependencyCallbacks = [];
        let removeWriteCallbacks = [];

        //Check if there is any missing dependency
        const missingDependencies = [...cells.cells.map((cell,index) => {return {i: index, d: cell.missingDependencies}}).filter(c => c.d.length>0)].flat();
        if (missingDependencies.length > 0){
            html += "<div class='cell_container'>\n";
            html += `<div class="cell_code_container">\n`;
            html += "<h2>The cells have some broken data dependencies:</h2>\n";
            missingDependencies.forEach((element) => {
                html += `<p>Cell ${element.i} is missing dependency: ${element.d}</p>\n`;
            });
            html += "<p>Please fix the dependencies by either removing them or adding writes manually</p>\n";
            html += "</div>\n";
            html += "</div>\n";
        }

        cells.cells.forEach((element, index) => {
            html += `<div class="cell_container" id="cell_container_${index}">\n`;
            html += `<div class="cell_code_container">\n`;

            //Title and buttons
            html += `<div class='cell_title_and_buttons'>\n`;
            html += `<div class="biglabel">Cell [${index}]</div>`;
            html += "<div class='cell_buttons'>\n";
            if (!element.isFunctions){
                html += `<button id="delete_button_${index}" title="Delete cell">&times;</button>\n`;
                if (index < cells.cells.length-1 && !cells.cells[index+1].isFunctions){
                    html += `<button id="merge_next_button_${index}" title="Merge with next cell">&darr;</button>\n`;
                }
                if (index > 0 && !cells.cells[index-1].isFunctions){
                    html += `<button id="merge_prev_button_${index}" title="Merge with previous cell">&uarr;</button>\n`;
                }
                //TODO split
                html += `<button id="split_button_${index}" title="Split cell">&#247;</button>\n`;
            }
            html += "</div>\n";
            html += "</div>\n";
            
            //Code
            html += `<div id="cell${index}" class="cell">\n`;
            html += `<pre><code>${hljs.highlight('python', element.code).value}</code></pre>\n`;
            //html += `<p>${element.code}</p>\n`;
            html += "</div>\n";

            //Details
            html += `<div id="cell${index}_details" class="cell_details">\n`;
            if (element.isFunctions){
                html += `<p><strong>Declares:</strong> ${element.declares}</p>`;
            } else {
                const dependencies = Object.entries(element.dependsOn).map(([key, value]) => [`${key} (cell [${value}])`, key]);
                if (dependencies.length === 0){
                    html += `<p><strong>No dependencies</strong></p>\n`;
                } else {
                    html += `<p><strong>Depends on:</strong></p>\n`;
                    html += "<div class='dependency_container'>\n";
                    dependencies.forEach((dep) => {
                        html += `<p>${dep[0]}</p><button class="smallbutton" id="rem_dip_${index}_${dep[0]}" title="remove">&times;</button>\n`;
                        removeDependencyCallbacks.push([`rem_dip_${index}_${dep[0]}`, ()=>{
                        vscode.postMessage({
                            command: 'remove_dependency',
                            index: index,
                            keyword: dep[1]
                        });
                        }]);
                    });
                    html += "</div>\n";
                }
                html += `<p><strong>Writes:</strong></p>\n`;
                html += "<div class='dependency_container'>\n";
                element.writes.forEach((write) => {
                    html += `<p>${write}</p><button class="smallbutton" id="rem_wip_${index}_${write}" title="remove">&times;</button>\n`;
                    removeWriteCallbacks.push([`rem_wip_${index}_${write}`, ()=>{
                        vscode.postMessage({
                            command: 'remove_write',
                            index: index,
                            keyword: write
                        });
                    }]);
                });
                html += "</div>\n";
                if (element.missingDependencies.length > 0){
                    html += `<p class="missingdip"><strong>Cell has missing dependencies:</strong></p>\n`;
                    html += "<div class='dependency_container'>\n";
                    element.missingDependencies.forEach((dep) => {
                        html += `<p class="missingdip">${dep}</p><button class="smallbutton" id="rem_dip_${index}_${dep}" title="remove">&times;</button>\n`;
                        removeDependencyCallbacks.push([`rem_dip_${index}_${dep}`, ()=>{
                        vscode.postMessage({
                            command: 'remove_dependency',
                            index: index,
                            keyword: dep
                        });
                        }]);
                    });
                    html += "</div>\n";
                }
            }
            html += "</div>\n";
            html += "</div>\n";
            html += `<div class="cell_rule_container" id="cell_rule_${index}_container"></div>\n`;
            html += "</div>\n";
        });
        container.innerHTML = html;
        //Set callbacks
        let selectedText = ""; let selectedCell = "";
        const actionButton = document.getElementById('actionButton');
        const parapgraphs = [];
        for (let i=0; i<cells.cells.length; i++){

            const paragraph = document.getElementById('cell'+i);
            parapgraphs.push(paragraph);
            paragraph.addEventListener('mouseup', () => {
                let selection = window.getSelection();
                if (selection.toString().length > 0) {
                    if (/\s/.test(selection.toString().trim())) {
                        actionButton.style.display = 'none';
                        return;
                    }
                    const range = selection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    actionButton.style.top = `${rect.bottom + window.scrollY}px`;
                    actionButton.style.left = `${rect.left + window.scrollX}px`;
                    actionButton.style.display = 'flex';
                    selectedCell = i;
                    selectedText = selection.toString().trim();
                } else {
                    actionButton.style.display = 'none';
                }
            });

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
            removeDependencyCallbacks.forEach(([id, callback]) => {
                const button = document.getElementById(id);
                if (button) {
                    button.onclick = callback;
                }
            });
            removeWriteCallbacks.forEach(([id, callback]) => {
                const button = document.getElementById(id);
                if (button) {
                    button.onclick = callback;
                }
            });
            
        }
        function DOM_EventListener(event){
            if (actionButton.contains(event.target)) {return;}
            let contains = false;
            parapgraphs.forEach((element) => { if (element.contains(event.target)) {contains = true;}});
            if (!contains){actionButton.style.display = 'none';}
        }
        document.addEventListener('click', DOM_EventListener);
        OldEventListener.push([document, "click", DOM_EventListener]);
        function addDependencyF(){
            actionButton.style.display = 'none';
            vscode.postMessage({
                command: 'add_to_dependencies',
                index: selectedCell,
                keyword: selectedText
            });
        }
        document.getElementById('addDependency').addEventListener('click', addDependencyF);
        OldEventListener.push([document.getElementById('addDependency'), "click", addDependencyF]);
        function addWritef(){
            actionButton.style.display = 'none';
            vscode.postMessage({
                command: 'add_to_writes',
                index: selectedCell,
                keyword: selectedText
            });
        }
        document.getElementById('addWrite').addEventListener('click', addWritef);
        OldEventListener.push([document.getElementById('addWrite'), "click", addWritef]);
        

        initializeArrows();
        buildDependencyLines(cells);
    }

    function set_rules(rules){
        rules.forEach((element, index) => {
            const container = document.getElementById(`cell_rule_${index}_container`);
            let html = "";
            let actions = [];
            if (false && element.isLoading){
                html += '<div class="smallSpinner"></div>';
            } else {
                if (element.type==="rule"){
                    html += `<p>Export as: <strong>Snakemake Rule</strong></p>\n`;
                    html += "<div class='cell_rule_preview'>\n";
                    html += `<p>rule ${element.name}:</p>\n`;
                    html += `<p>    input:</p>\n`;
                    let inputs = new Set();
                    Object.keys(element.rule_dependencies).forEach((key) => {
                        console.log(element.rule_dependencies[key]);
                        console.log(element.rule_dependencies[key].name);
                        inputs.add(`output of \<${element.rule_dependencies[key].name}\>`);
                    });
                    inputs.forEach((inp) => {
                        html += `<p>        ${inp}</p>\n`;
                    });
                    if (inputs.size === 0){
                        html += `<p>        - </p>\n`;
                    }
                    html += `<p>    output:</p>\n`;
                    html += `<p>        --filename to be defined--</p>\n`;
                    html += `</div>\n`;

                } else if (element.type==="script"){
                    html += `<p>Export as: <strong>Script</strong></p>\n`;
                    html += "<div class='cell_rule_preview'>\n";
                    html += `<p>${element.name}.py</p>\n`;
                    html += `</div>\n`;

                } else {
                    html += `<p><strong>Undecided</strong>: can be either a script or a rule.</p>\n`;
                }
                html += "<div class='cell_rule_buttons'>\n";
                if (element.type!=="rule" && element.can_become["rule"]){
                    html += `<button id="become_rule_${index}">Become Rule</button>\n`;
                    actions.push([`become_rule_${index}`, () => {
                        vscode.postMessage({
                            command: 'become_rule',
                            index: index
                        });
                    }]);
                }
                if (element.type!=="script" && element.can_become["script"]){
                    html += `<button id="become_script_${index}">Become Script</button>\n`;
                    actions.push([`become_script_${index}`, () => {
                        vscode.postMessage({
                            command: 'become_script',
                            index: index
                        });
                    }]);
                }
                if (element.type!=="undecided" && element.can_become["undecided"]){
                    html += `<button id="become_undecided_${index}">Become Undecided</button>\n`;
                    actions.push([`become_undecided_${index}`, () => {
                        vscode.postMessage({
                            command: 'become_undecided',
                            index: index
                        });
                    }]);
                }
                html += "</div>\n";
            }
            container.innerHTML = html;
            actions.forEach(([id, callback]) => {
                const button = document.getElementById(id);
                if (button) {
                    button.onclick = callback;
                }
            });
        });
        
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'set_cells':
                const cells = message.data;
                set_cells(cells);
                break;
            case 'set_rules':
                const rules = message.data;
                set_rules(rules);
                break;
            case 'set_loading':
                if (!message.loading){
                    document.getElementById('loadingscreen').style.display = 'none';
                } else {
                    document.getElementById('loadingscreen').style.display = 'block';
                    document.getElementById('loadingmessage').innerText = message.data;
                }
                break;
        }
    });

    function buildDependencyLines(cells){
        /**For each line must decide: horizontal offset, vertical offset for start and end 
         * Horizontal: data structure for each cell, computing the min. available offset
        */
        const OFFSET_DELTA = 7; const OFFSET_START = 20;
        const MAX_OFFSET = (220-20)/OFFSET_DELTA;
        let offsets;
        let h_offset = cells.cells.map(() => new Set());

       function addDependencyArrow(VAR_NAME, CELL_IND, i, helper_text){
            for (let k=CELL_IND; k<=i; k++){
                offsets = new Set([...offsets, ...h_offset[k]]);
            }
            let minOffset = 0;
            while (offsets.has(minOffset)) {
                minOffset += 1;
            }
            if (minOffset > MAX_OFFSET){
                minOffset = Math.random() * MAX_OFFSET;
            } else {
                for (let k=CELL_IND; k<i; k++){
                    h_offset[k].add(minOffset);
                }
            }
            const text = `Cell ${i} ${helper_text} ${VAR_NAME} of cell ${CELL_IND}`;
            drawArrows(`cell${CELL_IND}`, `cell${i}`, OFFSET_START + minOffset * OFFSET_DELTA, text);
       }
        for (let i = 1; i < cells.cells.length; i++) {
            const cell = cells.cells[i];
            offsets = new Set();
            const mergedDependencies = {}
            Object.entries(cell.dependsOn).forEach(([var_name, target]) => {
                if (mergedDependencies[target] !== undefined){
                    mergedDependencies[target] = [...mergedDependencies[target], var_name];
                } else {
                    mergedDependencies[target] = [var_name];
                }
            });

            Object.entries(mergedDependencies).forEach(([target, variables]) => {
                addDependencyArrow(variables.join(", "), target, i, "depends on");
            });
            Object.entries(cell.dependsOnFunction).forEach(([var_name, target]) => {
                addDependencyArrow(var_name, target, i, "depends on function");
            });
        }
    }

    function drawArrows(id_a, id_b, distance, toolTipText) {
        //id_a is upper element
        const obj1 = document.getElementById(id_a);
        const rect1 = obj1.getBoundingClientRect();
        const obj2 = document.getElementById(id_b);
        const rect2 = obj2.getBoundingClientRect();
        const xrect = (document.getElementById('lines')).getBoundingClientRect();
        const svg = document.querySelector('svg');

        const arrowColor = getRandomColor();

        const Y1 = rect1.top + rect1.height * (0.75 + (Math.random() - 0.5)*0.2);
        const Y2 = rect2.top + rect2.height * (0.25 + (Math.random() - 0.5)*0.2);
        const svgNS = "http://www.w3.org/2000/svg";
        let line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", `${xrect.right - distance}px`);
        line.setAttribute("y1", `${Y1}px`);
        line.setAttribute("x2", `${xrect.right}px`);
        line.setAttribute("y2", `${Y1}px`);
        line.setAttribute("stroke", arrowColor);
        line.setAttribute("stroke-width", "2");
        line.addEventListener('mouseover', () => showTooltip(line, toolTipText));
        line.addEventListener('mouseout', hideTooltip);
        svg.appendChild(line);
        
        line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", `${xrect.right - distance}px`);
        line.setAttribute("y1", `${Y2}px`);
        line.setAttribute("x2", `${xrect.right}px`);
        line.setAttribute("y2", `${Y2}px`);
        line.setAttribute("stroke", arrowColor);
        line.setAttribute("stroke-width", "2");
        line.addEventListener('mouseover', () => showTooltip(line, toolTipText));
        line.addEventListener('mouseout', hideTooltip);
        svg.appendChild(line);
    
        line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", `${xrect.right - distance}px`);
        line.setAttribute("y1", `${Y2}px`);
        line.setAttribute("x2", `${xrect.right - distance}px`);
        line.setAttribute("y2", `${Y1}px`);
        line.setAttribute("stroke", arrowColor);
        line.setAttribute("stroke-width", "2");
        line.addEventListener('mouseover', () => showTooltip(line, toolTipText));
        line.addEventListener('mouseout', hideTooltip);
        svg.appendChild(line);
    }

    function getRandomColor() {
        const colors = ["#24DFE2", "#B4FF2B", "#FFEE00","#FF9400", "#04E762","#008BF8","#ff0000"];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    function showTooltip(line, text) {
        let tooltip = document.getElementById('tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.backgroundColor = 'black';
            tooltip.style.border = '1px solid black';
            tooltip.style.padding = '5px';
            document.body.appendChild(tooltip);
        }
        tooltip.textContent = text;
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.pageX + 5}px`;
        tooltip.style.top = `${event.pageY + 5}px`;
        const svg = document.querySelector('svg');
        const lines = svg.querySelectorAll('line');
        lines.forEach(line_ => {
            if (line !== line_) {
                line_.setAttribute('stroke-opacity', '0.5');
            }
        });
    }
    
    function hideTooltip() {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
        const svg = document.querySelector('svg');
        const lines = svg.querySelectorAll('line');
        lines.forEach(line_ => {
            line_.setAttribute('stroke-opacity', '1');
        });
    }
    
    

    function initializeArrows(){
        function getAbsolutePosition(element) {
            const rect = element.getBoundingClientRect();
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            return rect.left + scrollLeft;
        }
        const existingSvg = document.querySelector('#lines svg');
        if (existingSvg) {
            existingSvg.remove();
        }
        window.scrollTo(0, 0);
        const height_px = document.getElementById('mainContainer').getBoundingClientRect().height;
        const width_px = getAbsolutePosition(document.getElementById('mainContainer')) - 8;
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", width_px+"px");
        svg.setAttribute("height", height_px+"px");
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        document.getElementById('lines').appendChild(svg);
    }
}());