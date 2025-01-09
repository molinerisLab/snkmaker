# SnakeMaker
Record bash history and convert it into Snakemake or Make rules.

# General Usage

## Snakemaker panel overview 
<img src=".img/Snakemaker_Overview.png"/>

## Record bash commands history
The extension's listening and recording of bash commands can be turned on and off manually.

<img src=".img/start_stop_listening.png"/>

## Commands importance
When recording bash commands, Snakemaker tries to distinguish between important commands, which can contribute to the Snakefile, and unimportant, one-timer commands, which are not.

Non-important commands will be shown in the Snakemaker panel in a dark-gray color, and by default they are not exported as rules. Importance of a command can be changed manually

<img src=".img/Importance.png"/>



## Command details
When recording a bash command, Snakemaker tries to extract some details:
* Input files required by the command
* Output files produced by the command
* Possible name for a corresponding rules

<img src=".img/RuleDetails.png"/>

These details can be edited manually for better rules production. 

## Composite rules

By default, Snakemaker proposes one candidate rule for each important bash command recorded. If the user whishes for multiple commands to be considered for a single snakemake rule, he can use drag-and-drop to merge commands into composite commands.

<img src=".img/Composite.png"/>

## GNU Make support

Snakemaker can also generate Make rules. The user can switch between Snakemake and Make rules generation by searching for "Rules output format" in the VSCode settings. Alternatively, ask [@snakemaker in the chat](#chat-directly-with-snakemaker) to open the setting for you.


## Rule generation

## Chat directly with Snakemaker
Snakemaker integrates with the Github Copilot chat, allowing the user to chat directly with the extension.

In order to chat with Snakemaker:
* Open the Copilot chat
* Tag Snakemaker: "@snakemaker"

The direct chat can be used for a variety of purposes:

* Retrieve information about the usage of Snakemaker, troubleshooting, understand the principles of the extension.
  * *What can Snakemaker do for me?*
  * *Why aren't my commands being recorded?*
  * *How do I export my workspace?*
* Flexible rule generation.
  * *Can you generate the rule for my last command using wildcards instead of fixed filenames?*
  * *Set a ruleorder between my two commands that write to "output.txt".*
* Queries related to your own history:
  * *When did I create the file named "columns.csv"?*
  * *Do I have multiple commands generating the same file?*
* Automatically re-organize your history:
  * *Can you set all the commands writing to "output" as important?*
  * *Can you turn all the commands writing to "output" into a single composite command?*



<div style="display: flex;">
  <img src=".img/chat_1.png" style="max-width:40%; margin-right: 10px;"/>
  <img src=".img/chat_2.png"  style="max-width:40%;"/>
</div>

## Import-export workspace

The workspace contains all the recorded commands and their details. By default, the workspace is preserved between VSCode sessions, an option that can be disabled in the settings ("Keep history between sessions").


Explicit import and export of the workspace to a JSON file can be done:

* Open the VSCode command palette with Ctrl + Shift + P 
* Search for "Snakemaker: Load Workspace" or "Snakemaker: Save Workspace"

## Change language model

A model selection panel is provided at the bottom of the Snakemaker panel.

<img src=".img/Models.png"/>

Double-click on a model to activate it.



# Build and install extension for local usage
* Clone the repository: "git clone https://github.com/molinerisLab/snkmaker.git"
* Set version: open "package.json", modify field "version"
* Build: "npx @vscode/vsce -- package". Produces a *.vsix file.
* Install: from VSCode, open the "Extension" sidebar, click on the three dots on the top-right corner of the sidebar, click Install from VSIX.
