(function () {
    const vscode = acquireVsCodeApi();
    let enabled = true;
    let lastResponse = 0;


    function toggleEnabled() {
        document.getElementById('input').disabled = !enabled;
    }

    function resetChat() {
        const chatMessageContainer = document.getElementById('chat-messages-container');
        while (chatMessageContainer.firstChild) {
            chatMessageContainer.removeChild(chatMessageContainer.firstChild);
        }
        const header = document.getElementById('chat-header');
        header.style.setProperty('display', 'flex');
        this.enabled = true;
        toggleEnabled();
    }

    function createNewModelResponse(text, is_loading = true) {
        lastResponse++;
        const responseNode = document.createElement('div');
        responseNode.className = 'chat-bot-container';
        const html = document.getElementById('chat-bot-container-template').innerHTML;
        responseNode.innerHTML = html;
        responseNode.id = `response-${lastResponse}`;
        document.getElementById('chat-messages-container').appendChild(responseNode);
        updateModelResponse(text, is_loading);          
    }

    function updateModelResponse(text, is_loading = true, is_error = false) {
        const responseNode = document.getElementById(`response-${lastResponse}`);
        if (!responseNode) {
            return;
        }
        const paragraph = responseNode.querySelector('.response-text-container');
        paragraph.innerHTML = "\n\n"+text+"\n\n";
        if (is_error) {
            paragraph.style.setProperty('color', 'red');
        }
        const loadingText = responseNode.querySelector('.loading_text');
        loadingText?.style.setProperty('display', is_loading ? 'block' : 'none');
        const chatMessageContainer = document.getElementById('chat-messages-container');
        chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
        if (!is_loading) {
            enabled = true;
            toggleEnabled();
        }
    }

    function modelError(){
        enabled = true;
        toggleEnabled();
        updateModelResponse('Your LLM is feeling sick :( Please try again later.', false, true);
    }

    function userSubmit(prompt){
        if (!enabled) {
            return;
        }
        const header = document.getElementById('chat-header');
        header.style.setProperty('display', 'none');
        enabled = false;
        toggleEnabled();
        const userMessageNode = document.createElement('div');
        userMessageNode.className = 'chat-user-container';
        userMessageNode.innerHTML = `<p><strong>User</strong></p><p>${prompt}</p>`;
        document.getElementById('chat-messages-container').appendChild(userMessageNode);
        createNewModelResponse('Loading...', true);
        vscode.postMessage({
            type: 'user_submit',
            prompt: prompt
        });
    }

    function main() {
        toggleEnabled();
        const input = document.getElementById('input');
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!enabled) {
                    return;
                }
                const prompt = input.value;
                if (prompt) {
                    input.value = '';
                    userSubmit(prompt);
                }
            }
        });
        const submitButton = document.getElementById('send-button');
        submitButton.addEventListener('click', event => {
            const prompt = input.value;
            if (!enabled) {
                return;
            }
            if (prompt) {
                input.value = '';
                userSubmit(prompt);
            }
        });
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'model_response_part':
                updateModelResponse(message.response, true);
                break;
            case 'model_response_end':
                updateModelResponse(message.response, false);
                break;
            case 'model_error':
                modelError();
            case 'reset_chat':
                resetChat();
                break;
            case 'switch_to_bash':
                document.getElementById('chat-mode-indicator-bash').style.setProperty('display', 'flex');
                document.getElementById('chat-mode-indicator-notebook').style.setProperty('display', 'none');
                document.getElementById('switch_to_bash').style.display = 'none';
                document.getElementById('switch_to_notebook').style.display = 'block';
                break;
            case 'switch_to_notebook':
                document.getElementById('chat-mode-indicator-bash').style.setProperty('display', 'none');
                document.getElementById('chat-mode-indicator-notebook').style.setProperty('display', 'flex');
                document.getElementById('switch_to_bash').style.display = 'block';
                document.getElementById('switch_to_notebook').style.display = 'none';
                break;
            
        }
    });

    document.getElementById('chat-mode-indicator-notebook').style.setProperty('display', 'none');

    main();

    document.addEventListener('click', event => {
        const target = event.target;
        if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('command:')) {
            event.preventDefault(); // Prevent the default link behavior
            const command = target.getAttribute('href').substring(8);
            vscode.postMessage({
                type: 'command',
                command: command
            });
        }
    });
    document.getElementById('switch_to_bash').addEventListener('click', () => {
        console.log('switch_to_bash');
        vscode.postMessage({
            type: 'switch_mode'
        });
    });
    document.getElementById('switch_to_notebook').addEventListener('click', () => {
        console.log('switch_to_notebook');
        vscode.postMessage({
            type: 'switch_mode'
        });
    });

}())