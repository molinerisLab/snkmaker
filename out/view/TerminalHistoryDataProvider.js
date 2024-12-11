"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalHistoryDataProvider = void 0;
const vscode = __importStar(require("vscode"));
class TerminalHistoryDataProvider {
    viewModel;
    tree = [];
    _refreshCallback = new vscode.EventEmitter();
    onDidChangeTreeData = this._refreshCallback.event;
    //TODO what are those
    dropMimeTypes = ['application/vnd.code.tree.bash-commands'];
    dragMimeTypes = ['text/uri-list'];
    constructor(viewModel, isArchive = false) {
        this.viewModel = viewModel;
        if (isArchive) {
            viewModel.bashCommandsArchiveSubscribe(commands => {
                this.tree = this.buildTree(commands);
                this._refreshCallback.fire();
            });
        }
        else {
            viewModel.bashCommandsSubscribe(commands => {
                this.tree = this.buildTree(commands);
                this._refreshCallback.fire();
            });
        }
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve(element.get_children());
        }
        else {
            return Promise.resolve(this.tree);
        }
    }
    buildTree(commands) {
        return commands.map(command => new DisplayCommandRoot(command));
    }
    async handleDrop(target, sources, _token) {
        console.log("Drop");
        console.log(target); //this is where you drop! - undefined if root
        const transferItem = sources.get('application/vnd.code.tree.bash-commands'); //This is what you drop
        if (!transferItem) {
            return;
        }
        //Get target BashCommandContainer
        const targetBashCommandContainer = target?.get_root() || null;
        //Get BashCommand from the dropped item
        const sourceBashCommands = transferItem.value.filter((item) => item.get_root() !== null).map((item) => [item.get_root(), item.get_child_index()]);
        this.viewModel.moveCommands(sourceBashCommands, targetBashCommandContainer);
    }
    async handleDrag(source, treeDataTransfer, _token) {
        treeDataTransfer.set('application/vnd.code.tree.bash-commands', new vscode.DataTransferItem(source));
    }
}
exports.TerminalHistoryDataProvider = TerminalHistoryDataProvider;
class DisplayCommandRoot extends vscode.TreeItem {
    bashCommand;
    constructor(bashCommand) {
        const label = bashCommand.get_command();
        if (bashCommand.get_temporary() === true) {
            super(label, vscode.TreeItemCollapsibleState.None);
            this.tooltip = "(in process)" + bashCommand.get_command();
            this.contextValue = 'ROOT_OBJ_TEMP';
        }
        else {
            super(label, vscode.TreeItemCollapsibleState.Collapsed);
            this.tooltip = bashCommand.get_command();
            this.contextValue = bashCommand.get_important() ? 'ROOT_OBJ_I' : 'ROOT_OBJ_NI';
        }
        this.bashCommand = bashCommand;
        this.iconPath = undefined;
        if (this.bashCommand.get_important() === true && this.bashCommand.get_temporary() === false) {
            this.resourceUri = vscode.Uri.parse('bash_commands://' + this.bashCommand.get_index());
        }
        else {
            this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://' + this.bashCommand.get_index());
        }
    }
    get_children() {
        //If command has children, return children commands.
        //if not, return stuff like inputs, outputs...
        const gray = this.bashCommand.get_important() === true && this.bashCommand.get_temporary() === false;
        if (this.bashCommand.get_num_children() > 0) {
            const r = Array.from(Array(this.bashCommand.get_num_children()).keys()).map((index) => new DisplayCommandChildCommand(this.bashCommand, index));
            const r0 = new DisplayCommandAdditionalInfo(this.bashCommand, 'Rule name', this.bashCommand.get_rule_name(), this.bashCommand.get_index(), gray, "RuleName");
            return [r0, ...r];
        }
        else {
            return [
                new DisplayCommandAdditionalInfo(this.bashCommand, 'Rule name', this.bashCommand.get_rule_name(), this.bashCommand.get_index(), gray, "RuleName"),
                new DisplayCommandAdditionalInfo(this.bashCommand, 'Output', this.bashCommand.get_output(), this.bashCommand.get_index(), gray, "Output"),
                new DisplayCommandAdditionalInfo(this.bashCommand, 'Inputs', this.bashCommand.get_input(), this.bashCommand.get_index(), gray, "Inputs"),
                //new DisplayCommandAdditionalInfo(this.bashCommand, 'Important', this.bashCommand.get_important() ? 'Yes' : 'No', this.bashCommand.get_index(), gray,undefined)
            ];
        }
    }
    get_root() {
        return this.bashCommand;
    }
    get_child_index() {
        return -1;
    }
}
class DisplayCommandChildCommand extends vscode.TreeItem {
    childBashCommand;
    parentBashCommand;
    command_index;
    constructor(parentBashCommand, command_index) {
        const child = parentBashCommand.get_children(command_index);
        const label = child?.get_command();
        if (child?.get_temporary() === true) {
            super(label || "", vscode.TreeItemCollapsibleState.None);
            this.tooltip = "(in process)" + child?.get_command();
            this.contextValue = 'ROOT_OBJ_TEMP';
        }
        else {
            super(label || "", vscode.TreeItemCollapsibleState.Collapsed);
            this.tooltip = child?.get_command();
            this.contextValue = "SUB_C";
        }
        this.command_index = command_index;
        this.parentBashCommand = parentBashCommand;
        this.childBashCommand = child;
        this.iconPath = undefined;
        if (parentBashCommand.get_important() === true && parentBashCommand?.get_temporary() === false) {
            this.resourceUri = vscode.Uri.parse('bash_commands://' + child?.get_index());
        }
        else {
            this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://' + child?.get_index());
        }
    }
    get_children() {
        const gray = this.parentBashCommand.get_important() === true && this.parentBashCommand.get_temporary() === false;
        return [
            new DisplayCommandAdditionalInfo(this.childBashCommand, 'Output', this.childBashCommand?.get_output() || '', this.childBashCommand?.get_index() || 0, gray, "Output"),
            new DisplayCommandAdditionalInfo(this.childBashCommand, 'Inputs', this.childBashCommand?.get_input() || '', this.childBashCommand?.get_index() || 0, gray, "Inputs"),
            //new DisplayCommandAdditionalInfo(this.childBashCommand,'Important', this.childBashCommand?.get_important() ? 'Yes' : 'No', this.childBashCommand?.get_index()||0, gray, undefined)
        ];
    }
    get_root() {
        return this.parentBashCommand;
    }
    get_child_index() {
        return this.command_index;
    }
}
class DisplayCommandAdditionalInfo extends vscode.TreeItem {
    modifier;
    parent;
    constructor(parent, childTitle, childText, index, gray, modifiable) {
        const label = childTitle + ": " + childText;
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = childText;
        if (modifiable) {
            this.contextValue = 'CHILD_OBJ_MOD';
            this.modifier = modifiable;
        }
        else {
            this.contextValue = 'CHILD_OBJ';
        }
        this.parent = parent;
        this.resourceUri = !gray ? vscode.Uri.parse('bash_command_info_unimportant://' + childTitle + index) : vscode.Uri.parse('bash_commands_details://' + childTitle + index);
        this.iconPath = new vscode.ThemeIcon("find-collapseddebug-breakpoint-unverified");
    }
    get_children() {
        return [];
    }
    get_root() {
        return null;
    }
    get_child_index() {
        return -1;
    }
}
//# sourceMappingURL=TerminalHistoryDataProvider.js.map