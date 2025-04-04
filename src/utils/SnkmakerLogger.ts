import { BashCommand } from "../model/TerminalHistory";
import * as vscode from 'vscode';

//Singleton class to log activity.

export class SnkmakerLogger{
    static instance_?: SnkmakerLogger = undefined;
    static disabledInSession: boolean = false;
    static URLs: string[] = ["https://www.3plex.unito.it/snakemaker","http://192.168.99.164/snakemaker"];
    URL: string = "";


    static async initialize(version: string){
        const logging = vscode.workspace.getConfiguration('snakemaker').get('allowLogging', false);
        if (logging){
            SnkmakerLogger.createInstance(version);
        }
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration("snakemaker.allowLogging")) {
                const logging = vscode.workspace.getConfiguration('snakemaker').get('allowLogging', false);
                if (logging){
                    SnkmakerLogger.createInstance(version);
                } else {
                    SnkmakerLogger.destroy();
                }
            }
        });
    }

    private static async createInstance(version: string){
        if (SnkmakerLogger.instance_){
            throw new Error("Logger already initialized");
        }
        let instance_: SnkmakerLogger;
        for (const url of SnkmakerLogger.URLs){
            instance_ = new SnkmakerLogger(version);
            instance_.session_key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            instance_.URL = url;
            try{
                const response: any = await instance_.callAPI("/new_session", {});
                console.log(response);
                instance_.session_confirmation_key = response["confirmation_key"]||"";
                SnkmakerLogger.instance_ = instance_;
                SnkmakerLogger.disabledInSession = false;
                break;
            } catch(e: any){
                SnkmakerLogger.instance_ = undefined;
            }
        }
    }
    static destroy(){
        SnkmakerLogger.disabledInSession = false;
        SnkmakerLogger.instance_ = undefined;
    }

    static instance(): SnkmakerLogger|undefined{
        return SnkmakerLogger.instance_;
    }

    static loggerStatus(): string{
        if (SnkmakerLogger.disabledInSession){
            return "Disabled_in_current_session";
        } else if (SnkmakerLogger.instance_){
            return "Enabled";
        } else {
            return "Disabled";
        }
    }

    session_key: string = "";
    session_timestamp: number = Date.now();
    session_confirmation_key: string = "";
    private constructor(private version: string){}

    async callAPI(path:string, data: any){
        data["session_key"] = this.session_key;
        data["timestamp"] = this.session_timestamp;
        data["extension_version"] = this.version;
        data["session_confirmation_key"] = this.session_confirmation_key;
        return fetch(this.URL+path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        }).then(response => {
            if (!response.ok){return null;}
            return response.json();
        }).catch(error => {console.log(error); return null;});
    }

    async disableInSession(){
        SnkmakerLogger.disabledInSession = true;
        return this.callAPI("/log/delete_all_logs", {}).then(() => {
            return true;
        }).catch(() => {
            return false;
        }).finally(() => {
            SnkmakerLogger.instance_ = undefined;
        });
    }

    addCommand(command: BashCommand){
        try{
            this.callAPI("/log/add_command", {
                command: command.getCommand(),
                index: command.getIndex(),
            });
        } catch(e){
            console.log(e);
        }
    }
    addCommandExisting(command: BashCommand, user_string: string){
        try{
            this.callAPI("/log/add_command_existing", {
                command: command.getCommand(),
                new_command: user_string,
                index: command.getIndex(),
            });
        } catch(e){
            console.log(e);
        }
    }
    commandDetails(command: BashCommand, manual: boolean = false){
        try{
            this.callAPI("/log/command_details", {
                command: command.getCommand(),
                manual: manual,
                input: command.getInput(),
                output: command.getOutput(),
                rule_name: command.getRuleName(),
                index: command.getIndex(),
            });
        } catch(e){
            console.log(e);
        }
    }
    setCommandImportance(command: BashCommand, isImportant: boolean){
        try{
            this.callAPI("/log/set_command_importance", {
                command: command.getCommand(),
                importance: isImportant,
                index: command.getIndex()
            });
        } catch(e){
            console.log(e);
        }
    }
    moveCommands(commands: BashCommand[], finished: boolean){
        try{
            this.callAPI("/log/move_commands", {
                commands: commands.map(command => [command?.getCommand(), command?.getIndex(), command?.getInput(), command?.getOutput(), command?.getRuleName()]),
                finished: finished
            });
        } catch(e){
            console.log(e);
        }
    }
    imported(commands: BashCommand[]){
        try{
            this.callAPI("/log/imported", {
                commands: commands.map(command => [command.getCommand(), command.getIndex(), command.getInput(), command.getOutput(), command.getRuleName()])
            });
        } catch(e){
            console.log(e);
        }
    }
    importedFromChat(commands: BashCommand[]){
        try{
            this.callAPI("/log/imported_chat", {
                commands: commands.map(command => [command.getCommand(), command.getIndex(), command.getInput(), command.getOutput(), command.getRuleName()])
            });
        } catch(e){
            console.log(e);
        }
    }
    log(value: string){
        try{
            this.callAPI("/log/log", {
                value: value
            });
        } catch(e){
            console.log(e);
        }
    }
    query(model: string, query: string, response: string){
        try{
            this.callAPI("/log/query", {
                model: model,
                query: query,
                response: response
            });
        } catch(e){
            console.log(e);
        }
    }
}