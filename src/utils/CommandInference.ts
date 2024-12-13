import { HiddenTerminal } from "./HiddenTerminal";

export interface Inference{
    output: string; //Outputs - determined by running ls before and after execution
    executables: string; //List of executable files used in the command
    executable_notes: string; // -h | head -n 5 for each executable
}

export class CommandInference{
    constructor(private terminal: HiddenTerminal){}

    async infer(command: string, path: string): Promise<Inference>{
        //Check if command executable: [[ -x src ]], read return code,  - if 1, executable
        const recently_created = await this.terminal.run_command(`cd ${path} && find . -type f -cmin -0.1667 -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-`);
        const files = command.split(" ").filter((x) => !x.startsWith("-") && x.length>2);
        const executables = await files.filter(async (x) => {
            return await this.terminal.run_command(`test -x ${x} && echo "Y" || echo "N"`) === "Y";
        });
        console.log(executables);
        const help = await executables.map(async (x) => {
            const r = await this.terminal.run_command(`${x} -h | head -n 3`);
            return x + ":: " + r?.split("\n").filter(
                (y:string) => y.length>0 && !y.startsWith("Usage") && !y.startsWith("Options")
            ).join("\n");
        });
        return {
            output: recently_created,
            executables: executables.join("\n"),
            executable_notes: (await Promise.all(help)).join("\n")
        } as Inference;
    }
}