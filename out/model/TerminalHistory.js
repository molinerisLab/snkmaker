"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BashCommandContainer = exports.TerminalHistory = void 0;
const Queries_1 = require("./Queries");
class TerminalHistory {
    history;
    archive;
    llm;
    queries;
    index;
    constructor(llm) {
        this.history = [];
        this.archive = [];
        this.llm = llm;
        this.queries = new Queries_1.Queries(this.llm);
        this.index = 0;
    }
    async addCommand(value, confidence, isTrusted) {
        const index_existing = this.isCommandInHistory(value);
        if (index_existing !== -1) {
            const command = this.history[index_existing];
            this.history.splice(index_existing, 1);
            this.history.push(command);
            return;
        }
        const singleTempCommand = new SingleBashCommand(value, 0, "", "", false, this.index, true);
        const tempCommand = new BashCommandContainer(singleTempCommand, this.index + 1);
        this.index += 2;
        this.history.push(tempCommand);
        const important = this.queries.guess_if_important(value);
        const guesses = this.queries.guess_rule_details(value);
        //Wait for both promises to resolve
        await Promise.all([important, guesses]).then((values) => {
            const important = values[0];
            const guesses = values[1];
            singleTempCommand.set_input(guesses[0]);
            singleTempCommand.set_output(guesses[1]);
            singleTempCommand.set_rule_name(guesses[2]);
            singleTempCommand.set_importance(important);
            tempCommand.set_temporary(false);
        });
    }
    getHistory() {
        return this.history;
    }
    getArchive() {
        return this.archive;
    }
    //TODO: optimize using a hashmap
    //Returns index of the command in the history, -1 if not found
    //if it's subcommand returns input of parent
    isCommandInHistory(command) {
        for (var i = 0; i < this.history.length; i++) {
            const c = this.history[i];
            if (c.get_num_children() === 0 && c.get_command() === command) {
                return i;
            }
            for (var j = 0; j < c.get_num_children(); j++) {
                if (c.get_children(j)?.get_command() === command) {
                    return i;
                }
            }
        }
        return -1;
    }
    archiveCommand(command) {
        const index = this.history.indexOf(command);
        if (index > -1 && command.get_temporary() === false) {
            this.history.splice(index, 1);
            this.archive.push(command);
        }
    }
    deleteCommand(command) {
        var index = this.history.indexOf(command);
        if (index > -1) {
            this.history.splice(index, 1);
            return 0;
        }
        else {
            index = this.archive.indexOf(command);
            if (index > -1) {
                this.archive.splice(index, 1);
                return 1;
            }
            return -1;
        }
    }
    deleteAllCommands() {
        this.history = [];
    }
    restoreCommand(command) {
        const index = this.archive.indexOf(command);
        const index_existing = this.isCommandInHistory(command.get_command());
        if (index > -1) {
            this.archive.splice(index, 1);
            if (index_existing === -1) {
                this.history.push(command);
            }
            else {
                //Move the command to the end of the history
                this.history.splice(index_existing, 1);
                this.history.push(command);
            }
        }
    }
    archiveAllCommands() {
        this.archive = this.archive.concat(this.history);
        this.history = [];
    }
    setCommandImportance(command, importance) {
        command.set_importance(importance);
    }
    async getRule(command) {
        if (command.get_temporary() === true) {
            return "";
        }
        command.set_temporary(true);
        //TODO
        const r = await this.queries.get_snakemake_rule(command);
        command.set_temporary(false);
        return r;
    }
    async getAllRules() {
        const important = this.history.filter(command => command.get_important() === true && command.get_temporary() === false);
        if (important.length === 0) {
            return null;
        }
        important.forEach(command => command.set_temporary(true));
        const r = await this.queries.get_all_rules(important);
        important.forEach(command => command.set_temporary(false));
        return r;
    }
    modifyCommandDetail(command, modifier, detail) {
        if (modifier === "Inputs") {
            command.set_input(detail);
        }
        else if (modifier === "Output") {
            command.set_output(detail);
        }
        else if (modifier === "RuleName") {
            command.set_rule_name(detail);
        }
    }
    async moveCommands(sourceBashCommands, targetBashCommand) {
        var remake_names = [];
        const children = sourceBashCommands.map((c) => c[0].pop_children(c[1]));
        sourceBashCommands.forEach((c) => {
            if (c[0].is_dead()) {
                this.history.splice(this.history.indexOf(c[0]), 1);
            }
            else {
                remake_names.push(c[0]);
            }
        });
        if (targetBashCommand) {
            remake_names.push(targetBashCommand);
            children.forEach((c) => {
                targetBashCommand.add_child(c);
            });
        }
        else {
            children.forEach((c) => {
                this.history.push(new BashCommandContainer(c, this.index++));
            });
        }
        await Promise.all(remake_names.map(async (c) => {
            c.set_temporary(true);
            const new_name = await this.queries.re_guess_name(c);
            c.set_rule_name(new_name);
            c.set_temporary(false);
        }));
        return remake_names.length !== 0;
    }
    export() {
        return JSON.stringify({
            history: this.history,
            archive: this.archive,
            index: this.index
        });
    }
    history_for_the_chat() {
        return this.history.length === 0 ? "History is Empty" : JSON.stringify(this.history);
    }
    import(data) {
        const parsed = JSON.parse(data);
        this.history = parsed.history.map((cmd) => {
            const singleCommands = cmd.commands.map((sc) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.add_child(singleCommands[i]);
            }
            return container;
        });
        this.archive = parsed.archive.map((cmd) => {
            const singleCommands = cmd.commands.map((sc) => new SingleBashCommand(sc.command, sc.exitStatus, sc.inputs, sc.output, sc.important, sc.index, sc.temporary));
            const container = new BashCommandContainer(singleCommands[0], cmd.index);
            for (let i = 1; i < singleCommands.length; i++) {
                container.add_child(singleCommands[i]);
            }
            return container;
        });
        this.index = parsed.index;
    }
}
exports.TerminalHistory = TerminalHistory;
class BashCommandContainer {
    commands;
    index;
    rule_name = "";
    constructor(command, index) {
        this.commands = [command];
        this.index = index;
    }
    get_rule_name() {
        if (this.commands.length === 1) {
            return this.commands[0].get_rule_name();
        }
        return this.rule_name;
    }
    set_rule_name(rule_name) {
        if (this.commands.length === 1) {
            this.commands[0].set_rule_name(rule_name);
        }
        this.rule_name = rule_name;
    }
    get_command() {
        return this.commands.map((c) => c.get_command()).join(" && ");
    }
    get_input() {
        if (this.commands.length === 1) {
            return this.commands[0].get_input();
        }
        //Return all inputs but removing duplicates
        var inputs = new Set();
        var outputs = new Set();
        this.commands.forEach((c) => {
            inputs.add(c.get_input());
            outputs.add(c.get_output());
        });
        //Delete all elements in outputs from inputs 
        outputs.forEach((o) => inputs.delete(o));
        return Array.from(inputs).join(" && ");
    }
    is_dead() {
        return this.commands.length === 0;
    }
    add_child(command) {
        this.commands.push(command);
    }
    get_output() {
        return this.commands[this.commands.length - 1].get_output();
    }
    get_important() {
        return this.commands.some((c) => c.get_important());
    }
    get_temporary() {
        return this.commands.some((c) => c.get_temporary());
    }
    get_num_children() {
        if (this.commands.length === 1) {
            return 0;
        }
        return this.commands.length;
    }
    get_children(index) {
        if (index < this.commands.length) {
            return this.commands[index];
        }
        return null;
    }
    pop_children(index) {
        if (index < this.commands.length) {
            return this.commands.splice(index, 1)[0];
        }
    }
    get_index() {
        return this.index;
    }
    set_importance(important) {
        this.commands.forEach((c) => c.important = important);
    }
    set_temporary(temporary) {
        this.commands.forEach((c) => c.temporary = temporary);
    }
    set_input(input) {
        if (this.commands.length === 1) {
            this.commands[0].inputs = input;
            return;
        }
        throw new Error("Cannot set input for a container command");
    }
    set_output(output) {
        if (this.commands.length === 1) {
            this.commands[0].output = output;
            return;
        }
        throw new Error("Cannot set output for a container command");
    }
}
exports.BashCommandContainer = BashCommandContainer;
class SingleBashCommand {
    command;
    exitStatus;
    output;
    inputs;
    important;
    index;
    temporary;
    rule_name;
    constructor(command, exitStatus, input, output, important, index, temporary = false, subCommands = []) {
        this.command = command;
        this.rule_name = command;
        this.exitStatus = exitStatus;
        this.inputs = input;
        this.output = output;
        this.important = important;
        this.index = index;
        this.temporary = temporary;
    }
    get_command() {
        return this.command;
    }
    get_input() {
        return this.inputs;
    }
    get_output() {
        return this.output;
    }
    get_important() {
        return this.important;
    }
    get_temporary() {
        return this.temporary;
    }
    get_num_children() {
        return 0;
    }
    get_children(index) {
        return null;
    }
    get_rule_name() {
        return this.rule_name;
    }
    get_index() {
        return this.index;
    }
    set_importance(important) {
        this.important = important;
    }
    set_temporary(temporary) {
        this.temporary = temporary;
    }
    set_input(input) {
        this.inputs = input;
    }
    set_output(output) {
        this.output = output;
    }
    set_rule_name(rule_name) {
        this.rule_name = rule_name;
    }
}
//# sourceMappingURL=TerminalHistory.js.map