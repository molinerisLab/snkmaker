import { HiddenTerminal } from "./HiddenTerminal";

export interface Inference{
    output: string; //Outputs - determined by running ls before and after execution
    executables: string; //List of executable files used in the command
    executable_notes: string; // -h | head -n 5 for each executable
}

export class CommandInference{
    constructor(private terminal: HiddenTerminal){}

    async infer(command: string){

        //Check if command executable: [[ -x src ]], read return code,  - if 1, executable
    }
}