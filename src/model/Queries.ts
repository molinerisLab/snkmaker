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
        `Can you guess the filenames of input and outputs? Only the filenames of what is read and written are important`+ 
        `- not the things in between (es pipe operator), and stdin,stdout and stderr are not considered inputs or outputs.\n`+
        `Consider that when unknown programs are executed, they might write to files and you don't know what they are.\n`+
        `If you are sure there is no input or output, please write "-". If it cannot be determined, write "Unknown".\n`+
        `I would also like a short name of a theorical Snakemake rule for this command.\n`+
        `Please write: INPUT=[...]; OUTPUT=[...]; NAME=[...]. DO NOT, EVER output other things, only INPUT=[...]; OUTPUT=[...]; NAME=[...]. Do not forget the = symbol.`;
    }

    static inferCommandInfoPrompt(command: string, examplesPrompt: string): string{
        return `I have the following bash command: ${command}.\n`+
        `It might need to be translated into a snakemake or a Make rule, but it could be just a one-time command from the user.\n`+
        "For example the user might run commands as 'dir', 'cd ..' to navigate his environment. "+
        `Generally, commands that for sure do not write to files are not worth making into rules.\n${examplesPrompt}\n`+
        `Please try to infer if this command is worth making into a rule or not.\n\n`+
        "If the command becomes a rule, please also try to guess:\n"+
        "-A possible name for the rule. The name should be short and meaningful given what the command does.\n"+
        `-The name of the of input and output files used or written by the command. Only the names of read or written files are important`+ 
        `, the things in between (es pipe operator), stdin, stdout and stderr are NOT considered inputs or outputs.\n`+
        `It is possible that the command itself calls some executable and you are not able to find out the names `+
        "of the input or output files. In this case, write 'Unknown'. If you are sure there is no input or output, please write '-'\n"+
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
        `It is estimated that the input could be (${inputs}) and the output could be (${output}) `+
        `- but it could be wrong. A possible name for the rule could be ${ruleName}. ${rulesContext} `+
        `Please do not remove the new-lines chosen by the user. You might add new-lines for readability but only if necessary.\n`;
        if (ruleFormat==="Snakemake"){
            prompt += `Please use named input and outputs, with meaningful names. For example:rule example:\n\tinput:\n\t\tbam_file='somefile.bam'\n`;
            prompt += "If the rule contains some type of loop - like a for loop - acting on multiple files, "+
            "generate one rule with wildcards to implement the loop body, and an additional rule that uses an 'expand' "+
            "to generate all output files. The name of the second rule should NOT be 'all', should be a meaningful name connected "+
            "to the original rule."
            if (logField){
                prompt += "\nPlease add a log field to the rule with the name of the log file. For example, log: 'logs/{rule}.log'. "+
                "If the rule contains wildcards, they must be part of the log file name or Snakemake will throw an error. "+
                "Log field must be added before shell field.";
            }
            if (comment){
                prompt += "\nPlease add a short comment describing what the rule does. The comment must be short. "+
                "Do not say 'this rule does...' or cite the name of the rule, it's a waste of characters, just say what it does. "+
                "The comment must be just before the definition of the rule, es. #This rule does something\nrule something: ...";
            }
            prompt += "Please use named input and outputs, with meaningful names. For example input:\n\tbam_file='somefile.bam'\n" +
            `If one of the rules contains some type of loop - like a for loop - acting on multiple files, generate`+
            ` one rule with wildcards to implement the loop body, and an additional rule that uses an 'expand' to generate all output files. `+
            `The name of the second rule should should NOT be 'all', it should be a meaningful name connected to the original rule.`;
            if (ruleAll){
                prompt += "\nThe Snakefile already contains a rule all: " + ruleAll + ".\n" +
                "Please add the new rules to the rule all.\n" +
                "Please return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!). The JSON contains a field 'rule' which is a string, that contains the entire "+
                "rules except for rule all, and a field 'rule_all' that contains the rule all. Es. {rule: string, rule_all: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote: the rule all must be written entirely, so take the one existing and add inputs to it.\n"+
                    "The other rules on the other hand must not repeat the rules already existing in the file.";
                }
            } else {
                prompt += "Please also write a 'rule all' to produce all files.\n" +
                "Please return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!). The JSON contains a field 'rule' which is a string, that contains the entire "+
                "rules except for rule all, and a field 'rule_all' that contains the rule all. Es. {rule: string, rule_all: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote, the rules already existing in the file must not be repeated in 'rule', "+ 
                    "but their outputs must be included in the 'rule_all'.";
                }
            }
            if (env_directive && env_name){
                prompt += `\n-You also MUST set the 'conda' directive in the output rule to ${env_name}:\nconda:\n\t'${env_name}'\n. This is used by Snakemake to re-build the environment.`
            }
        } else {
            prompt += "\nPlease return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!). The JSON contains a single field 'rule' which is a string, that contains the entire rules. Es. {rule: string}. Please do not add explanations.";
        }

    return prompt;
    }

    static guessNamePrompt(command: string): string{
        return `I have the following bash command: ${command}.\n`+
        `I would like a short name of a theorical Snakemake rule for this command.\n`+
        `Please output only the name. DO NOT, EVER output other things.`;
    }

    static correctRulesFromErrorPrompt(rules: SnakefileContext, error: string): string{
        let prompt = `I have a Snakfile formed like that:\n`+
        `Snakefile:\n${rules.get_snakefile()}\n`;
        if (rules.snakefile_content){
            prompt += `Snakefile content, first part (fixed):\n${rules.snakefile_content.replaceAll(
                rules.rule_all || "", ""
            )})}\n` +
            `Rules, second part (can modify):\n${rules.rule_all}\n${rules.rule}\n`;
        } else {
            prompt += `Rules:\n${rules.rule}\n`;
        }
        if (rules.config_paths.length > 0){
            prompt += `Base config:\n${rules.config_content.join("\n")}\n`;
        }
        if (rules.include_paths.length > 0){
            prompt += `Includes:\n${rules.include_content.join("\n")}\n`;
        }
        if (rules.add_to_config){
            prompt += `Additional config part:\n${rules.add_to_config}\n`;
        }
        prompt += `\nI have the following error:\n\n${error}\n\n`+
        `I would like to correct the rules so that they run correctly.\n`;
        if (rules.snakefile_content && rules.snakefile_content.length > 0){
            prompt += `Note: you can not modify all snakefile; the first part is fixed. `+
            `You can modify the second part of it`;
            if (rules.rule_all){
                prompt += `, and you can also modify the rule 'all'\n`;
            }
            if (rules.add_to_config){
                prompt += `Regarding the config, you can only modify the 'Additional config part'\n`;
                prompt += `You can add or remove lines from it, but you can not remove from the rest of the config.\n`;
            } else {
                prompt += `Regarding the config, you can add lines to it, but you can not remove them\n`;
            }
        }
        prompt += `Please output the corrected rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!) following this schema:`+
        ` {can_correct: boolean, rules: string, rule_all: string, additional_config: string}\nPlease do not add explanations.`;
        prompt += `If you are not able to correct this snakefile just set can_correct to false.`;
        if (rules.rule_all){
            prompt += `Please write the updated rule all in the rule_all field.\n`;
        }
        if (rules.snakefile_content && rules.snakefile_content.length > 0){
            prompt += `Please write the updated rules corresponding to the second part of the snakefile in the rules field.\n`;
        } else {
            prompt += `Please write the updated rules in the rules field.\n`;
        }
        if (rules.add_to_config){
            prompt += `Please write the updated 'Additional config' in the additional_config field. You can add new lines, or remove existing ones by simply not outputting them.\n`;
        } else {
            prompt += "If you want to add new config lines, use the additional_config field.\n";
        }
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
        "Also, if the Snakefile has a config already, consider its values to see if they fit in the new rules.\n"+
        "Important: the 'conda' directive of rules, when existing, must never be modified or moved to the config. Do not put the conda .yaml file names into the config. Do not put things related to conda environments in the config.yaml.\n" +
        "Remember, the config is a simple yaml file. It does not contain logic, only values.\n"+
        "The config is meant for the user to make the pipeline more "+
        "maintainable, allowing to run it with different configurations. Not all values are worth putting in the config.\n"+
        "All the values put in the config MUST be accessed in the Snakefile. If a value is not readed in the Snakefile, "+
        "it must not go in the config.\n"+
        "Examples of good config fields:\nGENOME_PATH='/home/user/.../genome.fasta' #Very good, hardcoded paths are better in a config\n"+
        "NUMBER_RANDOMIZATION: 4 #Good, especially if this value is used in an expand to generate multiple files\n"+
        "STAR_OUT_SAM_TYPE: 'BAM' #Good, this is a value that might be changed by the user\n"+
        "Examples of bad config fields:\n"+
        "conda_env: 'your_conda_env_name' #No, conda env info doesn't go here!\n"+
        "conda create -n snaketest python=3.9 #NO! This is not even a yaml field, it's a command. Never do that!\n"+
        "Please output your response in JSON following this schema:\n"+
        "{rules: string, add_to_config: string}\n"+
        "Remember JSON does not support triple quotes for multi-line strings; they will break the JSON.\n";
        if (rules.snakefile_content){
            prompt += "Where 'rules' are the newly added rules with your changed applied, ";
        } else {
            prompt += "Where 'rules' are the rules you just received with your changes applied, ";
        }
        prompt += "and 'add_to_config' is a string that contains the new lines to be added to the config file.\n"+
        "You do not have to use a config if it's not needed, do it only if it's worth it.\n"+
        "If you don't want to add new configs, or you don't need to, just set add_to_config to an empty string and 'rules' to the same rules you received.\n";
        return prompt;
    }

    static rulesFromCommandsBasicPrompt(formattedRules: string[], ruleFormat: string, extraPrompt: string, 
        rulesContext:string="", ruleAll: string|null = null, set_env_directive: boolean): string{
        let prompt =  `I have the following set of bash commands. Can you convert them into ${ruleFormat} rules? `+
        `Note that Estimated inputs and outputs are just guesses and could be wrong.\n`+
        `${formattedRules.join("\n")}\n${rulesContext}\n`+
        `When producing the new rules, follow these instructions:\n`+
        `-Do not remove the new-lines chosen by the user. You might add new-lines for readability but only if necessary. \n`+
        extraPrompt;
        if (ruleFormat==="Snakemake"){
            prompt += "-Use named input and outputs, with meaningful names. For example input:\n\tbam_file='somefile.bam'\n" +
            `-If one of the rules contains some type of loop - like a for loop - acting on multiple files, generate`+
            ` one rule with wildcards to implement the loop body, and an additional rule that uses an 'expand' to generate all output files. `+
            `Note: The name of the second rule should should NOT be 'all', it should be a meaningful name connected to the original rule.`;
            if (ruleAll){
                prompt += "\n-The Snakefile already contains a rule all:\n " + ruleAll + "\n" +
                "Please add the new rules to the rule all.\n" +
                "Please return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!). The JSON contains a field 'rule' which is a string, that contains the entire "+
                "rules except for rule all, and a field 'rule_all' that contains the rule all. Es. {rule: string, rule_all: string, add_to_config: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote: the rule 'all' must be written entirely, so take the one existing and add inputs to it.\n"+
                    "The other rules on the other hand must not repeat the rules already existing in the file.";
                }
            } else {
                prompt += "Please also write a 'rule all' to produce all files.\n" +
                "Please return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!). The JSON contains a field 'rule' which is a string, that contains the entire "+
                "rules except for rule all, and a field 'rule_all' that contains the rule all. Es. {rule: string, rule_all: string, add_to_config: string}. Please do not add explanations.";
                if (rulesContext.length>0){
                    prompt += "\nNote, the rules already existing in the file must not be repeated in 'rule', "+ 
                    "but their outputs must be included in the 'rule_all'.";
                }
            }
            if (set_env_directive){
                prompt += "\n-If a rule contains a field 'conda_env_path', set the 'conda' directive in the output rule. " +
                "Keeping track of the environments used is important for reproducibility. Snakemake offers the conda directive"+
                " to attach a yaml file to the rules - es:\n"+
                "rule SOMETHING:\n\t#Input and outputs and whathever...\n\tconda:\n\t\t'env_file.yaml'\n\t#Shell directive...\n.";
            }
        } else {
            prompt += "\nPlease return the rules in JSON format (remember: JSON doesn't support the triple quote syntax for strings!). The JSON contains a single field 'rule' which is a string, that contains the entire rules. Es. {rule: string}. Please do not add explanations.";
        }
        return prompt;
    }

    static snakemakeBestPracticesPrompt(): string{
        const useWildcards: boolean = ExtensionSettings.instance.getSnakemakeBestPracticesPreferGenericFilenames();
        const logDirective: boolean = ExtensionSettings.instance.getSnakemakeBestPracticesSetLogFieldInSnakemakeRules();
        const commentEveryLine: boolean = ExtensionSettings.instance.getCommentEveryRule();
        let extraPrompt = "";
        if (useWildcards){
            extraPrompt += `- Prefer the usage of generic names for input-outputs using wildcards, when possible. `+
            `For example input: "data.csv", output: "transformed_data.csv" could be written as input: "{file}.csv", `+
            `output: "transformed_{file}.csv".\n`+
            `- Multiple commands that execute the same operation on different files can be merged in a single rule `+
            `using generic inputs/outputs and wildcards. Following the example above, another rule could be input: "GENES.csv", `+
            `output: "transformed_GENES.csv" could be merged with the previous rule.\n`;
        }
        if (logDirective){
            extraPrompt += "- Add a log directive to each rule with the name of the log file. "+
            "For example, log: 'logs/{rule}.log'. If the rule contains wildcards, they must be part of the log file "+
            "name or Snakemake will throw an error. Log fields must be added before shell fields.\n";
        }
        if (commentEveryLine){
            extraPrompt += "- For each rule, add a short comment describing what the rule does. The comment must be short. "+
            "Do not say 'this rule does...' or cite the name of the rule, it's a waste of characters, just say what it does. "+
            "The comment must be just before the definition of the rule, es. #This rule does something\nrule something: ...\n"
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

    private parseJsonFromResponse(response: string, context: SnakefileContext): SnakefileContext{
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        let result = {'rule': '', 'rule_all': null, 'remove': null, 'add_to_config': null};
        let json;
        try{
            json = JSON.parse(response);
        } catch (e){
            console.log("Trying json repair");
            try{
                response = jsonrepair(response);
                json = JSON.parse(response);
                console.log("Json repair succeeded");
            } catch (e){
                console.log("Json repair failed");
                console.log(response);
                throw e;
            }
        }
        if (json["rule"]){
            context["rule"] = json["rule"];
        } else {
            throw new Error("No field named rule in the JSON");
        }
        if (json["rule_all"]){
            context['rule_all'] = json["rule_all"];
        }
        return context;
    }
    private parseJsonFromResponseGeneric(response: string): any{
        let start = response.indexOf("{");
        let end = response.lastIndexOf("}");
        if (start !== -1 && end !== -1){
            response = response.substring(start, end + 1);
        }
        try{
            return JSON.parse(response);
        } catch (e){
            try{
                response = jsonrepair(response);
                return JSON.parse(response);
            } catch (e){
                throw e;
            }
        }
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
        const response = await this.modelComms.runQuery(query, PromptTemperature.CREATIVE);
        const parsed = this.parseJsonFromResponseGeneric(response);
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
        for(let i=0; i<5; i++){
            const response = await this.modelComms.runQuery(prompt, PromptTemperature.MEDIUM_DETERMINISTIC);
            try{
                let r = this.parseJsonFromResponseGeneric(response);
                if (r["is_rule"]){
                    assert (r["rule_name"] !== undefined, "Rule name is undefined");
                    assert (r["input"] !== undefined, "Input is undefined");
                    assert (r["output"] !== undefined, "Output is undefined");
                    return r;
                } else {
                    return {'is_rule': false, 'rule_name': '', 'input': '', 'output': ''};
                }
            } catch (e){
                prompt = "I asked you this:\n" + prompt + "\nBut you gave me this:\n" + response
                + "\nAnd this is not a valid JSON, when trying to parse it I get: " + e + "\nPlease try again.";
            }
        }
        return {'is_rule': false, 'rule_name': '', 'input': '', 'output': ''};
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
        const prompt_original = ModelPrompts.ruleFromCommandPrompt(
            command, bashCommand.getRuleName(), ruleFormat, inputs, output, context, ruleAll, env_name, ExtensionSettings.instance.getAddCondaDirective()
        );
        let prompt = prompt_original;
        for (let i = 0; i < 5; i++){
            const response = await this.modelComms.runQuery(prompt, PromptTemperature.RULE_OUTPUT);
            try{
                let r = this.parseJsonFromResponse(response, currentSnakefileContext);
                r['remove'] = ruleAll;
                if (ExtensionSettings.instance.getGenerateConfig()){
                    const prompt = ModelPrompts.rulesMakeConfig(r);
                    const response = await this.modelComms.runQuery(prompt, PromptTemperature.RULE_OUTPUT);
                    const parsed = this.parseJsonFromResponseGeneric(response);
                    if (parsed["rules"]){
                        r["rule"] = parsed["rules"];
                    }
                    if (parsed["add_to_config"]){
                        r["add_to_config"] = parsed["add_to_config"];
                    }
                }
                return r;
            } catch (e){
                prompt = "I asked you this:\n" + prompt_original + "\nBut you gave me this:\n" + response
                + "\nAnd this is not a valid JSON, when trying to parse it I get: " + e + "\nPlease try again.";
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

        const prompt_original = ModelPrompts.rulesFromCommandsBasicPrompt(formatted, ruleFormat, extraPrompt, context, ruleAll, ExtensionSettings.instance.getAddCondaDirective());

        let prompt = prompt_original;
        for (let i = 0; i < 5; i++){
            const response = await this.modelComms.runQuery(prompt, PromptTemperature.RULE_OUTPUT);
            try{
                let r = this.parseJsonFromResponse(response, currentSnakefileContext);
                r['remove'] = ruleAll;
                if (ExtensionSettings.instance.getGenerateConfig()){
                    const prompt = ModelPrompts.rulesMakeConfig(r);
                    const response = await this.modelComms.runQuery(prompt, PromptTemperature.RULE_OUTPUT);
                    const parsed = this.parseJsonFromResponseGeneric(response);
                    if (parsed["rules"]){
                        r["rule"] = parsed["rules"];
                    }
                    if (parsed["add_to_config"]){
                        r["add_to_config"] = parsed["add_to_config"];
                    }
                }
                return r;
            } catch (e){
                console.log(e);
                prompt = "I asked you this:\n" + prompt_original + "\nBut you gave me this:\n" + response
                + "\nAnd this is not a valid JSON, when trying to parse it I get: " + e + "\nPlease try again.";
            }
        }
        console.log("Error: unable to parse the response from the model.");
        return currentSnakefileContext;
    }

    async guessOnlyName(command: BashCommand){
        const prompt = ModelPrompts.guessNamePrompt(command.getCommandForModel());
        const response = await this.modelComms.runQuery(prompt, PromptTemperature.MEDIUM_DETERMINISTIC);
        return response;
    }

    async autoCorrectRulesFromError(rules: SnakefileContext, error: string){
        const original_prompt = ModelPrompts.correctRulesFromErrorPrompt(rules, error);
        let prompt = original_prompt;
        for (let i = 0; i < 5; i++){
            const response = await this.modelComms.runQuery(prompt, PromptTemperature.RULE_OUTPUT);
            try{
                let r = this.parseJsonFromResponseGeneric(response);
                if (r["can_correct"] === false){
                    return rules;
                }
                if (r["rules"]){
                    rules["rule"] = r["rules"];
                }
                if (r["rule_all"]){
                    rules["rule_all"] = r["rule_all"];
                }
                if (r["additional_config"]){
                    rules["add_to_config"] = r["additional_config"];
                }
                return rules;
            } catch (e){
                prompt = "I asked you this:\n" + original_prompt + "\nBut you gave me this:\n" + response
                + "\nAnd this is not a valid JSON, when trying to parse it I get: " + e + "\nPlease try again.";
            }
        }
        return rules;
    }

}