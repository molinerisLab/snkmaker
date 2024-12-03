import * as vscode from 'vscode';
import * as path from 'path';
import { BashCommand } from '../model/TerminalHistory';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';

export class TerminalHistoryDataProvider implements vscode.TreeDataProvider<DisplayCommand> {
	private tree: DisplayCommand[];
	private _refreshCallback: vscode.EventEmitter<DisplayCommand | undefined | null | void> = new vscode.EventEmitter<DisplayCommand | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<DisplayCommand | undefined | null | void> = this._refreshCallback.event;

	constructor(viewModel: BashCommandViewModel, isArchive: boolean = false) {
		this.tree = [];
		if (isArchive) {
			viewModel.bashCommandsArchiveSubscribe(commands => {
				this.tree = this.buildTree(commands);
				this._refreshCallback.fire();
			});
		} else {
			viewModel.bashCommandsSubscribe(commands => {
				this.tree = this.buildTree(commands);
				this._refreshCallback.fire();
			});
		}
	}

	getTreeItem(element: DisplayCommand): vscode.TreeItem {
		return element;
	}

	getChildren(element?: DisplayCommand): Thenable<DisplayCommand[]> {
		if (element) {
			if (element.isChild) {
				return Promise.resolve([]);
			}
			return Promise.resolve(element.getChildren());
		} else {
			return Promise.resolve(this.tree);
		}
	}

	buildTree(commands: BashCommand[]) {
		return commands.map(command => new DisplayCommand(command, false));
	}
}

class DisplayCommand extends vscode.TreeItem {
	isChild: boolean;
	bashCommand: BashCommand;
	index: number;
	modifier?: string;

	constructor(bashCommand: BashCommand, isChild: boolean);
	constructor(bashCommand: BashCommand, isChild: boolean, childTitle: string, childText: string, index?: number, modifiable?: string);
	constructor(bashCommand: BashCommand, isChild: boolean=false, childTitle?: string, childText?: string, index?: number, modifiable?: string) {
		if (isChild===true) {
			const label = (childTitle || '') + ": " + childText;
			super(label, vscode.TreeItemCollapsibleState.None);
			this.tooltip = childText || '';
			this.isChild = true;
			if (modifiable) {
				this.contextValue = 'CHILD_OBJ_MOD';
				this.modifier = modifiable;
			} else {
				this.contextValue = 'CHILD_OBJ';
			}
			this.index = index || 0;
			this.setResourceUri();
			this.iconPath = new vscode.ThemeIcon("find-collapseddebug-breakpoint-unverified");
			this.bashCommand = bashCommand;
			return;
		}
		const label = bashCommand.command;
		if (bashCommand.temporary===true){
			super(label, vscode.TreeItemCollapsibleState.None);
			this.tooltip = "(in process)" + bashCommand.command;
			this.contextValue = 'ROOT_OBJ_TEMP';
		} else {
			super(label, vscode.TreeItemCollapsibleState.Collapsed);
			this.tooltip = bashCommand.command;
			this.contextValue = bashCommand.important ? 'ROOT_OBJ_I' : 'ROOT_OBJ_NI';
		}
		this.iconPath = undefined;
		this.isChild = false;
		this.bashCommand = bashCommand;
		this.index = bashCommand.index;
		this.setResourceUri();
	}

	setResourceUri() {
		if (!this.bashCommand) {
			this.resourceUri = vscode.Uri.parse('bash_commands_details://'+this.index);
		} else if (this.bashCommand.important && this.bashCommand.temporary===false) {
			this.resourceUri = vscode.Uri.parse('bash_commands://'+this.index);
		} else {
			this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://'+this.index);
		}
	}

	getChildren(): DisplayCommand[] {
		return [
			//new DisplayCommand(undefined, 'Full command', this.bashCommand?.command || '', this.index, false),
			new DisplayCommand(this.bashCommand,true, 'Output', this.bashCommand?.output || '', this.index, "Output"),
			new DisplayCommand(this.bashCommand,true, 'Inputs', this.bashCommand?.inputs || '', this.index, "Inputs"),
			new DisplayCommand(this.bashCommand,true, 'Important', this.bashCommand?.important ? 'Yes' : 'No', this.index, undefined)
		];
	}
	
	
}

