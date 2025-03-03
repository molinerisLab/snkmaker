import { LLM } from "./ModelComms";
import { BashCommand } from "./TerminalHistory";
import { ExtensionSettings } from '../utils/ExtensionSettings';
import * as vscode from 'vscode';
import { OpenedSnakefileContent } from "../utils/OpenendSnakefileContent";

class ModelPrompts{
    static ruleDetailsPrompt(command: string): string{
        return `I have the following bash command: ${command}.
Can you guess the filenames of input and outputs? Only the filenames of what is read and written are important - not the things in between (es pipe operator), and stdin,stdout and stderr are not considered inputs or outputs.
Consider that when unknown programs are executed, they might write to files and you don't know what they are.
If you are sure there is no input or output, please write "-". If it cannot be determined, write "Unknown".
I would also like a short name of a theorical Snakemake rule for this command.
Please write: INPUT=[...]; OUTPUT=[...]; NAME=[...]. DO NOT, EVER output other things, only INPUT=[...]; OUTPUT=[...]; NAME=[...]. Do not forget the = symbol.`;
    }

    static commandImportancePrompt(command: string, examplesPrompt: string): string{
        return `I have the following bash command: ${command}.
It might need to be translated into a snakemake or a Make rule, but it could be just a one-time command from the user. Generally, things that for sure do not write to files are not worth making into rules.
${examplesPrompt}
Please write "YES" if it's worth making into a rule, "NO" if it's a one-time command. DO NOT, EVER output other things, only YES or NO.`;
        }

    static ruleFromCommandPrompt(command: string, ruleName: string, ruleFormat: string, inputs: string, output: string, rulesContext:string=""): string{
        const logField: boolean = ruleFormat==="Snakemake" && ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules()
        const comment: boolean = ruleFormat==="Snakemake" && ExtensionSettings.instance.getCommentEveryRule();
        let prompt = `Convert this bash command into a ${ruleFormat} rule:
${command}
It is estimated that the input could be (${inputs}) and the output could be (${output}) - but it could be wrong. A possible name for the rule could be ${ruleName}.${rulesContext}
Please do not remove the new-lines chosen by the user. You might add new-lines for readability but only if necessary.
${ruleFormat==="Snakemake" ? "Please use named input and outputs, with meaningful names. For example input:\n\tbam_file='somefile.bam'\n" : ""}`;
        prompt += "If the rule contains some type of loop - like a for loop - acting on multiple files, generate one rule with wildcards to implement the loop body, and an additional rule that uses an 'expand' to generate all output files. The name of the second rule should NOT be 'all', should be a meaningful name connected to the original rule."
        prompt += logField ? "\nPlease add a log field to the rule with the name of the log file. For example, log: 'logs/{rule}.log'. If the rule contains wildcards, they must be part of the log file name or Snakemake will throw an error. Log field must be added before shell field." : "";
        prompt += comment ? "\nPlease add a short comment describing what the rule does. The comment must be short. Do not say 'this rule does...' or cite the name of the rule, it's a waste of characters, just say what it does. The comment must be just before the definition of the rule, es. #This rule does something\nrule something: ..." : "";
        prompt += "\nPlease return the rule in JSON format. The JSON contains a single field 'rule' which is a string, that contains the entire rule. Es. {rule: string}";
        //Please output only the rule. What you output goes entirely in the ${ruleFormat} file, so Do not output other things. Example of good output: "<RULE>". Examples of bad output: "Here is the rule <RULE>" or "<RULE> is the rule" or  or "<Comment/Title of rule><RULE>".
    return prompt;
    }

    static guessNamePrompt(command: string): string{
        return `I have the following bash command: ${command}.
I would like a short name of a theorical Snakemake rule for this command.
Please output only the name. DO NOT, EVER output other things.`;
    }

    static correctRulesFromErrorPrompt(rules: string, error: string): string{
        return `I have the following rules:\n\n${rules}\n\nI tried to run them in Snakemake, but I got the following error:\n\n${error}\n\nCan you fix the rules so that they run correctly?
Please output only the corrected rule. What you output goes entirely in the Snakefile, so DO NOT, EVER, OUTPUT ANYTHING OTHER THAN THE RULES. Example of good output: "<NEW_RULES>". Examples of bad output: "Here are the corrected rules <NEW_RULES>"`;
    }

    static rulesFromCommandsBasicPrompt(formattedRules: string[], ruleFormat: string, extraPrompt: string, rulesContext:string=""): string{
        return `I have the following set of bash commands. Can you convert them into ${ruleFormat} rules? Note that Estimated inputs and outputs are just guesses and could be wrong.
${formattedRules.join("\n")}${rulesContext}
Please do not remove the new-lines chosen by the user. You might add new-lines for readability but only if necessary. ${extraPrompt}
${ruleFormat==="Snakemake" ? "Please use named input and outputs, with meaningful names. For example input:\n\tbam_file='somefile.bam'\n" : ""}
If one of the rules contains some type of loop - like a for loop - acting on multiple files, generate one rule with wildcards to implement the loop body, and an additional rule that uses an 'expand' to generate all output files. The name of the second rule should should NOT be 'all', it should be a meaningful name connected to the original rule.
Please return the rules in JSON format. The JSON contains a single field 'rule' which is a string, that contains the entire snakefile. Es. {rule: string}";        
`
    }
//Please output only the ${ruleFormat} rules. What you output goes entirely in the ${ruleFormat} file, so DO NOT, EVER, OUTPUT ANYTHING OTHER THAN THE RULES. Example of good output: "<RULES>". Examples of bad output: "Here are the rules <RULES>" or "<Comment/Title of rule><RULE>";


    static snakemakeBestPracticesPrompt(): string{
        const useWildcards: boolean = ExtensionSettings.instance.getSnakemakeBestPracticesPreferGenericFilenames();
        const logDirective: boolean = ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules();
        const commentEveryLine: boolean = ExtensionSettings.instance.getCommentEveryRule();
        let extraPrompt = "";
        if (useWildcards || logDirective){
            extraPrompt += `Please write the Snakemake rules following these guidelines:\n`;
        }
        if (useWildcards){
            extraPrompt += `- Prefer the usage of generic names for input-outputs using wildcards, when possible. For example input: "data.csv", output: "transformed_data.csv" could be written as input: "{file}.csv", output: "transformed_{file}.csv".
- Multiple commands that execute the same operation on different files can be merged in a single rule using generic inputs/outputs and wildcards. Following the example above, another rule could be input: "GENES.csv", output: "transformed_GENES.csv" could be merged with the previous rule.
- If using generic filenames, add a "all" rule that generates the files generated by the user.Include in the input of the "all" rules only output files, if a rule does not have an output, do not put it in all. Do not put the outputs generated by the "log" directive in the "all" rule.\n`;
        }
        if (logDirective){
            extraPrompt += "- Add a log directive to each rule with the name of the log file. For example, log: 'logs/{rule}.log'. If the rule contains wildcards, they must be part of the log file name or Snakemake will throw an error. Log fields must be added before shell fields.\n";
        }
        if (commentEveryLine){
            extraPrompt += "- For each rule, add a short comment describing what the rule does. The comment must be short. Do not say 'this rule does...' or cite the name of the rule, it's a waste of characters, just say what it does. The comment must be just before the definition of the rule, es. #This rule does something\nrule something: ...\n"
        }
        return extraPrompt;
    }

    static rulesContextPrompt(currentRules: string){
        if (currentRules.length <= 20){return "";} //Skip prompt if file has a few characters inside
        return `\nFor context, these are the rules already present:\n${currentRules}\nPlease consider these rules as a context when writing the new rules. Follow their style and formalism. If a command results in a rule equal to one already present, do not output it. If you need to return no rule at all, return a newline instead. DO NOT write the already present rules them back in your response or the user will find them twice in his file.`;
    }

}

export class Queries{
    constructor(private modelComms: LLM){
        this.modelComms = modelComms;
    }

    private parseJsonFromResponse(response: string): any{
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        return JSON.parse(response)["rule"];
    }
    private parseJsonFromResponseGeneric(response: string): any{
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        return JSON.parse(response);
    }

    cleanModelResponseStupidHeaders(response: string): string{
        if (response.startsWith("Makefile") || response.startsWith("makefile")){
            return response.substring(8);
        } else if (response.startsWith("Make") || response.startsWith("make")){
            return response.substring(4);
        } else if (response.startsWith("Snakemake") || response.startsWith("snakemake")){
            return response.substring(9);
        } else if (response.startsWith("Snakefile") || response.startsWith("snakefile")){
            return response.substring(9);
        }
        return response;
    }

    async guessRuleDetails(command: string){
        const query = ModelPrompts.ruleDetailsPrompt(command);
        const response = await this.modelComms.runQuery(query);
        const split = response.split(";");
        const input = split[0]?.split("=")[1]?.replace("[", "")?.replace("]", "") ?? "Unknown";
        const output = split[1]?.split("=")[1]?.replace("[", "")?.replace("]", "")?? "Unknown";
        const name = split[2]?.split("=")[1]?.replace("[", "")?.replace("]", "")?? "Unknown";
        return [input, output, name];
    }

    async writeDocumentationFromContext(context: string){
        const query = `The user is building a data processing pipeline using bash command and snakemake:\n\n${context}.
Please write a short documentation explaining what the user is doing. Use every information available to be as specific as you can. The documentation should be professional and mimick the style of a methodology section of a paper. It is possible you don't have enough information for a full methodology section, in this case write what you can.
Please write the documentation as a string in a JSON in this format: {documentation: string}. The string should follow the markdown format.`;
        const response = await this.modelComms.runQuery(query);
        const parsed = this.parseJsonFromResponseGeneric(response);
        return parsed["documentation"];
    }

    async guessIfCommandImportant(command: string, positive_examples: string[], negative_examples: string[]){
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
        const query = ModelPrompts.commandImportancePrompt(command, examples_query);
        let response = await this.modelComms.runQuery(query);
        response = response.toLowerCase();
        return !response.includes("no");
    }

    async getRuleFromCommand(bashCommand: BashCommand){
        const ruleFormat = ExtensionSettings.instance.getRulesOutputFormat();
        var inputs = bashCommand.getInput();
        var output = bashCommand.getOutput();
        const command = bashCommand.getCommandForModel();
        if (inputs === "-"){ inputs = "No input";}
        if (output === "-"){ output = "No output";}
        let context = "";
        if (ExtensionSettings.instance.getIncludeCurrentFileIntoPrompt()){
            const currentSnakefileContext = await OpenedSnakefileContent.getCurrentEditorContent();
            context = ModelPrompts.rulesContextPrompt(currentSnakefileContext);
        }
        const prompt_original = ModelPrompts.ruleFromCommandPrompt(command, bashCommand.getRuleName(), ruleFormat, inputs, output, context);
        let prompt = prompt_original;
        for (let i = 0; i < 5; i++){
            const response = await this.modelComms.runQuery(prompt);
            try{
                return this.parseJsonFromResponse(response);
            } catch (e){
                prompt = "I asked you this:\n" + prompt_original + "\nBut you gave me this:\n" + response
                + "\nAnd this is not a valid JSON, when trying to parse it I get: " + e + "\nPlease try again.";
            }
        }
        return null;
    }

    async getAllRulesFromCommands(commands: BashCommand[]){
        const ruleFormat = ExtensionSettings.instance.getRulesOutputFormat();
        let extraPrompt = "";
        if (ruleFormat==="Snakemake"){
            extraPrompt = ModelPrompts.snakemakeBestPracticesPrompt();
        }
        const formatted = commands.map(command => 
            `\nEstimated inputs: (${command.getInput()}) Estimated outputs: (${command.getOutput()})\nShell command: ${command.getCommandForModel()}\nPossible rule name: ${command.getRuleName()}}\n\n`
        );
        let context = "";
        if (ExtensionSettings.instance.getIncludeCurrentFileIntoPrompt()){
            const currentSnakefileContext = await OpenedSnakefileContent.getCurrentEditorContent();
            context = ModelPrompts.rulesContextPrompt(currentSnakefileContext);
        }

        const prompt_original = ModelPrompts.rulesFromCommandsBasicPrompt(formatted, ruleFormat, extraPrompt, context);

        let prompt = prompt_original;
        for (let i = 0; i < 5; i++){
            const response = await this.modelComms.runQuery(prompt);
            try{
                return this.parseJsonFromResponse(response);
            } catch (e){
                prompt = "I asked you this:\n" + prompt_original + "\nBut you gave me this:\n" + response
                + "\nAnd this is not a valid JSON, when trying to parse it I get: " + e + "\nPlease try again.";
            }
        }
        return null;
    }

    async guessOnlyName(command: BashCommand){
        const prompt = ModelPrompts.guessNamePrompt(command.getCommandForModel());
        const response = await this.modelComms.runQuery(prompt);
        return response;
    }

    async autoCorrectRulesFromError(rules: string, error: string){
        const prompt = ModelPrompts.correctRulesFromErrorPrompt(rules, error);
        const response = await this.modelComms.runQuery(prompt);
        return response;
    }

}