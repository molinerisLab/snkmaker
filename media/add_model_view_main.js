
(function () {
    const vscode = acquireVsCodeApi();

    document.getElementById('modelForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = {
            max_tokens: document.getElementById('max_tokens').value,
            api_key: document.getElementById('api_key').value,
            model_name: document.getElementById('model_name').value,
            url: document.getElementById('url').value
        };
        vscode.postMessage({
            command: 'submit',
            data: formData
        });
    });
}());