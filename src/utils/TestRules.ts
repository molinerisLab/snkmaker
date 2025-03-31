const fs = require("fs");
const tmp = require("tmp");
import * as vscode from "vscode";
import { SnkmakerLogger } from "./SnkmakerLogger";
import { ExtensionSettings } from "./ExtensionSettings";
import { SnakefileContext } from "./OpenendSnakefileContent";

export class TestRules {
  constructor() {
    tmp.setGracefulCleanup();
  }

  showMessageForSnakemakePath() {
    //Show message with a button
    vscode.window
      .showInformationMessage(
        "Snakemake path is not set or is incorrect. Please set a correct, absolute path to Snakemake bin to allow for automatic validation of rules, or disable rule validation",
        "Set path",
        "Disable validation"
      )
      .then((value) => {
        if (value === "Set path") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "snakemaker.snakemakeAbsolutePath"
          );
        } else if (value === "Disable validation") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "snakemaker.validateSnakemakeRules"
          );
        }
      });
  }

  async validateRules(rules: SnakefileContext): Promise<{ success: boolean; message?: string }> {
    let snakemakePath = ExtensionSettings.instance.getSnakemakeAbsolutePath();
    if (snakemakePath === "") {
      snakemakePath = "snakemake";
    }

    const cp = require("child_process");

    //Build rules file
    let snakefile = rules.get_snakefile();
    rules.config_paths.forEach((path: string, index: number) => {
      const filename = path.split("/").pop();
      const tmpobj = tmp.fileSync();
      fs.writeFileSync(
        tmpobj.name, 
        rules.config_content[index]
      );
      snakefile = snakefile.replaceAll(filename || "", tmpobj.name);
    });
    rules.include_paths.forEach((path: string, index: number) => {
      const filename = path.split("/").pop();
      const tmpobj = tmp.fileSync();
      fs.writeFileSync(
        tmpobj.name, 
        rules.include_content[index]
      );
      snakefile = snakefile.replaceAll(filename || "", tmpobj.name);
    });
    //Write the snakefile to a temporary file
    const tmpobj = tmp.fileSync();
    fs.writeFileSync(
      tmpobj.name, 
      snakefile
    );
    
    const child = cp.spawn(snakemakePath, ["--list", "-s", tmpobj.name]);
    var stdout = "";
    var stderr = "";
    child.stdout.on("data", (data: any) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: any) => {
      stderr += data.toString();
    });
    return new Promise((resolve, reject) => {
      child.on("error", (err: any) => {
        SnkmakerLogger.instance()?.log(
          "User is trying to validate rules but snakemake is not specified and not in PATH"
        );
        this.showMessageForSnakemakePath();
        resolve({ success: true }); //If can't run snakemake, assume it's correct
      });
      child.on("close", (code: any) => {
        resolve({ success: code === 0, message: stdout + stderr });
      });
    });
  }
}
