import * as vscode from 'vscode';
import { BashCommandViewModel } from '../viewmodel/BashCommandViewmodel';
import { LLM, ModelComms } from '../model/ModelComms';

export class ModelsDataProvider implements vscode.TreeDataProvider<Model>{
    private tree: Model[] = [];
    private _refreshCallback: vscode.EventEmitter<Model | undefined | null | void> = new vscode.EventEmitter<Model | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<Model | undefined | null | void> = this._refreshCallback.event;


    constructor(viewModel: BashCommandViewModel){
        this.tree = this.buildTree(viewModel.getModels());
        viewModel.modelsSubscribe(commands => {
            this.tree = this.buildTree(commands);
            this._refreshCallback.fire();
        });
    }

    getTreeItem(element: Model): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Model): Thenable<Model[]> {
		if (element) {
            if (element.isChild===true || element.model.get_params().length===0) {
		        return Promise.resolve([]);
            } else {
                return Promise.resolve([]);
                //return Promise.resolve(element.model.get_params().map(param => new Model(param, true)));
            }
		} else {
			return Promise.resolve(this.tree);
		}
	}

	buildTree(llm: LLM) {
		return llm.models.map((command: ModelComms, index: number) => new Model(command, index, index===llm.current_model, false));
	}
}

class Model extends vscode.TreeItem {
    model: ModelComms; isChild: boolean; isSelected: boolean;
    index: number; lastClicked: number;
    constructor(model: ModelComms, index:number, isSelected: boolean, isChild: boolean) {
        super(model.get_name(), vscode.TreeItemCollapsibleState.None);
        this.model = model;
        this.isChild = isChild;
        this.isSelected = isSelected;
        this.index = index;
        this.lastClicked = 0;
        this.contextValue = model.is_user_added() ? 'USER_MODEL' : 'DEFAULT_MODEL';
        if (isChild===false){
            this.command = {
                title: 'Use Model',
                command: 'use-model',
                arguments: [this],
            };
            this.tooltip = model.get_name() + (isSelected ? ' (selected)' : '');
            if (isSelected){
                this.resourceUri = vscode.Uri.parse('selected_model://'+this.model.get_name());
                this.iconPath = new vscode.ThemeIcon("debug-breakpoint");
            } else {
                this.resourceUri = vscode.Uri.parse('available_model://'+this.model.get_name());
                this.iconPath = new vscode.ThemeIcon("debug-breakpoint-data-unverified");
            }
        }
    }

    checkDoubleClick(){
        const now = new Date().getTime();
        if (now - this.lastClicked < 500){
            this.lastClicked = 0;
            return true;
        }
        this.lastClicked = now;
    }
}
