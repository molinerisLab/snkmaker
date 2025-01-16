
(function () {
    const vscode = acquireVsCodeApi();
    document.getElementById('button_submit').addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({
            command: 'submit',
            data: document.getElementById('history_commands').value
        });
    });

    document.getElementById('button_filter').addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({ 
            command: 'filter',
            data: document.getElementById('history_commands').value
        });
    });


    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'updateTextField':
                document.getElementById('history_commands').value = message.data;
                break;
        }
    });
}());