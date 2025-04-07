
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
        //html += `<textarea id="area_1" class="cell" rows="10" cols="50">\n${code}\n</textarea>\n`;
        html += "<div class='cell_split'>\n";
        html += `<pre><code id="area_1" contenteditable="true">${hljs.highlight(code, { language: 'python' }).value}</code></pre>\n`;
        html += "</div>\n";
        html += "<p>Second part of split</p>\n";
        html += `<div class='cell_split'>\n`;
        html += `<pre><code id="area_2" contenteditable="true">${hljs.highlight("", { language: 'python' }).value}</code></pre>\n`;
        //html += `<textarea class="cell" id="area_2" class="cell" rows="10" cols="50"></textarea>\n`;
        html += "</div>\n";
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
                    code1: document.getElementById('area_1').innerText,
                    code2: document.getElementById('area_2').innerText
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

    function set_output(cells){
        //Remove lines and old content
        document.getElementById('lines').style.display = 'none';
        document.getElementById('mainContainer').innerHTML = "";
        const existingSvg = document.querySelector('#lines svg');
        if (existingSvg) {
            existingSvg.remove();
        }

        const container = document.getElementById('main_header');
        let html = `
            <h1>Export Notebook into Snakemake - Step 2</h1>
            <div id="header_instructions">
            <p>In this step all the rules and scripts are presented.</p>
            <p>Rules have prefix and suffix generated code, to manage imports from scripts, reading and writing files.</p>
            <p>The generated Prefix and Suffix code can be manually adjusted.</p>
            <p>Manual updates will be propagated automatically - you can modify a rule's output file and following rules will update as well.</p>
            <p>Note: you can Undo-Redo changes you perform with the standard keybinding, Ctrl+Z, Ctrl+Y.</p>
            <h2>Snakemaker-Notebook Agent.</h2>
            <p>The Snakemaker chat assistant can assist you during this step by performing actions to your code.</p>
            <p>It can change Snakemake rules and the generated code from natural language prompt.</p>
            <p>For example you can ask for different file formats, different filenames, rule names, wildcards etc.</p>
            <p>You can open the chat assistant in the <a id="open_chat_assistant">Snakemaker view</a>.</p>
            <p>Alternatively, open the Github Copilot Chat (Ctrl + Alt + I) and tag the agent <span id="chat_tag">@snakemaker-notebook</span> to chat with it.</p>
            <br>
            </div>
            <div id="proceed_button_container">
                <button id="back_button">Back to Step 1</button>
                <button id="export_snakefile">Export Snakefile</button>
            </div>
        `;
        //Config
        html += `<div class="cell_container" id="cell_container_CONFIG">\n`;
        html += `<div class="cell_output_container" id="cellCONFIG">\n`;
        html += `<div class="biglabel">config.yaml</div>`;
        html += `<div id="config_container" class="cell">\n`;
        html += `<pre><code id="config_content" contenteditable="true">${hljs.highlight(cells.config, { language: 'python' }).value}</code></pre>\n`;
        html += "</div>\n";
        html += "</div>\n";
        html += "</div>\n";
        

        cells.cells.forEach((cell, index) => {
            const element = cell.rule;
            html += `<div class="cell_container" id="cell_container_${index}">\n`;
            html += `<div class="cell_output_container" id="cell${index}">\n`;
            
            html += `<div class="biglabel">Cell [${index}]</div>`;

            if (element.type==="rule"){
                html += `<p>Export as: <strong>Snakemake Rule</strong></p>\n`;
                html += "<div class='cell_rule_preview'>\n";
                html += `<p contenteditable="true" id="snakemake_rule_${index}">${element.snakemakeRule}</p>\n`;
                html += `</div>\n`;

            } else if (element.type==="script"){
                html += `<p>Export as: <strong>Script</strong></p>\n`;
                html += "<div class='cell_rule_preview'>\n";
                html += `<p>${element.name}.py</p>\n`;
                html += `</div>\n`;
            }

            html += `<label for="code_prefix_${index}">Prefix code:</label>\n`;
            html += `<div id="code_prefix_${index}" class="cell">\n`;
            html += `<pre><code id="prefix_content_${index}" contenteditable="true">${hljs.highlight(element.prefixCode, { language: 'python' }).value}</code></pre>\n`;
            html += "</div>\n";

            html += `<label for="code_core_${index}">Code:</label>\n`;
            html += `<div id="code_core_${index}" class="cell">\n`;
            html += `<pre><code id="main_content_${index}" contenteditable="false">${hljs.highlight(cell.code, { language: 'python' }).value}</code></pre>\n`;
            html += "</div>\n";

            if (element.type==="rule"){
                html += `<label for="code_postfix_${index}">Suffix code:</label>\n`;
                html += `<div id="code_postfix_${index}" class="cell">\n`;
                html += `<pre><code id="postfix_content_${index}" contenteditable="true">${hljs.highlight(element.postfixCode, { language: 'python' }).value}</code></pre>\n`;
                html += "</div>\n";
            }
            //html += `<button id="propagate_${index}" style="display: none;">Save changes</button>\n`;
            
            html += "</div>\n";
            html += "</div>\n";
        });
        container.innerHTML = html;
        //Initialize event listeners
        document.getElementById('open_chat_assistant').addEventListener('click', () => {
            vscode.postMessage({
                command: 'open_chat_assistant'
            });
        });
        document.getElementById('export_snakefile').addEventListener('click', () => {
            vscode.postMessage({
                command: 'export_snakefile'
            });
        });
        document.getElementById('back_button').addEventListener('click', () => {
            vscode.postMessage({
                command: 'back'
            });
        });
        const config_content_editor = document.getElementById(`config_content`)
        config_content_editor?.addEventListener('focusout', function() {
            const code = config_content_editor.innerText;
            if (code !== cells.config){
                cells.config = code;
                vscode.postMessage({
                    command: 'config_changed',
                    content: code
                });
            }
        });
        cells.cells.forEach((cell, index) => {
            const element = cell.rule;
            const rule_p = document.getElementById(`snakemake_rule_${index}`)
            const prefix = document.getElementById(`prefix_content_${index}`);
            const postfix = document.getElementById(`postfix_content_${index}`);
            rule_p?.addEventListener('focusout', function() {
                const code = rule_p.innerText;
                if (code !== cells.cells[index].rule.snakemakeRule){
                    cells.cells[index].rule.snakemakeRule = code;
                    vscode.postMessage({
                        command: 'propagate_snakemake_rule',
                        index: index,
                        content: code
                    });
                }
            });
            prefix?.addEventListener('focusout', function() {
                const code = prefix.innerText;
                if (code !== cells.cells[index].rule.prefixCode){
                    cells.cells[index].rule.prefixCode = code;
                    vscode.postMessage({
                        command: 'propagate_changes_prefix',
                        index: index,
                        content: code
                    });
                }
            });
            postfix?.addEventListener('focusout', function() {
                const code = postfix.innerText;
                if (code !== cells.cells[index].rule.postfixCode){
                    cells.cells[index].rule.postfixCode = code;
                    console.log("Code changed");
                    vscode.postMessage({
                        command: 'propagate_changes_postfix',
                        index: index,
                        content: code
                    });
                }
            });
        });
        document.querySelectorAll('code[contenteditable="true"]').forEach(codeEl => {
            codeEl.addEventListener('keydown', (e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                // Insert tab (or spaces) at cursor
                const range = window.getSelection().getRangeAt(0);
                range.insertNode(document.createTextNode('    '));
                range.collapse(false);
              }
            });
          });
        document.querySelectorAll('p[contenteditable="true"]').forEach(codeEl => {
            codeEl.addEventListener('keydown', (e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                // Insert tab (or spaces) at cursor
                const range = window.getSelection().getRangeAt(0);
                range.insertNode(document.createTextNode('    '));
                range.collapse(false);
              }
            });
          });
    }

    function match_and_replace(code, keywords, tag){
        for (let i=0; i<keywords.length; i++){
            const keyword = keywords[i];
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'g');
            code = code.replace(regex, `<span class=${tag}>${keyword}</span>`);
        }
        return code;
    }

    function highlight_code_by_dependencies(code, highlight_dependent, highlight_wildcards, highlight_writes, highlight_missing){
        code = match_and_replace(code, highlight_dependent, "code_dependent");
        code = match_and_replace(code, highlight_wildcards, "code_wildcard");
        code = match_and_replace(code, highlight_writes, "code_write");
        code = match_and_replace(code, highlight_missing, "code_missing");
        return code;
    }

    //MainContainer( [(CellContainer(..,CellRuleContainer)) for each cell] )
    function set_cells(cells) {
        //Remove old event listener
        if (OldEventListener.length > 0){
            OldEventListener.forEach((element) => {
                element[0].removeEventListener(element[1], element[2]);
            });
        }
        document.getElementById('lines').style.display = 'block';
        document.getElementById('mainContainer').innerHTML = "";

        //Set up header
        document.getElementById('main_header').innerHTML = `
            <h1>Export Notebook into Snakemake - Step 1</h1>
            <h2>Note: this is an experimental feature, still unstable.</h2>
            <div id="header_instructions">
            <p>The following page presents the formatted notebook cells with their data dependencies. Before proceeding, review the cell and their dependencies.</p>
            <br>
            <p>Manage cells:</p>
            <p class="with_space">Cells can be removed, split or merged. Use the buttons on the top-right of each cell to perform actions on them.</p>
            <p>Export cells into rules or script:</p>
            <p class="with_space">Every cell can be converted into either a Snakemake rule or a script. You can manually set the type of a cell using the corresponding buttons below the cell's body.</p>
            <p>Review dependencies:</p>
            <p class="with_space">Data dependencies between cells are represented with the colored lines on the left side. Each cell's Read and Write set are defined below the cell's code.</p>
            <p class="with_space">You can manually add variables to the Read or Write set by selecting them in the code and using the corresponding button.</p>
            <p class="with_space">You can manually remove variables from the Read or Write sets using the X buttons below the cell.</p>
            <p class= "with_space">Variables involved in dependencies are highlighted in the code:</p>
            <p class="with_space_l">><span class="code_dependent">Green</span> keyword are variables readed from previous cells.</p>
            <p class="with_space_l">><span class="code_wildcard">Blue</span> keyword are variables readed from wildcards.</p>
            <p class="with_space_l">><span class="code_missing">Red</span> keyword are missing dependencies.</p>
            <p class="with_space_l">><span class="code_write">Underlined</span> keyword are variables written by the cell.</p>
            <p>Note: you can Undo-Redo changes you perform with the standard keybinding, Ctrl+Z, Ctrl+Y.</p>
            <br>
            <h2>Snakemaker-Notebook Agent.</h2>
            <p>The Snakemaker chat assistant can assist you during this step by reviewing and fixing dependency issues.</p>
            <p>You can open the chat assistant in the <a id="open_chat_assistant">Snakemaker view</a>.</p>
            <p>Alternatively, open the Github Copilot Chat (Ctrl + Alt + I) and tag the agent <span id="chat_tag">@snakemaker-notebook</span> to chat with it.</p>
            <br>
            </div>
            <div class="notice_before_proceed" id="data_dependency_errors"></div>
            <div class="notice_before_proceed" id="undecided_cells"></div>
            <div id="proceed_button_container"></div>
        `;
        document.getElementById('open_chat_assistant').addEventListener('click', () => {
            vscode.postMessage({
                command: 'open_chat_assistant'
            });
        });
        const container = document.getElementById('mainContainer');
        let html = "";
        let removeDependencyCallbacks = [];
        let removeWriteCallbacks = [];

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
                html += `<button id="split_button_${index}" title="Split cell">&#247;</button>\n`;
            }
            html += "</div>\n";
            html += "</div>\n";
            
            //Code
            //variables for code highlighting
            const highlight_dependent = Object.entries(element.dependsOn).map(([key, value]) => key);
            const highlight_wildcards = element.wildcards;
            const highlight_writes = element.writes;
            const highlight_missing = element.missingDependencies

            html += `<div id="cell${index}" class="cell">\n`;
            html += `<pre><code>${highlight_code_by_dependencies(hljs.highlight(element.code, { language: 'python' }).value, highlight_dependent, highlight_wildcards, highlight_writes, highlight_missing)}</code></pre>\n`;
            //html += `<p>${element.code}</p>\n`;
            html += "</div>\n";

            //Details
            html += `<div id="cell${index}_details" class="cell_details">\n`;
            if (element.isFunctions){
                html += `<p><strong>Declares:</strong> ${element.declares}</p>`;
                const dependencies = element.replacedFunctionVariables;
                if (dependencies.length === 0){
                    html += `<p><strong>No dependencies</strong></p>\n`;
                } else {
                    html += `<p><strong>Function reads from global context (replaced to function arguments):</strong></p>\n`;
                    html += "<div class='dependency_container'>\n";
                    dependencies.forEach((dep) => {
                        html += `<p>${dep}</p><button class="smallbutton" id="rem_dip_${index}_${dep}" title="remove">&times;</button>\n`;
                        removeDependencyCallbacks.push([`rem_dip_${index}_${dep}`, ()=>{
                        vscode.postMessage({
                            command: 'remove_function_dependency',
                            index: index,
                            keyword: dep
                        });
                        }]);
                    });
                    html += "</div>\n";
                }
            } else {
                let dependencies = Object.entries(element.dependsOn).map(([key, value]) => [`${key} (cell [${value}])`, key]);
                const cellWildcards = element.wildcards.map((wildcard) => [wildcard + " (Wildcard)", wildcard]);
                dependencies = [...dependencies, ...cellWildcards];
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
        const actionButtonDepends = document.getElementById('addDependency')
        const actionButtonWrites = document.getElementById('addWrite')
        const actionButtonWildcards = document.getElementById('addWildcards')
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
                    selectedCell = i;
                    selectedText = selection.toString().trim();
                    
                    const textIsInCellReads = cells.cells[i].reads.includes(selectedText);
                    const textIsInCellWrites = cells.cells[i].writes.includes(selectedText);
                    const textIsInCellWildcards = cells.cells[i].wildcards.includes(selectedText);

                    actionButton.style.top = `${rect.bottom + window.scrollY}px`;
                    actionButton.style.left = `${rect.left + window.scrollX}px`;
                    actionButton.style.display = 'flex';
                    if (cells.cells[i].isFunctions){
                        actionButtonWrites.style.display = 'none';
                        actionButtonWildcards.style.display = 'none';
                    } else {
                        //Can add to writes if not already in it
                        actionButtonWrites.style.display = textIsInCellWrites ? 'none' : 'flex';
                        actionButtonDepends.style.display = (textIsInCellReads && !textIsInCellWildcards) ? 'none' : 'flex';
                        actionButtonWildcards.style.display = (textIsInCellWildcards) ? 'none' : 'flex';
                    }
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
        function addWildcard(){
            actionButton.style.display = 'none';
            vscode.postMessage({
                command: 'add_to_wildcards',
                index: selectedCell,
                keyword: selectedText
            });
        }
        document.getElementById('addWildcards').addEventListener('click', addWildcard);
        OldEventListener.push([document.getElementById('addWildcards'), "click", addWildcard]);
    }
    
    let resizeObserver = null;

    function set_rules(cells){
        let html = "";
        const missingDependencies = [...cells.cells.map((cell,index) => {return {i: index, d: cell.missingDependencies.join(", ")}}).filter(c => c.d.length>0)].flat();
        const hasMissingDependency = missingDependencies.length > 0;
        const cellsUndecidedState = cells.cells.flatMap((cell, index) => cell.rule.type === "undecided" ? index : [])
        const hasUndecidedRules = cellsUndecidedState.length > 0;

        if (hasMissingDependency){
            html = "<h2>&#9888; The cells have some missing data dependencies:</h2>\n";
            html += `<div class="warning_about_cells">\n`;
            missingDependencies.forEach((element) => {
                html += `<p>Cell ${element.i} is missing dependency: ${element.d}</p>\n`;
            });
            html += "</div>\n";
            html += "<p>Please fix the dependencies by either removing them or adding writes manually.</p>\n";
            document.getElementById('data_dependency_errors').innerHTML = html;
        } else {
            document.getElementById('data_dependency_errors').innerHTML = "";
        }
        if (hasUndecidedRules){
            html = "<h2>&#9888; Some cells are in an Undecided state:</h2>\n";
            html += `<div class="warning_about_cells">\n`;
            cellsUndecidedState.forEach((element) => {
                html += `<p>Cell ${element}</p>\n`;
            });
            html += "</div>\n";
            html += "<p>Please set these cells either as Scripts or Rules.</p>\n";
            document.getElementById('undecided_cells').innerHTML = html;
        } else {
            document.getElementById('undecided_cells').innerHTML = "";
        }
        const mainHeader = document.getElementById('proceed_button_container');
        mainHeader.innerHTML = `<button id="produce_snakefile_button" ${hasMissingDependency || hasUndecidedRules ? 'disabled' : ''}>Proceed to step 2</button>\n`;
        html = "";

        cells.cells.forEach((cell, index) => {
            const element =cell.rule;
            const container = document.getElementById(`cell_rule_${index}_container`);
            let html = "";
            let actions = [];
            if (element.type==="rule"){
                html += `<p>Export as: <strong>Snakemake Rule</strong></p>\n`;
                html += "<div class='cell_rule_preview'>\n";
                html += `<p>rule ${element.name}:</p>\n`;
                html += `<p>    input:</p>\n`;
                let inputs = new Set();
                Object.keys(element.rule_dependencies).forEach((key) => {
                    inputs.add(`output of ${cells.cells[element.rule_dependencies[key]].rule.name}`);
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
            if (element.type!=="rule" && element.canBecomeStatic["rule"]){
                html += `<button id="become_rule_${index}">Become Rule</button>\n`;
                actions.push([`become_rule_${index}`, () => {
                    vscode.postMessage({
                        command: 'become_rule',
                        index: index
                    });
                }]);
            }
            if (element.type!=="script" && element.canBecomeStatic["script"]){
                html += `<button id="become_script_${index}">Become Script</button>\n`;
                actions.push([`become_script_${index}`, () => {
                    vscode.postMessage({
                        command: 'become_script',
                        index: index
                    });
                }]);
            }
            if (element.type!=="undecided" && element.canBecomeStatic["undecided"]){
                html += `<button id="become_undecided_${index}">Become Undecided</button>\n`;
                actions.push([`become_undecided_${index}`, () => {
                    vscode.postMessage({
                        command: 'become_undecided',
                        index: index
                    });
                }]);
            }
            html += "</div>\n";
            container.innerHTML = html;
            actions.forEach(([id, callback]) => {
                const button = document.getElementById(id);
                if (button) {
                    button.onclick = callback;
                }
            }); 
        });
        document.getElementById('produce_snakefile_button').addEventListener('click', () => {
            vscode.postMessage({
                command: 'produce_snakefile'
            });
        });

        
        const savedScrollPos = {
            x: window.scrollX,
            y: window.scrollY
        };          

        //Observe resize of window and adjust arrows accordingly
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
    
        let resizeTimeout; //Debouncer
        const targetElement = document.getElementById("mainContainer");
        resizeObserver = new ResizeObserver(entries => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                console.log("Adjusting arrows SVG")
                window.scrollTo(0, 0);
                initializeArrows();
                buildDependencyLines(cells);
                window.scrollTo(savedScrollPos.x, savedScrollPos.y);
            }, 200);
        });
        resizeObserver.observe(targetElement);
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
            case 'set_output':
                set_output(message.data);
                break;
        }
    });

    function buildDependencyLines(cells){
        /**For each line must decide: horizontal offset, vertical offset for start and end 
         * Horizontal: data structure for each cell, computing the min. available offset
        */
        const OFFSET_DELTA = 10; const OFFSET_START = 20;
        const linesDiv = document.getElementById('lines');
        const linesDivWidth = linesDiv.getBoundingClientRect().width;
        const MAX_OFFSET = (linesDivWidth - OFFSET_START) / OFFSET_DELTA;
        let offsets;
        let h_offset = cells.cells.map(() => new Set());

       function addDependencyArrow(VAR_NAME, CELL_IND, i, helper_text){
            offsets = new Set();
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
            let text = "";
            if (i !== CELL_IND){
                text = `Cell ${i} ${helper_text} ${VAR_NAME} of cell ${CELL_IND}`;
                drawArrows(`cell${CELL_IND}`, `cell${i}`, OFFSET_START + minOffset * OFFSET_DELTA, text);
            } else {
                text = `Cell ${i} has wildcard ${VAR_NAME}`
                drawArrows(`cell${CELL_IND}`, `cell${i}`, OFFSET_START + MAX_OFFSET+10, text);
            }
            
       }
        for (let i = 1; i < cells.cells.length; i++) {
            const cell = cells.cells[i];
            offsets = new Set();
            const mergedDependencies = {};
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
            cell.wildcards.forEach((wildcard) => {
                addDependencyArrow(wildcard, i, i, "is wildcard");
            });

            const mergedFunctionCalls = {};
            Object.entries(cell.dependsOnFunction).forEach(([var_name, target]) => {
                if (mergedFunctionCalls[target] !== undefined){
                    mergedFunctionCalls[target] = [...mergedFunctionCalls[target], var_name];
                } else {
                    mergedFunctionCalls[target] = [var_name];
                }
            });
            Object.entries(mergedFunctionCalls).forEach(([target, variables]) => {
                addDependencyArrow(variables.join(", "), target, i, "calls function");
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
        const lineWidth = 2;

        const arrowColor = getRandomColor();

        const Y1 = rect1.top + rect1.height * (0.75 + (Math.random() - 0.5)*0.2);
        let Y2;
        if (id_a === id_b){
            Y2 = Y1;
        } else {
            Y2 = rect2.top + rect2.height * (0.25 + (Math.random() - 0.5)*0.2);
        }
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
        line.setAttribute("stroke-width", lineWidth);
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
        line.setAttribute("stroke-width", lineWidth);
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
        line.setAttribute("stroke-width", lineWidth);
        svg.appendChild(line);
    }

    function getRandomColor() {
        //const colors = ["#24DFE2", "#B4FF2B", "#FFEE00","#FF9400", "#04E762","#008BF8","#ff0000"];
        const colors = [
            "#4D908E", "#43AA8B", "#90BE6D", "#F9C74F", "#F9844A", "#F8961E", "#F3722C", "#F94144", "#4CC9F0"
        ];
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
        const height_px = document.getElementById('mainContainer').getBoundingClientRect().height + document.getElementById('main_header').getBoundingClientRect().height;
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