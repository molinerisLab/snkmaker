"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queries = void 0;
class Queries {
    modelComms;
    constructor(modelComms) {
        this.modelComms = modelComms;
    }
    async guess_input_output(command) {
        const query = `I have the following bash command: ${command}.
Can you guess the filenames of input and outputs? Only the filenames of what is read and written are important - not the things in between (es pipe operator), and stdin,stdout and stderr are not considered inputs or outputs.
Consider that when unknown programs are executed, they might write to files and you don't know what they are.
If you are sure there is no input or output, please write "-". If it cannot be determined, write "Unknown".
        Please write: INPUT=[...]; OUTPUT=[...]. DO NOT, EVER output other things, only INPUT=[...], OUTPUT=[...]`;
        const response = await this.modelComms.run_query(query);
        //Parse response
        const split = response.split(";");
        const input = split[0].split("=")[1];
        const output = split[1].split("=")[1];
        //Remove [ and ] from strings
        input.replace("[", "").replace("]", "");
        output.replace("[", "").replace("]", "");
        return [input, output];
    }
    async guess_if_important(command) {
        const query = `I have the following bash command: ${command}.
It might need to be translated into a snakemake rule, but it could be just a one-time command from the user. Generally, things that for sure do not write to files are not worth making into rules.
Please write "YES" if it's worth making into a rule, "NO" if it's a one-time command. DO NOT, EVER output other things, only YES or NO.`;
        let response = await this.modelComms.run_query(query);
        console.log("Important: " + response);
        //make response lowercase
        response = response.toLowerCase();
        return !response.includes("no");
    }
    async get_snakemake_rule(command, inputs, output) {
        if (inputs[0] === "-") {
            inputs = ["No input"];
        }
        if (output === "-") {
            output = "No output";
        }
        const query = `Convert this bash command into a snakemake rule:
${command}
It is estimated that the input could be ${inputs.join(", ")} and the output could be ${output} - but it could be wrong.
Please output only the rule. Do not output other things.`;
        const response = await this.modelComms.run_query(query);
        return response;
    }
    async get_all_rules(commands) {
        const query = `I have the following set of bash commands. Can you convert them into snakemake rules?
        ${commands}
        Please output only the Snakemake rules. DO NOT, EVER, OUTPUT ANYTHING OTHER THAN THE RULES.`;
        const response = await this.modelComms.run_query(query);
        return response;
    }
}
exports.Queries = Queries;
//# sourceMappingURL=Queries.js.map