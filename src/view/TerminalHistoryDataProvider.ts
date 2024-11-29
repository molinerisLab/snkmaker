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
		return commands.map(command => new DisplayCommand(command));
	}
}

class DisplayCommand extends vscode.TreeItem {
	isChild: boolean;
	bashCommand?: BashCommand;
	index: number;

	constructor(bashCommand: BashCommand);
	constructor(bashCommand: undefined, childTitle: string, childText: string, index?: number);
	constructor(bashCommand?: BashCommand, childTitle?: string, childText?: string, index?: number) {
		if (!bashCommand) {
			const label = (childTitle || '') + ": " + childText;
			super(label, vscode.TreeItemCollapsibleState.None);
			this.tooltip = childText || '';
			this.isChild = true;
			this.contextValue = 'CHILD_OBJ';
			this.index = index || 0;
			this.setResourceUri();
			this.iconPath = new vscode.ThemeIcon("find-collapseddebug-breakpoint-unverified");
			return;
		}
		const label = bashCommand.command;
		super(label, vscode.TreeItemCollapsibleState.Collapsed);
		this.tooltip = bashCommand.command;
		this.isChild = false;
		this.bashCommand = bashCommand;
		this.contextValue = this.bashCommand.important ? 'ROOT_OBJ_I' : 'ROOT_OBJ_NI';
		this.index = bashCommand.index;
		this.iconPath = undefined;
		this.setResourceUri();
	}

	setResourceUri() {
		if (!this.bashCommand) {
			this.resourceUri = vscode.Uri.parse('bash_commands_details://'+this.index);
		} else if (this.bashCommand.important) {
			this.resourceUri = vscode.Uri.parse('bash_commands://'+this.index);
		} else {
			this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://'+this.index);
		}
	}

	getChildren(): DisplayCommand[] {
		return [
			new DisplayCommand(undefined, 'Full command', this.bashCommand?.command || '', this.index),
			new DisplayCommand(undefined, 'Output', this.bashCommand?.output || '', this.index),
			new DisplayCommand(undefined, 'Inputs', this.bashCommand?.inputs.join(', ') || '', this.index),
			new DisplayCommand(undefined, 'Important', this.bashCommand?.important ? 'Yes' : 'No', this.index)
		];
	}
	
	
}

