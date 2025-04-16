import { LLM, PromptTemperature } from "./ModelComms";
import { BashCommand, ExecutionEnvironment } from "./TerminalHistory";
import { ExtensionSettings } from '../utils/ExtensionSettings';
import * as vscode from 'vscode';
import { OpenedSnakefileContent, SnakefileContext } from "../utils/OpenendSnakefileContent";
import { assert } from "console";
const { jsonrepair } = require('jsonrepair')

class ModelPrompts{
    static ruleDetailsPrompt(command: string): string{
        return `I have the following bash command: ${command}.\n`+
        `Please guess the filenames of input and outputs. Only the filenames of what is read and written by the commands are important,`+ 
        ` not the things in between (es pipe operator), and stdin,stdout and stderr are not considered input or output files.\n`+
        `When unknown programs are executed, they might write to files and you don't have the information of what they are.\n`+
        `If you are sure that there is no input or output, write "-" to signal their absence."+
        " If instead you don't have the information to safely assume their names, write "Unknown".\n`+
        `I would also like a short name of a theorical Snakemake rule for this command.\n`+
        `Please write: INPUT=[...]; OUTPUT=[...]; NAME=[...]. DO NOT, EVER output other things, only INPUT=[...]; OUTPUT=[...]; NAME=[...]. Do not forget the = symbol.`;
    }

    static inferCommandInfoPrompt(command: string, examplesPrompt: string): string{
        return `I have the following bash command: ${command}.\n`+
        `It might be part of some data analysis or processing work and need to be translated into `+
        `a Snakemake or Make rule, but it could also be just a one-time command from the user.\n`+
        "For example the user might run commands as 'dir', 'cd ..' to navigate his environment, "+
        "and these commands don't make into the pipeline he's building.\n"+
        `Generally, commands that for sure do not write to files are not worth making into rules.\n${examplesPrompt}\n`+
        `Please try to infer if this command is worth making into a rule or not.\n\n`+
        "If the command becomes a rule, please also try to guess:\n"+
        "-A possible name for the rule. The name should be short and meaningful given what the command does.\n"+
        `-The filenames of the input and output files. Only the filenames of what is read and written by the commands in their entirety are important,`+ 
        ` not the things in between (es pipe operator), and stdin,stdout and stderr are not considered input or output files.\n`+
        `When unknown programs are executed, they might write to files and you don't have the information of what they are.\n`+
        `If you are sure that there is no input or output, write "-" to signal their absence."+
        " If instead you don't have the information to safely assume their names, write "Unknown".\n`+
        "Please output your response following this JSON schema:\n"+
        "{is_rule: boolean, rule_name: string, input: string, output: string}\n"+
        "If there are multiple input or output names, write them in a single string separated by comma, es input: 'a.txt, b.txt'.\n"+
        "If the command is not a rule, set is_rule to false and leave the other fields empty.\n";
    }

    static ruleFromCommandPrompt(command: string, ruleName: string, ruleFormat: string, inputs: string, 
        output: string, rulesContext:string="", ruleAll: string | null = null,
        env_name: string|null, env_directive: boolean): string{
        const logField: boolean = 
            ruleFormat==="Snakemake" && ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules();
        const comment: boolean = 
            ruleFormat==="Snakemake" && ExtensionSettings.instance.getCommentEveryRule();
        let prompt = `Convert this bash command into a ${ruleFormat} rule:\n${command}\n`+
        `The estimated inputs filenames are (${inputs}) and the estimated output filenames (${output}) `+
        `- but it is only an estimate and could be wrong. A possible name for the rule could be '${ruleName}', but you can modify it if needed.`+
        ` ${rulesContext} `+
        `When converting respect the new-lines chosen by the user, don't remove them. You might add new-lines for readability, but only if necessary.\n`;
        if (ruleFormat==="Snakemake"){
            prompt += `Use named input and outputs, with meaningful names. For example:rule example:\n\tinput:\n\t\tbam_file='somefile.bam'\n`;
            prompt += "If the rule contains some type of loop, acting on multiple files, "+
            "generate one rule with wildcards to implement the loop body, and an additional rule that uses an 'expand' "+
            "to generate all output files. The name of the second rule should be a meaningful name connected to the name of "+
            "the original one. The name of the second rule cannot be simply 'all' because this name is reserved.\n";
            if (logField){
                prompt += "\nAdd a log field to the rule with the name of the log file. For example, log: 'logs/{rule}.log'. "+
                "If the rule contains wildcards, they must be part of the log file name or Snakemake will throw an error. "+
                "Log field must be added before the shell field.";
            }
            if (comment){
                prompt += "\nAdd a short comment describing what the rule does. The comment must be short and concise. "+
                "Simply say what the rule does. "+
                "The comment must be just before the definition of the rule. "+
                "For example:\n#Trim fasta files using tool X\nrule trim_with_X: ...";
            }
            if (env_directive && env_name){
                prompt += `\n-You also must set the 'conda' directive in the output rule to ${env_name}:\nconda:\n\t'${env_name}'\n. This is used by Snakemake to re-build the environment.`
            }
            if (ruleAll && ruleAll.length>0){
                prompt += "\nThe Snakefile already contains a rule all: " + ruleAll + ".\n" +
                "Please add the new rules to the rule all.\n" +
                "Please return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for multi-line strings-you need to use single quote and escape characters for multi-line content). The JSON contains a field 'rule' which is a string, that contains the entire "+
                "rules except for rule all, and a field 'rule_all' that contains the rule all. Es. {rule: string, rule_all: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote: the rule all must be written entirely, so take the one existing, add inputs to it and return it in its entirety.\n"+
                    "Ther other rules already existing in the Snakefile must not be repeated, only write the new ones.";
                }
            } else {
                prompt += "Please also write a 'rule all' to produce all files.\n" +
                "The rule all is characterized by only the input directive, where outputs of other rules are requested.\n" +
                "Please return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for multi-line strings-you need to use single quote and escape characters for multi-line content). The JSON contains a field 'rule' which is a string, that contains all "+
                "the rules. Es. {rule: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote, the rules already existing in the file must not be repeated in 'rule', "+ 
                    "but their outputs must be included in the 'rule_all'.";
                }
            }
        } else {
            prompt += "\nPlease return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for multi-line strings-you need to use single quote and escape characters for multi-line content). The JSON contains a single field 'rule' which is a string, that contains the entire rules. Es. {rule: string}. Please do not add explanations.";
        }

    return prompt;
    }

    static guessNamePrompt(command: string): string{
        return `I have the following bash command: ${command}.\n`+
        `I would like a short name of a theorical Snakemake rule for this command.\n`+
        `Please output only the name. DO NOT, EVER output other things.`;
    }

    static correctRuleFromErrorBasicPrompt(rules: SnakefileContext, error: string): string{
        let prompt = "";
        if (rules.snakefile_content && rules.snakefile_content.length>0){
            prompt = `I have a Snakefile which can be divided in two sections. `+
            `The first section is fixed and cannot be modified, while the second can still be changed.\n`+
            `Snakefile first section (fixed):\n\`\`\`snakefile\n${rules.snakefile_content}\n\`\`\`\n`+
            `Snakefile second section (can be modified):\n\`\`\`snakefile\n${rules.rule + "\n" + (rules.rule_all || "")}\n\`\`\`\n`;
        } else {
            prompt = `I have this Snakefile:\`\`\`snakefile\n${rules.get_snakefile()}\n\`\`\`\n`
        }
        if (rules.config_paths.length > 0){
            prompt += `Base config (fixed, can't be modified):\`\`\`config.yaml\n${rules.config_content.join("\n")}\n\`\`\`\n`;
        }
        if (rules.include_paths.length > 0){
            prompt += `Includes:\`\`\`rules (fixed, can't be modified)\n${rules.include_content.join("\n")}\n\`\`\`\n`;
        }
        if (rules.add_to_config){
            prompt += `Additional config part (can be modified):\`\`\`extra config\n${rules.add_to_config}\n\`\`\`\n`;
        }
        prompt += `This snakefile has problems, and when parsing it I get the following error:\`\`\`error\n${error}\n\`\`\`\n`;
        return prompt; 
    }

    static correctRulesFromErrorStepbackPrompt(rules: SnakefileContext, error: string): string{
        let prompt = ModelPrompts.correctRuleFromErrorBasicPrompt(rules, error);
        prompt += "Analyze the error, the current state of the Snakefile, and give me a review "+
        "of what is the problem in it, and some suggestions on how to fix it. The review and suggestions must be concise."+
        "\nThe suggestions provide high level suggestions on how to fix the error.\n"+
        "The end goal is to fix the error, not to perform generic improvements in the snakefile or its readability. Focus on actual errors."+
        "\nDo not write the solution, just the review and suggestions.\n";
        return prompt; 
    }

    static correctRulesFromErrorPrompt(rules: SnakefileContext, error: string, suggestion:string|undefined): string{
        let prompt = ModelPrompts.correctRuleFromErrorBasicPrompt(rules, error);
        if (suggestion){
            prompt += "This is a review of the problem and some suggestions on how to fix it:\`\`\`review\n" +
            suggestion + "\n\`\`\`\n";
        }
        prompt += `Fix the rules to correct the problem.\n`;
        if ((rules.snakefile_content && rules.snakefile_content.length > 0)||rules.config_paths.length > 0||rules.include_paths.length > 0){
            prompt += `Remember, you can't modify the entire snakefile because some parts are fixed. `+
            "If the error originates from a fixed part, then it simply cannot be resolved by you."+
            " If you can not fix the error, you can set the field 'can_correct' to false.\n";
            if (rules.add_to_config){
                prompt += `Regarding the config, you can modify the 'Additional config part'\n`;
                prompt += `You can add or remove lines from it, but you can not remove lines from the rest of the config.\n`;
            } else {
                prompt += `Regarding the config, it is fixed so you can't remove lines from it, but you can add new ones.\n`;
            }
        }
        prompt += `Please output the corrected rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema:`+
        ` {can_correct: boolean, rules: string, rule_all: string, additional_config: string}\n`+
        "-can_correct: boolean, true if you can correct the error, false if you can't.\n";
        if (rules.snakefile_content && rules.snakefile_content.length>0){
            prompt += "-rules: string, the corrected rules. It is an updated version of the second section of the rules.\n";
        } else {
            prompt += "-rules: string, the corrected rules. It is an updated version of the rules.\n";
        }
        if (rules.add_to_config){
            prompt += `-additional_config: string, the updated version of the Additional Config Part. It will replace this part of the config.\n`;
        } else {
            prompt += "-additional_config: string, new lines to append to the config. Can be an empty string.\n";
        }
        prompt += "-rule_all: string, the updated version of the rule all.\n"+
        "Please write the rule all separately from the other rules, in the appropriate field."
        return prompt; 
    }

    static rulesMakeConfig(rules: SnakefileContext){
        let prompt = ``;
        if (rules.snakefile_content){
            let preSnakefilePrompt = "";
            rules.config_content.forEach((config) => {
                preSnakefilePrompt += `\nConfig:\n${config}\n`;
            });
            rules.include_content.forEach((include) => {
                preSnakefilePrompt += `\nInclude:\n${include}\n`;
            });
            prompt += `I have a Snakefile formed like that:\n${preSnakefilePrompt}\n${rules.snakefile_content}\n`+
            `To which these new rules have just been added:\n${rules.rule}\n`+
            "Considering ONLY the new rules, ";
        } else {
            prompt += `I have the following Snakemake rules:\n${rules.rule}\n`+
            "Considering the rules, "
        }
        prompt += "please check if some values inside these rules can be moved to a configuration field.\n" +
        "Generally, the config must contains stuff like hardcoded absolute paths, hardcoded values that the user might want to change "+
        "on different runs of the Snakemake pipeline. Output files generally should not be in the config.\n"+
        "Also, if the Snakefile already has a config, you can use its values in the new rules, if they fit.\n"+
        "Important: the 'conda' directive of rules, when existing, must never be modified or moved to the config. Do not put the conda .yaml file names into the config. Do not put things related to conda environments in the config.yaml.\n" +
        "The config is a simple yaml file, it contains only values, never logic.\n"+
        "The config is meant for the user to make the pipeline more "+
        "maintainable, allowing to run it with different configurations. Not all values are worth putting in the config.\n"+
        "Examples of good config fields:\nGENOME_PATH='/home/user/.../genome.fasta' #Very good, hardcoded paths are better in a config\n"+
        "NUMBER_RANDOMIZATION: 4 #Good, especially if this value is used in an expand to generate multiple files\n"+
        "STAR_OUT_SAM_TYPE: 'BAM' #Good, this is a value that might be changed by the user\n"+
        "Examples of bad config fields:\n"+
        "conda_env: 'your_conda_env_name' #No, conda env info doesn't go here!\n"+
        "conda create -n snaketest python=3.9 #NO! This is not even a yaml field, it's a command. Never do that!\n"+
        "Please output your response in JSON following this schema:\n"+
        "{rules: string, add_to_config: string}\n";
        if (rules.snakefile_content){
            prompt += "Where 'rules' are the newly added rules with your changed applied, ";
        } else {
            prompt += "Where 'rules' are the rules you just received with your changes applied, ";
        }
        prompt += "and 'add_to_config' is a string that contains the new lines to be added to the config file.\n"+
        "You do not have to use a config if it's not needed, do it only if it's worth it.\n"+
        "If you don't want to add new configs, or you don't need to, just set add_to_config to an empty string and 'rules' to the same rules you received.\n"+
        "Remember JSON does not support triple quotes for multi-line strings; you must use escape characters to manage multi-line.\n";
        return prompt;
    }

    static rulesFromCommandsBasicPrompt(formattedRules: string[], ruleFormat: string, extraPrompt: string, 
        rulesContext:string="", ruleAll: string|null = null, set_env_directive: boolean): string{
        let prompt =  `I have the following set of bash commands:\n\n`+
        `${formattedRules.join("\n")}\n${rulesContext}\n`+
        ` Please convert them into ${ruleFormat} rules.\n`+
        `Note that Estimated inputs and outputs are just guesses and could be wrong. `+
        "The rule names are suggestions, you can modify them if needed.\n"+
        `When producing the new rules, follow these instructions:\n`+
        `-Respect the new-lines chosen by the user, don't remove them. You can add new-lines for readability if necessary.\n`+
        extraPrompt;
        if (ruleFormat==="Snakemake"){
            prompt += "-Use named input and outputs, with meaningful names. For example input:\n\tbam_file='somefile.bam'\n";
            prompt += "If some of the rules contain some type of loops, acting on multiple files, "+
            "generate one rule with wildcards to implement the loop body, and an additional rule that uses an 'expand' "+
            "to generate all output files. The name of the second rule should be a meaningful name connected to the name of "+
            "the original one. The name of the second rule cannot be simply 'all' because this name is reserved.\n";
            if (set_env_directive){
                prompt += "\n-If a rule contains a field 'conda_env_path', set the 'conda' directive in the output rule. " +
                "Keeping track of the environments used is important for reproducibility. Snakemake offers the conda directive"+
                " to attach a yaml file to the rules - es:\n"+
                "rule SOMETHING:\n\t#Input and outputs etc...\n\tconda:\n\t\t'env_file.yaml'\n\t#Shell directive...\n.";
            }
            if (ruleAll && ruleAll.length>0){
                prompt += "\n-The Snakefile already contains a rule all:\n " + ruleAll + "\n" +
                "Add the new rules to the rule all.\n" +
                "Return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for multi-line strings-you need to use single quote and escape characters for multi-line content). The JSON contains a field 'rule' which is a string, that contains the entire "+
                "rules except for the rule all, and a field 'rule_all' that contains the rule all. Es. {rule: string, rule_all: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote: the rule 'all' must be re-written entirely, so take the one existing and add inputs to it.\n"+
                    "The other rules on the other hand must not repeat the rules already existing in the file.";
                }
            } else {
                prompt += "Also write a 'rule all' to produce all files. The rule all is characterized by only the input directive, where " +
                "the outputs of the other rules are requested.\n" +
                "Please return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for multi-line strings-you need to use single quote and escape characters for multi-line content). "+
                "The JSON contains a field 'rule' which is a string, that contains the all the rules "+
                ", ex. {rule: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote, the rules already existing in the file must not be repeated in 'rule', "+ 
                    "but their outputs must be included in the 'rule_all'.";
                }
            }
        } else {
            prompt += "\nPlease return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for multi-line strings-you need to use single quote and escape characters for multi-line content). The JSON contains a single field 'rule' which is a string, that contains the entire rules. Es. {rule: string}. Please do not add explanations.";
        }
        return prompt;
    }

    static processRulesFromChatBasicPrompt(rules: string, snakefile_content: string, ruleAll: string): string{
        let prompt =  `I have a Snakefile with some rules, and new Snakemake rules that the user is adding.\n`+
        "This is the content of the existing Snakefile: " + snakefile_content + "\n\n"+
        "These are the new rules: " + rules + "\n\n";
        "Please do the following tasks:\n"+
        "1-Filter out the new rules that are already present in the Snakefile. A new rule should be added only if not existing.\n";
        if(ruleAll.length>0){
            "2-Consider the current rule all of the Snakefile:\n"+ruleAll+
            "\n Update the rule all with the outputs of the newly added rules.";
        } else {
            "2- Generate a rule all that includes all the outputs of the new rules.\n";
        }
        prompt += "Output the results in JSON format. Remember JSON does not support triple quotes for multi-line strings. Follow this schema:\n"+
        "{'rules': string, 'rule_all': string}\n"+
        "'rules' is the new rules to add to the Snakefile. Can be an empty string if no rule needs to be added. rule_all is the rule all for the Snakefile."
        return prompt;
    }

    static snakemakeBestPracticesPrompt(): string{
        const useWildcards: boolean = ExtensionSettings.instance.getSnakemakeBestPracticesPreferGenericFilenames();
        const logDirective: boolean = ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules();
        const commentEveryLine: boolean = ExtensionSettings.instance.getCommentEveryRule();
        let extraPrompt = "";
        if (useWildcards){
            extraPrompt += `-Prefer the usage of generic names for input-outputs using wildcards, when possible. `+
            `For example input: "data.csv", output: "transformed_data.csv" could be written as input: "{file}.csv", `+
            `output: "transformed_{file}.csv".\n`+
            `-Multiple commands that execute the same operation on different files can be merged in a single rule `+
            `using generic inputs/outputs and wildcards. Following the example above, another command could be input: "GENES.csv", `+
            `output: "transformed_GENES.csv"; this case is already covered by the rule with generic input and output names.\n`;
        }
        if (logDirective){
            extraPrompt += "-Add a log directive to each rule with the name of the log file. "+
            "For example, log: 'logs/{rule}.log'. If the rule contains wildcards, they must be part of the log file "+
            "name or Snakemake will throw an error. Log fields must be added before shell fields.\n";
        }
        if (commentEveryLine){
            extraPrompt += "-For each rule, add a short, concise comment describing what the rule does. "+
            "The comment must be just before the definition of the rule, es. #Trim fasta files using tool X\nrule run_X: ...\n"
        }
        return extraPrompt;
    }

    static rulesContextPrompt(currentRules: string){
        if (currentRules.length <= 20){return "";} //Skip prompt if file has a few characters inside
        return `\nFor context, these are the rules already present:\n${currentRules}\n`+
        "Please use the existing rules and config to:\n" +
        "1- Avoid repeating existing rules. If a rule is already present, do not write it again." +
        "If you need to return no rule at all, because they are all already present, return a newline instead.\n"+
        "2- Follow the style, formalisms and naming conventions of the rules already present.\n"+
        "3- If a command results in a rule equal to one already present, do not output it.\n"+
        "4- Consider the existing config, if available, for the new rules. If rules similar to the one you are generating use some configuration, use it in the new ones too.\n";
    }

}

export class Queries{
    constructor(private modelComms: LLM){
        this.modelComms = modelComms;
    }

    private async updateSnakefileContextFromPrompt(prompt: string, context: SnakefileContext, temperature: PromptTemperature){
        const validate = ((response:any) => {
            if (!response.rule){
                return "Error: no field named rule in the JSON";
            }
            return null;
        });
        const formatted = await this.modelComms.runQueryAndParse(prompt, temperature, validate);
        if (formatted["rule"]){
            context["rule"] = formatted["rule"];
        }
        if (formatted["rule_all"]){
            context['rule_all'] = formatted["rule_all"];
        }
        return context;
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

    async writeDocumentationFromContext(context: string){
        const query = `The user is building a data processing pipeline using bash command and snakemake:\n\n${context}.
Please write a short documentation explaining what the user is doing. Use every information available to be as specific as you can. The documentation should be professional and mimick the style of a methodology section of a paper. It is possible you don't have enough information for a full methodology section, in this case write what you can.
Please write the documentation as a string in a JSON in this format: {documentation: string}. The string should follow the markdown format.`;
        const parsed = await this.modelComms.runQueryAndParse(query, PromptTemperature.CREATIVE, (response:any) => {
            if (!response.documentation){
                return "Error: no field named documentation in the JSON";
            }
            return null;
        });
        return parsed["documentation"];
    }

    private parseExamples(positive_examples: string[], negative_examples: string[]){
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
        return examples_query;
    }

    async inferCommandInfo(command: string, positive_examples: string[], negative_examples: string[]){
        const examples = this.parseExamples(positive_examples, negative_examples);
        let prompt = ModelPrompts.inferCommandInfoPrompt(command, examples);
        const validate = ((response:any) => {
            if (response.is_rule){
                let e = "";
                if (response.rule_name === undefined){
                    e += "Error: no field named rule_name in the JSON\n";
                }
                if (response.input === undefined){
                    e += "Error: no field named input in the JSON\n";
                }
                if (response.output === undefined){
                    e += "Error: no field named output in the JSON\n";
                }
                if (e.length>0){
                    return e;
                }
            }
            return null;
        });
        try{
            const formatted = await this.modelComms.runQueryAndParse(prompt, PromptTemperature.MEDIUM_DETERMINISTIC, validate);
            if (formatted["is_rule"]){
                return formatted;
            } else {
                return {'is_rule': false, 'rule_name': '', 'input': '', 'output': ''};
            }
        } catch (e){
            return {'is_rule': false, 'rule_name': '', 'input': '', 'output': ''};
        }
    }   

    extractAllRule(snakefileContent: string): string | null {
        const lines = snakefileContent.split('\n');
        const result: string[] = [];
        let firstline = -1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const ruleAllMatch = line.match(/^\s*rule\s+all\s*:/m);
            if (ruleAllMatch) {
                firstline = i;
                break;
            }
        }
        if (firstline === -1) {
            return null;
        }
        const m = lines[firstline].match(/^\s*/) || [""];
        const indent = m[0];
        result.push(lines[firstline]);
        for (let i = firstline+1; i < lines.length; i++) {
            if ((lines[i].match(/^\s*/) || [""])[0].length <= indent.length) {
                break;
            }
            result.push(lines[i]);
        }
        return result.join("\n");
    }

    async getRuleFromCommand(bashCommand: BashCommand, env_name: string|null){
        const ruleFormat = ExtensionSettings.instance.getRulesOutputFormat();
        var inputs = bashCommand.getInput();
        var output = bashCommand.getOutput();
        const command = bashCommand.getCommandForModel();
        if (inputs === "-"){ inputs = "No input";}
        if (output === "-"){ output = "No output";}
        let context = "";
        let ruleAll = null;
        let currentSnakefileContext: SnakefileContext = new SnakefileContext(
            null,
            null,
            null,
            [],
            [],
            [],
            [],
            null,
            null,
            null,
            null,
            []
        );
        if (ExtensionSettings.instance.getIncludeCurrentFileIntoPrompt()){
            const c = await OpenedSnakefileContent.getCurrentEditorContent();
            if (c){
                currentSnakefileContext = c;
                context = ModelPrompts.rulesContextPrompt(currentSnakefileContext["content"]||"");
                ruleAll = this.extractAllRule(currentSnakefileContext["content"]||"");
            }
        }
        const prompt = ModelPrompts.ruleFromCommandPrompt(
            command, bashCommand.getRuleName(), ruleFormat, inputs, output, context, ruleAll, env_name, ExtensionSettings.instance.getAddCondaDirective()
        );
        const r = await this.updateSnakefileContextFromPrompt(prompt, currentSnakefileContext, PromptTemperature.RULE_OUTPUT);
        r['remove'] = ruleAll;
        if (!ruleAll || ruleAll.length === 0){
            ruleAll = this.extractAllRule(r["rule"]||"");
            if (ruleAll){
                r['rule_all'] = ruleAll;
                r['rule'] = r['rule']?.replace(ruleAll, "")??null;
            }
        }
        if (ExtensionSettings.instance.getGenerateConfig()){
            const config_prompt = ModelPrompts.rulesMakeConfig(r);
            const config_parsed = await this.modelComms.runQueryAndParse(config_prompt, PromptTemperature.RULE_OUTPUT);
            if (config_parsed["rules"]){
                r["rule"] = config_parsed["rules"];
            }
            if (config_parsed["add_to_config"]){
                r["add_to_config"] = config_parsed["add_to_config"];
            }
        }
        r["rule"] = this.fixShellDirective(r["rule"]||"");
        return r;
    }

    async processRulesFromChat(rules: string){
        const ruleFormat = ExtensionSettings.instance.getRulesOutputFormat();
        let extraPrompt = "";
        if (ruleFormat!=="Snakemake" || !ExtensionSettings.instance.getIncludeCurrentFileIntoPrompt()){
            return new SnakefileContext(
                null, rules,
                null, [], [], [], [], "", "", "", "",[]
              );
        }
        let context = "";
        let ruleAll = null;
        let currentSnakefileContext: SnakefileContext = new SnakefileContext(
            null, rules,
            null, [], [], [], [], "", "", "", "",[]
          );

        const c = await OpenedSnakefileContent.getCurrentEditorContent();
        if (!c || !c["content"] || c["content"].length === 0){
            return currentSnakefileContext
        }
        currentSnakefileContext = c;
        ruleAll = this.extractAllRule(currentSnakefileContext["content"]||"");
        
        const prompt = ModelPrompts.processRulesFromChatBasicPrompt(
            rules, currentSnakefileContext["content"]||"", ruleAll||""
        );
        const r = await this.modelComms.runQueryAndParse(prompt, PromptTemperature.RULE_OUTPUT);
        currentSnakefileContext['remove'] = ruleAll;
        currentSnakefileContext['rule_all'] = r['rule_all'];
        currentSnakefileContext['rule'] = r['rules'];
        if (ExtensionSettings.instance.getGenerateConfig()){
            const config_prompt = ModelPrompts.rulesMakeConfig(currentSnakefileContext);
            const config_parsed = await this.modelComms.runQueryAndParse(config_prompt, PromptTemperature.RULE_OUTPUT);
            if (config_parsed["rules"]){
                currentSnakefileContext["rule"] = config_parsed["rules"];
            }
            if (config_parsed["add_to_config"]){
                currentSnakefileContext["add_to_config"] = config_parsed["add_to_config"];
            }
        }
        return currentSnakefileContext;
    }

    async getAllRulesFromCommands(commands: BashCommand[], envs: (ExecutionEnvironment | null)[]): Promise<SnakefileContext>{
        const ruleFormat = ExtensionSettings.instance.getRulesOutputFormat();
        let extraPrompt = "";
        if (ruleFormat==="Snakemake"){
            extraPrompt = ModelPrompts.snakemakeBestPracticesPrompt();
        }
        const formatted = commands.map((command, index) => 
            {
                let env = "";
                if (envs[index]){
                    env = `\nconda_env_path: ${envs[index].filename}`
                }
                return `\nEstimated inputs: (${command.getInput()}) Estimated outputs: (${command.getOutput()})\nShell command:` + 
                `${command.getCommandForModel()}\nPossible rule name: ${command.getRuleName()}${env}\n\n`
            }
        );
        let context = "";
        let ruleAll = null;
        let currentSnakefileContext: SnakefileContext = new SnakefileContext(
            null,
            null,
            null,
            [],
            [],
            [],
            [],
            null,
            null,
            null,
            null,
            []
        );
        if (ExtensionSettings.instance.getIncludeCurrentFileIntoPrompt()){
            const c = await OpenedSnakefileContent.getCurrentEditorContent();
            if (c){
                currentSnakefileContext = c;
                context = ModelPrompts.rulesContextPrompt(currentSnakefileContext["content"]||"");
                ruleAll = this.extractAllRule(currentSnakefileContext["content"]||"");
            }
        }

        const prompt = ModelPrompts.rulesFromCommandsBasicPrompt(formatted, ruleFormat, extraPrompt, context, ruleAll, ExtensionSettings.instance.getAddCondaDirective());
        const r = await this.updateSnakefileContextFromPrompt(prompt, currentSnakefileContext, PromptTemperature.RULE_OUTPUT);
        r['remove'] = ruleAll;
        if (!ruleAll || ruleAll.length === 0){
            ruleAll = this.extractAllRule(r["rule"]||"");
            if (ruleAll){
                r['rule_all'] = ruleAll;
                r['rule'] = r['rule']?.replace(ruleAll, "")??null;
            }
        }
        if (ExtensionSettings.instance.getGenerateConfig()){
            const config_prompt = ModelPrompts.rulesMakeConfig(r);
            const config_parsed = await this.modelComms.runQueryAndParse(config_prompt, PromptTemperature.RULE_OUTPUT);
            if (config_parsed["rules"]){
                r["rule"] = config_parsed["rules"];
            }
            if (config_parsed["add_to_config"]){
                r["add_to_config"] = config_parsed["add_to_config"];
            }
        }
        r["rule"] = this.fixShellDirective(r["rule"]||"");
        return r;
    }

    private fixShellDirective(rules: string){
        const lines = rules.split('\n');
        const result: string[] = [];
        let insideShellDirective = false;
        let opening_i = -1; let opening_j = -1;
        let ending_i = -1; let ending_j = -1;
        let closing_symbol:string|null = null;
        const shells:any = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.length===0){
                continue;
            }
            if (!insideShellDirective){
                if (trimmed.match(/^shell\s*:/)) {
                    insideShellDirective = true;
                    const first_a = line.indexOf("'");
                    const first_b = line.indexOf('"');
                    if (first_a !== -1){
                        if (first_b === -1){
                            opening_i = i;
                            opening_j = first_a;
                            closing_symbol = "'";
                        } else if (first_b < first_a){
                            opening_i = i;
                            opening_j = first_b;
                            closing_symbol = '"';
                        } else {
                            opening_i = i;
                            opening_j = first_a;
                            closing_symbol = "'";
                        }
                    } else if (first_b !== -1){
                        opening_i = i;
                        opening_j = first_b;
                        closing_symbol = '"';
                    }
                    if (closing_symbol){
                        const index = line.lastIndexOf(closing_symbol);
                        if (index!==undefined && index !== -1 && index !== opening_j){
                            ending_i = i;
                            ending_j = index;
                        }
                    }
                }
            } else {
                if (trimmed.startsWith("#")||trimmed.startsWith("rule")){
                    insideShellDirective = false;
                    shells.push({'begin_i': opening_i, 'begin_j': opening_j, 'end_i': ending_i, 'end_j': ending_j, 'symbol': closing_symbol});
                    opening_i = -1; opening_j = -1;
                    ending_i = -1; ending_j = -1;
                    closing_symbol = null;
                    continue;
                }
                let index;
                if (!closing_symbol){
                    const first_a = line.indexOf("'");
                    const first_b = line.indexOf('"');
                    if (first_a !== -1){
                        if (first_b === -1){
                            opening_i = i;
                            opening_j = first_a;
                            closing_symbol = "'";
                        } else if (first_b < first_a){
                            opening_i = i;
                            opening_j = first_b;
                            closing_symbol = '"';
                        } else {
                            opening_i = i;
                            opening_j = first_a;
                            closing_symbol = "'";
                        }
                    } else if (first_b !== -1){
                        opening_i = i;
                        opening_j = first_b;
                        closing_symbol = '"';
                    }
                }
                if (closing_symbol){
                    index = line.lastIndexOf(closing_symbol);
                }
                if (index!==undefined && index !== -1 && (index !== opening_j || i !== opening_i)){
                    ending_i = i;
                    ending_j = index;
                }
            }
        }
        if (insideShellDirective){
            shells.push({'begin_i': opening_i, 'begin_j': opening_j, 'end_i': ending_i, 'end_j': ending_j, 'symbol': closing_symbol});
        }
        for (let i = shells.length-1; i>=0; i--){
            const shell = shells[i];
            const begin_i = shell['begin_i'];
            const begin_j = shell['begin_j'];
            const end_i = shell['end_i'];
            const end_j = shell['end_j'];
            const symbol = shell['symbol'];
            if (begin_i === -1 || end_i === -1 || symbol === null){
                continue;
            }
            lines[end_i] = lines[end_i].substring(0, end_j) + '\"\"\"';
            lines[begin_i] = lines[begin_i].substring(0, begin_j) + '\"\"\"' + lines[begin_i].substring(begin_j+1);
        }
        return lines.join("\n");
    }

    async guessOnlyName(command: BashCommand){
        const prompt = ModelPrompts.guessNamePrompt(command.getCommandForModel());
        const response = await this.modelComms.runQuery(prompt, PromptTemperature.MEDIUM_DETERMINISTIC);
        return response;
    }

    async autoCorrectRulesFromError(rules: SnakefileContext, error: string, step_back:boolean):
     Promise<{ rules: SnakefileContext; can_correct: boolean; }>{
        let suggestion: string|undefined = undefined;
        if (step_back){
            const stepBackPrompt = ModelPrompts.correctRulesFromErrorStepbackPrompt(rules, error);
            suggestion = await this.modelComms.runQuery(stepBackPrompt, PromptTemperature.MEDIUM_DETERMINISTIC);
        }
        const prompt = ModelPrompts.correctRulesFromErrorPrompt(rules, error, suggestion);
        let r = await this.modelComms.runQueryAndParse(prompt, PromptTemperature.RULE_OUTPUT);
        if (r["can_correct"] === false){
            return {rules: rules, can_correct: false};
        }
        if (r["rules"]){
            const fakeRuleAll = this.extractAllRule(r["rules"]||"");
            if (fakeRuleAll){
                r["rules"] = r["rules"].replace(fakeRuleAll, "");
            }
            rules["rule"] = this.fixShellDirective(r["rules"]||"");
        }
        if (r["rule_all"]){
            rules["rule_all"] = r["rule_all"];
        }
        if (r["additional_config"]){
            rules["add_to_config"] = r["additional_config"];
        }
        return {rules: rules, can_correct: true};
    }

}