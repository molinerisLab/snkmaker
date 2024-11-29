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
exports.WriteToFiles = void 0;
const vscode = __importStar(require("vscode"));
class WriteToFiles {
    writeToEditor(value, editor) {
        if (!editor) {
            vscode.window.showInformationMessage('Please open a file in the editor to print the rules');
            return false;
        }
        const position = editor.selection.active;
        editor.edit(editBuilder => {
            editBuilder.insert(position, value);
        });
        return true;
    }
    async writeToCurrentFile(value) {
        //Write to the file currently in focus, if any
        var editor = vscode.window.activeTextEditor;
        if (!editor) {
            return vscode.commands.executeCommand('workbench.action.files.newUntitledFile').then(() => {
                editor = vscode.window.activeTextEditor;
                return this.writeToEditor(value, editor);
            });
        }
        else {
            return this.writeToEditor(value, editor);
        }
    }
    hasEditorOpen() {
        return vscode.window.activeTextEditor !== undefined;
    }
}
exports.WriteToFiles = WriteToFiles;
//# sourceMappingURL=WriteToFiles.js.map