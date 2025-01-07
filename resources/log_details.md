# Remote logging details
This document provides details about the remote logging feature of the Snakemaker extension.

## Overview and Purpose
The Snakemaker VSCode extension includes an optional remote logging feature designed to enhance the extension's performance and user experience. This feature records the key activities:
* Bash commands registered by the extension.
* Primary user actions within the extension.
* Prompts sent to the integrated language model (LLM) and its responses.

These logs are used to track usage patterns, troubleshoot issues, and improve the quality of the extension

## Enable or Disable Logging
Remote logging is optional and can be enabled or disabled in the settings of VSCode
* Open File -> Preferences -> Settings
* Search for *Snakemaker: allow logging*

# Privacy overview
## When is Logging Active?
Logging is active only if the user opts-in and **only when the Snakemaker extension is actively recording bash commands**. 
* Logging is never active unless you explicitly **opt in**.
* Even after opting in, logging of commands is **disabled by default when VSCode starts**.
* Logging of commands becomes active only when you start the extension's listening mode using `Snakemaker: Start Listening` or the corresponding button the the Snakemaker view.
* Logging of commands stops automatically when you stop the extension's listening mode using `Snakemaker: Stop Listening` or the corresponding button the the Snakemaker view.

## Confidentiality and Anonymity
* Anonymous Sessions:
    * A unique, randomly generated session token is created each time VSCode starts.
    * No personally identifiable information is associated with the logs.
* Internal Use Only:
    * Logs are exclusively used to improve the extension's performance and usability.
    * Data is never shared with external parties or used for purposes beyond improving Snakemaker.

## What is Logged?
This section provides an exhaustive list of the data that is logged.
* Bash commands registered: the bash command itself, the exit code, the names of the input, output and rule_name as extimated by the Language Model or provided manually by the user.
* User actions: changing commands details, setting commands importance, re-arranging the commands in history, importing command history from a JSON file.
* Prompts sent to the Language Model and its response. The prompts themselves do not contain additional user information compared to what is described above.
* Actions performed by the Language Model on the history itself: adding, removing or modifying the recorded commands.

## What is never logged
Snakemaker **DOES NOT** log private or sensitive information such as
* Details about your machine or your file-system (e.g. working directories).
* Contents of your files or input/output data from bash commands (e.g., `stdin`, `stdout`, and `stderr`).

## Recommendations to Protect Sensitive Information
If you enable logging, here are some tips to safeguard your privacy:
1. Keep Snakemaker actively listening to commands only when necessary.
    * Logging is active only when the extension is in listening mode.
    * Keep listening mode off when not actively using Snakemaker.
2. Understand what is logged.
    * Commands you type into the terminal are logged, but what the terminal outputs is not.
    * **Safe Actions**: Running commands like `cat MY_SECRET_FILE` won’t log the file’s contents.
    * **Risky Actions**: Avoid commands that include sensitive data directly, like `export MY_SECRET_KEY=<secret>`.

If you mistakenly logged some sensitive information, the following section provides details on how to delete it.

## Request Deletion of Your Logs
If you mistakenly logged some sensitive information, or you want your logged data removed from our server for any reason, there are two possible ways:
### Automatically delete your current session's logs
Automatic logs deletion is available for the current session:
* Open the VSCode command palette and search for the command `Snakemaker: disable current session logs`.
    * Alternatively, ask the Copilot Chat while tagging @Snakemaker.
* This command sends to our server a request to delete the log data of the currently active session.
* Logs remain disabled for the rest of the session (until VSCode restart).

### Request deletion
If you want your previous sessions' logged data removed from our servers:
* Contact us at marco.masera@unito.it.
* Please provide an estimate of the session’s date and time: since logs are anonymous it is the only way to identify your session.

## Retention Policy
Logged information is never stored for more than 3 months.