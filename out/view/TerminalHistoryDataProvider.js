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
    tree;
    _refreshCallback = new vscode.EventEmitter();
    onDidChangeTreeData = this._refreshCallback.event;
    constructor(viewModel, isArchive = false) {
        this.tree = [];
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
            if (element.isChild) {
                return Promise.resolve([]);
            }
            return Promise.resolve(element.getChildren());
        }
        else {
            return Promise.resolve(this.tree);
        }
    }
    buildTree(commands) {
        return commands.map(command => new DisplayCommand(command, false));
    }
}
exports.TerminalHistoryDataProvider = TerminalHistoryDataProvider;
class DisplayCommand extends vscode.TreeItem {
    isChild;
    bashCommand;
    index;
    modifier;
    constructor(bashCommand, isChild = false, childTitle, childText, index, modifiable) {
        if (isChild === true) {
            const label = (childTitle || '') + ": " + childText;
            super(label, vscode.TreeItemCollapsibleState.None);
            this.tooltip = childText || '';
            this.isChild = true;
            if (modifiable) {
                this.contextValue = 'CHILD_OBJ_MOD';
                this.modifier = modifiable;
            }
            else {
                this.contextValue = 'CHILD_OBJ';
            }
            this.index = index || 0;
            this.setResourceUri();
            this.iconPath = new vscode.ThemeIcon("find-collapseddebug-breakpoint-unverified");
            this.bashCommand = bashCommand;
            return;
        }
        const label = bashCommand.command;
        if (bashCommand.temporary === true) {
            super(label, vscode.TreeItemCollapsibleState.None);
            this.tooltip = "(in process)" + bashCommand.command;
            this.contextValue = 'ROOT_OBJ_TEMP';
        }
        else {
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
            this.resourceUri = vscode.Uri.parse('bash_commands_details://' + this.index);
        }
        else if (this.bashCommand.important && this.bashCommand.temporary === false) {
            this.resourceUri = vscode.Uri.parse('bash_commands://' + this.index);
        }
        else {
            this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://' + this.index);
        }
    }
    getChildren() {
        return [
            //new DisplayCommand(undefined, 'Full command', this.bashCommand?.command || '', this.index, false),
            new DisplayCommand(this.bashCommand, true, 'Output', this.bashCommand?.output || '', this.index, "Output"),
            new DisplayCommand(this.bashCommand, true, 'Inputs', this.bashCommand?.inputs || '', this.index, "Inputs"),
            new DisplayCommand(this.bashCommand, true, 'Important', this.bashCommand?.important ? 'Yes' : 'No', this.index, undefined)
        ];
    }
}
//# sourceMappingURL=TerminalHistoryDataProvider.js.map