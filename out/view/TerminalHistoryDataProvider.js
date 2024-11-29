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
        return commands.map(command => new DisplayCommand(command));
    }
}
exports.TerminalHistoryDataProvider = TerminalHistoryDataProvider;
class DisplayCommand extends vscode.TreeItem {
    isChild;
    bashCommand;
    index;
    constructor(bashCommand, childTitle, childText, index) {
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
            this.resourceUri = vscode.Uri.parse('bash_commands_details://' + this.index);
        }
        else if (this.bashCommand.important) {
            this.resourceUri = vscode.Uri.parse('bash_commands://' + this.index);
        }
        else {
            this.resourceUri = vscode.Uri.parse('bash_commands_unimportant://' + this.index);
        }
    }
    getChildren() {
        return [
            new DisplayCommand(undefined, 'Full command', this.bashCommand?.command || '', this.index),
            new DisplayCommand(undefined, 'Output', this.bashCommand?.output || '', this.index),
            new DisplayCommand(undefined, 'Inputs', this.bashCommand?.inputs.join(', ') || '', this.index),
            new DisplayCommand(undefined, 'Important', this.bashCommand?.important ? 'Yes' : 'No', this.index)
        ];
    }
}
//# sourceMappingURL=TerminalHistoryDataProvider.js.map