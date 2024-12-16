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
        const files_in_dir = await this.terminal.run_command(`cd ${path} && ls -lt --time-style=+%s`);
        const files_sorted = files_in_dir?.split("\n").map((x) => x.split("\t"))
        .filter(
            (x) => parseInt(x[5]) > (Date.now()/1000 - 10)
        )
        .sort((a, b) => parseInt(b[5]) - parseInt(a[5]));
        var recently_created: string;
        if (files_sorted && files_sorted?.length>0){
            recently_created = files_sorted[0][6];
        } else {
            recently_created = "";
        }

        const files = command.split(" ").filter((x) => !x.startsWith("-") && x.length>2);
        const executables = files.filter(async (x) => {
            return await this.terminal.run_command(`test -x ${x} && echo "Y" || echo "N"`) === "Y";
        });
        const help = executables.map(async (x) => {
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