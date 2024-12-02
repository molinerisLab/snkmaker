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
exports.ModelsDataProvider = void 0;
const vscode = __importStar(require("vscode"));
class ModelsDataProvider {
    tree = [];
    _refreshCallback = new vscode.EventEmitter();
    onDidChangeTreeData = this._refreshCallback.event;
    constructor(viewModel) {
        this.tree = this.buildTree(viewModel.getModels());
        viewModel.modelsSubscribe(commands => {
            this.tree = this.buildTree(commands);
            this._refreshCallback.fire();
        });
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            if (element.isChild === true || element.model.get_params().length === 0) {
                return Promise.resolve([]);
            }
            else {
                return Promise.resolve([]);
                //return Promise.resolve(element.model.get_params().map(param => new Model(param, true)));
            }
        }
        else {
            return Promise.resolve(this.tree);
        }
    }
    buildTree(llm) {
        return llm.models.map((command, index) => new Model(command, index, index === llm.current_model, false));
    }
}
exports.ModelsDataProvider = ModelsDataProvider;
class Model extends vscode.TreeItem {
    model;
    isChild;
    isSelected;
    index;
    lastClicked;
    constructor(model, index, isSelected, isChild) {
        super(model.get_name(), vscode.TreeItemCollapsibleState.None);
        this.model = model;
        this.isChild = isChild;
        this.isSelected = isSelected;
        this.index = index;
        this.lastClicked = 0;
        if (isChild === false) {
            this.command = {
                title: 'Use Model',
                command: 'use-model',
                arguments: [this],
            };
            this.tooltip = model.get_name() + (isSelected ? ' (selected)' : '');
            if (isSelected) {
                this.resourceUri = vscode.Uri.parse('selected_model://' + this.model.get_name());
                this.iconPath = new vscode.ThemeIcon("debug-breakpoint");
            }
            else {
                this.resourceUri = vscode.Uri.parse('available_model://' + this.model.get_name());
                this.iconPath = new vscode.ThemeIcon("debug-breakpoint-data-unverified");
            }
        }
    }
    checkDoubleClick() {
        const now = new Date().getTime();
        if (now - this.lastClicked < 500) {
            this.lastClicked = 0;
            return true;
        }
        this.lastClicked = now;
    }
}
//# sourceMappingURL=ModelsDataProvider.js.map