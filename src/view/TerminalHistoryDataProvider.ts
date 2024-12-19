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
			return Promise.resolve(element.get_children());
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
		const targetBashCommandContainer = target?.get_root()||null;
		//Get BashCommand from the dropped item
		const sourceBashCommands: BashCommand[] = transferItem.value.filter(
			(item:DisplayCommand) => item.get_root()!==null
		).map((item: DisplayCommand) => [item.get_root(), item.get_child_index()]);
		this.viewModel.moveCommands(sourceBashCommands, targetBashCommandContainer);
	}

	public async handleDrag(source: DisplayCommand[], treeDataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
		treeDataTransfer.set('application/vnd.code.tree.bash-commands', new vscode.DataTransferItem(source));
	}
}

interface DisplayCommand extends vscode.TreeItem{
	get_children(): DisplayCommand[];
	get_root(): BashCommandContainer|null;
	get_child_index(): number;
}
class DisplayCommandRoot extends vscode.TreeItem implements DisplayCommand{
	private bashCommand: BashCommandContainer;
	constructor(bashCommand: BashCommandContainer){
		const label = bashCommand.get_command();
		if (bashCommand.get_temporary()===true){
			super(label, vscode.TreeItemCollapsibleState.None);
			this.tooltip = "(in process)" + bashCommand.get_command();
			this.contextValue = 'ROOT_OBJ_TEMP';
		} else {
			super(label, vscode.TreeItemCollapsibleState.Collapsed);
			this.tooltip = bashCommand.get_command();
			this.contextValue = bashCommand.get_important() ? 'ROOT_OBJ_I' : 'ROOT_OBJ_NI';
		}
		this.bashCommand = bashCommand;
		this.iconPath = undefined;
		if (this.bashCommand.get_important()===true && this.bashCommand.get_temporary()===false) {
			this.resourceUri = vscode.Uri.parse('bash_commands://'+this.bashCommand.get_index());
		} else {
			this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://'+this.bashCommand.get_index());
		}
	}

	get_children(): DisplayCommand[] {
		//If command has children, return children commands.
		//if not, return stuff like inputs, outputs...
		const gray = this.bashCommand.get_important()===true && this.bashCommand.get_temporary()===false;
		if (this.bashCommand.get_num_children()>0){
			const r = Array.from(Array(this.bashCommand.get_num_children()).keys()).map(
				(index:number) => new DisplayCommandChildCommand(
					this.bashCommand, index
				)
			);
			const r0 = new DisplayCommandAdditionalInfo(this.bashCommand, 'Rule name', this.bashCommand.get_rule_name(), this.bashCommand.get_index(), gray, "RuleName");
			return [r0, ...r];
		} else {
			return [
				new DisplayCommandAdditionalInfo(this.bashCommand, 'Rule name', this.bashCommand.get_rule_name(), this.bashCommand.get_index(), gray, "RuleName"),
				new DisplayCommandAdditionalInfo(this.bashCommand, 'Output', this.bashCommand.get_output(), this.bashCommand.get_index(), gray,"Output"),
				new DisplayCommandAdditionalInfo(this.bashCommand, 'Inputs', this.bashCommand.get_input(), this.bashCommand.get_index(), gray,"Inputs"),
				//new DisplayCommandAdditionalInfo(this.bashCommand, 'Important', this.bashCommand.get_important() ? 'Yes' : 'No', this.bashCommand.get_index(), gray,undefined)
			];
		}
	}

	get_root(): BashCommandContainer {
		return this.bashCommand;
	}
	get_child_index(): number {
		return -1;
	}
}

class DisplayCommandChildCommand extends vscode.TreeItem implements DisplayCommand{
	childBashCommand: BashCommand | null;
	private parentBashCommand: BashCommandContainer;
	private command_index: number;
	constructor(parentBashCommand: BashCommandContainer, command_index: number){
		const child = parentBashCommand.get_children(command_index);
		const label = child?.get_command();
		if (child?.get_temporary()===true){
			super(label||"", vscode.TreeItemCollapsibleState.None);
			this.tooltip = "(in process)" + child?.get_command();
			this.contextValue = 'ROOT_OBJ_TEMP';
		} else {
			super(label||"", vscode.TreeItemCollapsibleState.Collapsed);
			this.tooltip = child?.get_command();
			this.contextValue = "SUB_C";
		}
		this.command_index = command_index;
		this.parentBashCommand = parentBashCommand;
		this.childBashCommand = child;
		this.iconPath = undefined;
		if (parentBashCommand.get_important()===true && parentBashCommand?.get_temporary()===false) {
			this.resourceUri = vscode.Uri.parse('bash_commands://'+child?.get_index());
		} else {
			this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://'+child?.get_index());
		}
	}
	get_children(): DisplayCommand[] {
		const gray = this.parentBashCommand.get_important()===true && this.parentBashCommand.get_temporary()===false;
		return [
			new DisplayCommandAdditionalInfo(this.childBashCommand,'Output', this.childBashCommand?.get_output() || '', this.childBashCommand?.get_index()||0, gray, "Output"),
			new DisplayCommandAdditionalInfo(this.childBashCommand,'Inputs', this.childBashCommand?.get_input() || '', this.childBashCommand?.get_index()||0, gray, "Inputs"),
			//new DisplayCommandAdditionalInfo(this.childBashCommand,'Important', this.childBashCommand?.get_important() ? 'Yes' : 'No', this.childBashCommand?.get_index()||0, gray, undefined)
		];
	}
	get_root(): BashCommandContainer {
		return this.parentBashCommand;
	}
	get_child_index(): number {
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
	get_children(): DisplayCommand[] {
		return [];
	}
	get_root(): null {
		return null;
	}
	get_child_index(): number {
		return -1;
	}
	
}
