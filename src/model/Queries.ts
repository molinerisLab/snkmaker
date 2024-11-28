import { ModelComms } from "./ModelComms";

export class Queries{
    modelComms: ModelComms;
    constructor(modelComms: ModelComms){
        this.modelComms = modelComms;
    }
    async guess_input_output(command: string){
        const query = `I have the following bash command: ${command}.
Can you guess the filenames of input and outputs? I'm interested only in the filenames of what is read and written - not the things in between (es pipe operator).
If you are sure there is no input or output, please write "-". If unsure, for example because an unknown program is run, write "Unknown". stdin, stdout, stderr are not considered inputs or outputs, they are -.
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

    async guess_if_important(command: string){
        const query = `I have the following bash command: ${command}.
It might need to be translated into a snakemake rule, but it could be just a one-time command from the user.
Please write "YES" if it's worth making into a rule, "NO" if it's a one-time command. DO NOT, EVER output other things, only YES or NO.`;
        let response = await this.modelComms.run_query(query);
        console.log("Important: " +response);
        //make response lowercase
        response = response.toLowerCase();
        return !response.includes("no");
    }

    async get_snakemake_rule(command: string, inputs: string[], output: string){
        if (inputs[0] === "-"){ inputs = ["No input"];}
        if (output === "-"){ output = "No output";}
        const query = `Convert this bash command into a snakemake rule:
${command}
It is estimated that the input could be ${inputs.join(", ")} and the output could be ${output} - but it could be wrong.
Please output only the rule. Do not output other things.`;
        const response = await this.modelComms.run_query(query);
        return response;
    }

    async get_all_rules(commands: string){
        const query = `I have the following set of bash commands. Can you convert them into snakemake rules?
        ${commands}
        Please output only the Snakemake rules. DO NOT, EVER, OUTPUT ANYTHING OTHER THAN THE RULES.`;
        const response = await this.modelComms.run_query(query);
        return response;
    }
}