import * as vscode from 'vscode';

export class HiddenTerminal{
    terminal: vscode.Terminal;
    constructor(){
        this.terminal = vscode.window.createTerminal(
            {
                name: "Hidden Terminal",
                shellPath: "/usr//bin/bash",
                shellArgs: [],
                hideFromUser: true,
                env: {},
                iconPath: undefined,
                strictEnv: false
            }
        );
    }

    public async run_command(command: string){
        const shellExecution = this.terminal.shellIntegration?.executeCommand("echo SNKMKR_BR && "+command);
        const stream = shellExecution?.read();
        if (!stream){
            return;
        }
        var output = "";
        for await (const data of stream) {
            output += data;
        }
        //Remove the SNKMKR_BR prefix
        const split = output.split("SNKMKR_BR");
        const cleaned_up = split[split.length-1].substring(1);
        return cleaned_up;
    }
}