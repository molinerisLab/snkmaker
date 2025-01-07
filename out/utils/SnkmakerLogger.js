"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnkmakerLogger = void 0;
//Singleton class to log activity. Yes yes it's an anti-pattern but I'm not getting into dependency injection in this small feature.
class SnkmakerLogger {
    version;
    static instance_ = undefined;
    static URLs = ["https://www.3plex.unito.it/snakemaker", "http://192.168.99.164/snakemaker"];
    URL = "";
    static disabled_in_session = false;
    static async initialize(version) {
        if (SnkmakerLogger.instance_) {
            throw new Error("Logger already initialized");
        }
        console.log("Start logger");
        var instance_;
        for (const url of SnkmakerLogger.URLs) {
            instance_ = new SnkmakerLogger(version);
            instance_.session_key = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            instance_.URL = url;
            try {
                const response = await instance_.callAPI("/new_session", {});
                console.log(response);
                instance_.session_confirmation_key = response["confirmation_key"] || "";
                SnkmakerLogger.instance_ = instance_;
                SnkmakerLogger.disabled_in_session = false;
                break;
            }
            catch (e) {
                SnkmakerLogger.instance_ = undefined;
            }
        }
    }
    static destroy() {
        console.log("Destroy logger");
        SnkmakerLogger.instance_ = undefined;
    }
    static instance() {
        return SnkmakerLogger.instance_;
    }
    static logger_status() {
        if (SnkmakerLogger.disabled_in_session) {
            return "Disabled_in_current_session";
        }
        else if (SnkmakerLogger.instance_) {
            return "Enabled";
        }
        else {
            return "Disabled";
        }
    }
    session_key = "";
    session_timestamp = Date.now();
    session_confirmation_key = "";
    constructor(version) {
        this.version = version;
    }
    async callAPI(path, data) {
        data["session_key"] = this.session_key;
        data["timestamp"] = this.session_timestamp;
        data["extension_version"] = this.version;
        data["session_confirmation_key"] = this.session_confirmation_key;
        return fetch(this.URL + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        }).then(response => {
            if (!response.ok) {
                return null;
            }
            return response.json();
        }).catch(error => { console.log(error); return null; });
    }
    async delete_all_logs() {
        SnkmakerLogger.disabled_in_session = true;
        return this.callAPI("/log/delete_all_logs", {});
    }
    addCommand(command) {
        try {
            this.callAPI("/log/add_command", {
                command: command.get_command(),
                index: command.get_index(),
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    addCommandExisting(command, user_string) {
        try {
            this.callAPI("/log/add_command_existing", {
                command: command.get_command(),
                new_command: user_string,
                index: command.get_index(),
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    commandDetails(command, manual = false) {
        try {
            this.callAPI("/log/command_details", {
                command: command.get_command(),
                manual: manual,
                input: command.get_input(),
                output: command.get_output(),
                rule_name: command.get_rule_name(),
                index: command.get_index(),
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    setCommandImportance(command, isImportant) {
        try {
            this.callAPI("/log/set_command_importance", {
                command: command.get_command(),
                importance: isImportant,
                index: command.get_index()
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    moveCommands(commands, finished) {
        try {
            this.callAPI("/log/move_commands", {
                commands: commands.map(command => [command?.get_command(), command?.get_index(), command?.get_input(), command?.get_output(), command?.get_rule_name()]),
                finished: finished
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    imported(commands) {
        try {
            this.callAPI("/log/imported", {
                commands: commands.map(command => [command.get_command(), command.get_index(), command.get_input(), command.get_output(), command.get_rule_name()])
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    importedFromChat(commands) {
        try {
            this.callAPI("/log/imported_chat", {
                commands: commands.map(command => [command.get_command(), command.get_index(), command.get_input(), command.get_output(), command.get_rule_name()])
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    log(value) {
        try {
            this.callAPI("/log/log", {
                value: value
            });
        }
        catch (e) {
            console.log(e);
        }
    }
    query(model, query, response) {
        try {
            this.callAPI("/log/query", {
                model: model,
                query: query,
                response: response
            });
        }
        catch (e) {
            console.log(e);
        }
    }
}
exports.SnkmakerLogger = SnkmakerLogger;
//# sourceMappingURL=SnkmakerLogger.js.map