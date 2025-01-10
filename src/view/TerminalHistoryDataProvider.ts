import * as vscode from 'vscode';
import * as path from 'path';
import { BashCommand, BashCommandContainer } from '../model/TerminalHistory';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';

export class TerminalHistoryDataProvider implements vscode.TreeDataProvider<DisplayCommand>, vscode.TreeDragAndDropController<DisplayCommand> {
	private tree: DisplayCommand[]=[];
	private _refreshCallback: vscode.EventEmitter<DisplayCommand | undefined | null | void> = new vscode.EventEmitter<DisplayCommand | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<DisplayCommand | undefined | null | void> = this._refreshCallback.event;
	
	//TODO what are those
	dropMimeTypes = ['application/vnd.code.tree.bash-commands'];
	dragMimeTypes = ['text/uri-list'];

	constructor(private viewModel: BashCommandViewModel, isArchive: boolean = false) {
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
			return Promise.resolve(element.getChildren());
		} else {
			return Promise.resolve(this.tree);
		}
	}

	buildTree(commands: BashCommandContainer[]) {
		return commands.map(command => new DisplayCommandRoot(command));
	}

	public async handleDrop(target: DisplayCommand | undefined, sources: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
		const transferItem = sources.get('application/vnd.code.tree.bash-commands'); //This is what you drop
		if (!transferItem) {return;}

		//Get target BashCommandContainer
		const targetBashCommandContainer = target?.getRoot()||null;
		//Get BashCommand from the dropped item
		const sourceBashCommands: BashCommand[] = transferItem.value.filter(
			(item:DisplayCommand) => item.getRoot()!==null
		).map((item: DisplayCommand) => [item.getRoot(), item.getChildIndex()]);
		this.viewModel.moveCommands(sourceBashCommands, targetBashCommandContainer);
	}

	public async handleDrag(source: DisplayCommand[], treeDataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
		treeDataTransfer.set('application/vnd.code.tree.bash-commands', new vscode.DataTransferItem(source));
	}
}

interface DisplayCommand extends vscode.TreeItem{
	getChildren(): DisplayCommand[];
	getRoot(): BashCommandContainer|null;
	getChildIndex(): number;
}
class DisplayCommandRoot extends vscode.TreeItem implements DisplayCommand{
	private bashCommand: BashCommandContainer;
	constructor(bashCommand: BashCommandContainer){
		const label = bashCommand.getCommand();
		if (bashCommand.getTemporary()===true){
			super(label, vscode.TreeItemCollapsibleState.None);
			this.tooltip = "(in process)" + bashCommand.getCommand();
			this.contextValue = 'ROOT_OBJ_TEMP';
		} else {
			super(label, vscode.TreeItemCollapsibleState.Collapsed);
			this.tooltip = bashCommand.getCommand();
			this.contextValue = bashCommand.getImportant() ? 'ROOT_OBJ_I' : 'ROOT_OBJ_NI';
		}
		this.bashCommand = bashCommand;
		this.iconPath = undefined;
		if (this.bashCommand.getImportant()===true && this.bashCommand.getTemporary()===false) {
			this.resourceUri = vscode.Uri.parse('bash_commands://'+this.bashCommand.getIndex());
		} else {
			this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://'+this.bashCommand.getIndex());
		}
	}

	getChildren(): DisplayCommand[] {
		//If command has children, return children commands.
		//if not, return stuff like inputs, outputs...
		const gray = this.bashCommand.getImportant()===true && this.bashCommand.getTemporary()===false;
		if (this.bashCommand.getNumChildren()>0){
			const r = Array.from(Array(this.bashCommand.getNumChildren()).keys()).map(
				(index:number) => new DisplayCommandChildCommand(
					this.bashCommand, index
				)
			);
			const r0 = new DisplayCommandAdditionalInfo(this.bashCommand, 'Rule name', this.bashCommand.getRuleName(), this.bashCommand.getIndex(), gray, "RuleName");
			return [r0, ...r];
		} else {
			return [
				new DisplayCommandAdditionalInfo(this.bashCommand, 'Rule name', this.bashCommand.getRuleName(), this.bashCommand.getIndex(), gray, "RuleName"),
				new DisplayCommandAdditionalInfo(this.bashCommand, 'Output', this.bashCommand.getOutput(), this.bashCommand.getIndex(), gray,"Output"),
				new DisplayCommandAdditionalInfo(this.bashCommand, 'Inputs', this.bashCommand.getInput(), this.bashCommand.getIndex(), gray,"Inputs"),
			];
		}
	}

	getRoot(): BashCommandContainer {
		return this.bashCommand;
	}
	getChildIndex(): number {
		return -1;
	}
}

class DisplayCommandChildCommand extends vscode.TreeItem implements DisplayCommand{
	childBashCommand: BashCommand | null;
	private parentBashCommand: BashCommandContainer;
	private command_index: number;
	constructor(parentBashCommand: BashCommandContainer, command_index: number){
		const child = parentBashCommand.getChildren(command_index);
		const label = child?.getCommand();
		if (child?.getTemporary()===true){
			super(label||"", vscode.TreeItemCollapsibleState.None);
			this.tooltip = "(in process)" + child?.getCommand();
			this.contextValue = 'ROOT_OBJ_TEMP';
		} else {
			super(label||"", vscode.TreeItemCollapsibleState.Collapsed);
			this.tooltip = child?.getCommand();
			this.contextValue = "SUB_C";
		}
		this.command_index = command_index;
		this.parentBashCommand = parentBashCommand;
		this.childBashCommand = child;
		this.iconPath = undefined;
		if (parentBashCommand.getImportant()===true && parentBashCommand?.getTemporary()===false) {
			this.resourceUri = vscode.Uri.parse('bash_commands://'+child?.getIndex());
		} else {
			this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://'+child?.getIndex());
		}
	}
	getChildren(): DisplayCommand[] {
		const gray = this.parentBashCommand.getImportant()===true && this.parentBashCommand.getTemporary()===false;
		return [
			new DisplayCommandAdditionalInfo(this.childBashCommand,'Output', this.childBashCommand?.getOutput() || '', this.childBashCommand?.getIndex()||0, gray, "Output"),
			new DisplayCommandAdditionalInfo(this.childBashCommand,'Inputs', this.childBashCommand?.getInput() || '', this.childBashCommand?.getIndex()||0, gray, "Inputs"),
			//new DisplayCommandAdditionalInfo(this.childBashCommand,'Important', this.childBashCommand?.get_important() ? 'Yes' : 'No', this.childBashCommand?.get_index()||0, gray, undefined)
		];
	}
	getRoot(): BashCommandContainer {
		return this.parentBashCommand;
	}
	getChildIndex(): number {
		return this.command_index;
	}
}
class DisplayCommandAdditionalInfo extends vscode.TreeItem implements DisplayCommand{
	modifier?: string;
	parent: BashCommand|null;
	constructor(parent:BashCommand|null, childTitle: string, childText: string, index: number, gray:boolean, modifiable?: string) {
		const label = childTitle + ": " + childText;
		super(label, vscode.TreeItemCollapsibleState.None);
		this.tooltip = childText;
		if (modifiable) {
			this.contextValue = 'CHILD_OBJ_MOD';
			this.modifier = modifiable;
		} else {
			this.contextValue = 'CHILD_OBJ';
		}
		this.parent = parent;
		this.resourceUri = !gray ? vscode.Uri.parse('bash_command_info_unimportant://'+childTitle+index) : vscode.Uri.parse('bash_commands_details://'+childTitle+index);
		this.iconPath = new vscode.ThemeIcon("find-collapseddebug-breakpoint-unverified");
	}
	getChildren(): DisplayCommand[] {
		return [];
	}
	getRoot(): null {
		return null;
	}
	getChildIndex(): number {
		return -1;
	}
	
}
