import { LLM } from "./ModelComms";
import { BashCommand } from "./TerminalHistory";

export class Queries{
    modelComms: LLM;
    constructor(modelComms: LLM){
        this.modelComms = modelComms;
    }
    async guess_rule_details(command: string){
        const query = `I have the following bash command: ${command}.
Can you guess the filenames of input and outputs? Only the filenames of what is read and written are important - not the things in between (es pipe operator), and stdin,stdout and stderr are not considered inputs or outputs.
Consider that when unknown programs are executed, they might write to files and you don't know what they are.
If you are sure there is no input or output, please write "-". If it cannot be determined, write "Unknown".
I would also like a short name of a theorical Snakemake rule for this command.
        Please write: INPUT=[...]; OUTPUT=[...]; NAME=[...]. DO NOT, EVER output other things, only INPUT=[...]; OUTPUT=[...]; NAME=[...]`;
        const response = await this.modelComms.run_query(query);
        //Parse response
        const split = response.split(";");
        const input = split[0].split("=")[1].replace("[", "").replace("]", "");
        const output = split[1].split("=")[1].replace("[", "").replace("]", "");
        const name = split[2].split("=")[1].replace("[", "").replace("]", "");
        return [input, output, name];
    }

    async guess_if_important(command: string, positive_examples: string[], negative_examples: string[]){
        var examples_query = "";
        if (positive_examples.length > 0){
            examples_query += `Examples of commands that are worth making into rules: ${positive_examples.join("; ")}\n`;
        }
        if (negative_examples.length > 0){
            examples_query += `Examples of commands that are NOT worth making into rules: ${negative_examples.join("; ")}\n`;
        }
        if (examples_query.length > 0){
            examples_query = `Use these examples to better understand what the user wants to convert into rule:\n${examples_query}`;
        }
        const query = `I have the following bash command: ${command}.
It might need to be translated into a snakemake rule, but it could be just a one-time command from the user. Generally, things that for sure do not write to files are not worth making into rules.
${examples_query}
Please write "YES" if it's worth making into a rule, "NO" if it's a one-time command. DO NOT, EVER output other things, only YES or NO.`;
        let response = await this.modelComms.run_query(query);
        console.log(query);
        console.log(response);
        //make response lowercase
        response = response.toLowerCase();
        return !response.includes("no");
    }

    async get_snakemake_rule(bashCommand: BashCommand){
        var inputs = bashCommand.get_input();
        var output = bashCommand.get_output();
        const command = bashCommand.get_command();
        if (inputs === "-"){ inputs = "No input";}
        if (output === "-"){ output = "No output";}
        const query = `Convert this bash command into a snakemake rule:
${command}
It is estimated that the input could be (${inputs}) and the output could be (${output}) - but it could be wrong. A possible name for the rule could be ${bashCommand.get_rule_name()}.
Please output only the rule. Do not output other things.`;
        const response = await this.modelComms.run_query(query);
        return response;
    }

    async get_all_rules(commands: BashCommand[]){
        const formatted = commands.map(command => 
            `\nEstimated inputs: (${command.get_input()}) Estimated outputs: (${command.get_output()})\nShell command: ${command.get_command()}\nPossible rule name: ${command.get_rule_name()}}\n`
        );
        const query = `I have the following set of bash commands. Can you convert them into snakemake rules? Note that Estimated inputs and outputs are just guesses and could be wrong.
        ${formatted.join("\n")}
        Please output only the Snakemake rules. DO NOT, EVER, OUTPUT ANYTHING OTHER THAN THE RULES.`;
        const response = await this.modelComms.run_query(query);
        return response;
    }

    async re_guess_name(command: BashCommand){
        const query = `I have the following bash command: ${command.get_command()}.
I would like a short name of a theorical Snakemake rule for this command.
Please output only the name. DO NOT, EVER output other things.`;
        const response = await this.modelComms.run_query(query);
        return response;
    }

}