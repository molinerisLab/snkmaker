import { BashCommand } from "../model/TerminalHistory";


//Singleton class to log activity. Yes yes it's an anti-pattern but I'm not getting into dependency injection in this small feature.
export class Logger{
    static instance_?: Logger = undefined;
    static URL: string = "https://www.3plex.unito.it/snakemaker";
    static disabled_in_session: boolean = false;

    static initialize(version: string){
        if (Logger.instance_){
            throw new Error("Logger already initialized");
        }
        console.log("Start logger");
        const instance_ = new Logger(version);
        instance_.session_key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        try{
            instance_.callAPI("/new_session", {}).then(
                (response: any) => {
                    console.log(response);
                    this.instance_ = response["confirmation_key"];
                }
            ).catch((error: any) => {});
        } catch(e: any){
            Logger.instance_ = undefined;
        }
        Logger.instance_ = instance_;
        Logger.disabled_in_session = false;
    }
    static destroy(){
        console.log("Destroy logger");
        Logger.instance_ = undefined;
    }

    static instance(): Logger|undefined{
        return Logger.instance_;
    }

    static logger_status(): string{
        if (Logger.disabled_in_session){
            return "Disabled_in_current_session";
        } else if (Logger.instance_){
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
        return fetch(Logger.URL+path, {
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

    async delete_all_logs(){
        Logger.disabled_in_session = true;
        return this.callAPI("/log/delete_all_logs", {});
    }

    addCommand(command: BashCommand){
        try{
            this.callAPI("/log/add_command", {
                command: command.get_command(),
                index: command.get_index(),
            });
        } catch(e){
            console.log(e);
        }
    }
    addCommandExisting(command: BashCommand, user_string: string){
        try{
            this.callAPI("/log/add_command_existing", {
                command: command.get_command(),
                new_command: user_string,
                index: command.get_index(),
            });
        } catch(e){
            console.log(e);
        }
    }
    commandDetails(command: BashCommand, manual: boolean = false){
        try{
            this.callAPI("/log/command_details", {
                command: command.get_command(),
                manual: manual,
                input: command.get_input(),
                output: command.get_output(),
                rule_name: command.get_rule_name(),
                index: command.get_index(),
            });
        } catch(e){
            console.log(e);
        }
    }
    setCommandImportance(command: BashCommand, isImportant: boolean){
        try{
            this.callAPI("/log/set_command_importance", {
                command: command.get_command(),
                importance: isImportant,
                index: command.get_index()
            });
        } catch(e){
            console.log(e);
        }
    }
    moveCommands(commands: BashCommand[], finished: boolean){
        try{
            this.callAPI("/log/move_commands", {
                commands: commands.map(command => [command?.get_command(), command?.get_index(), command?.get_input(), command?.get_output(), command?.get_rule_name()]),
                finished: finished
            });
        } catch(e){
            console.log(e);
        }
    }
    imported(commands: BashCommand[]){
        try{
            this.callAPI("/log/imported", {
                commands: commands.map(command => [command.get_command(), command.get_index(), command.get_input(), command.get_output(), command.get_rule_name()])
            });
        } catch(e){
            console.log(e);
        }
    }
    importedFromChat(commands: BashCommand[]){
        try{
            this.callAPI("/log/imported_chat", {
                commands: commands.map(command => [command.get_command(), command.get_index(), command.get_input(), command.get_output(), command.get_rule_name()])
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