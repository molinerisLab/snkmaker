import * as vscode from 'vscode';
import * as path from 'path';
import { BashCommand } from '../model/TerminalHistory';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';

export class TerminalHistoryDataProvider implements vscode.TreeDataProvider<DisplayCommand> {
	private tree: DisplayCommand[];
	private _refreshCallback: vscode.EventEmitter<DisplayCommand | undefined | null | void> = new vscode.EventEmitter<DisplayCommand | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<DisplayCommand | undefined | null | void> = this._refreshCallback.event;

	constructor(viewModel: BashCommandViewModel) {
		this.tree = [];
		viewModel.bashCommandsSubscribe(commands => {
			this.tree = this.buildTree(commands);
			this._refreshCallback.fire();
		});
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
	important: boolean = true;

	constructor(bashCommand: BashCommand);
	constructor(bashCommand: undefined, childTitle: string, childText: string);
	constructor(bashCommand?: BashCommand, childTitle?: string, childText?: string) {
		if (!bashCommand) {
			const label = (childTitle || '') + ": " + childText;
			super(label, vscode.TreeItemCollapsibleState.None);
			this.tooltip = childText || '';
			this.isChild = true;
			return;
		}
		const label = bashCommand.command;
		super(label, vscode.TreeItemCollapsibleState.Collapsed);
		this.tooltip = bashCommand.command;
		this.isChild = false;
		this.bashCommand = bashCommand;
		this.important = bashCommand.important;
	}

	getChildren(): DisplayCommand[] {
		return [
			new DisplayCommand(undefined, 'Full command', this.bashCommand?.command || ''),
			new DisplayCommand(undefined, 'Output', this.bashCommand?.output || ''),
			new DisplayCommand(undefined, 'Inputs', this.bashCommand?.inputs.join(', ') || ''),
			new DisplayCommand(undefined, 'Important', this.important ? 'Yes' : 'No')
		];
	}
	
	iconPath = {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'DisplayCommand.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'DisplayCommand.svg')
	  };
}

