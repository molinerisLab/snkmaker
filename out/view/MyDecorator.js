"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TodoDecorationProvider = void 0;
const vscode_1 = require("vscode");
// define the decoration provider
class TodoDecorationProvider {
    viewModel;
    constructor(viewModel) {
        this.viewModel = viewModel;
    }
    provideFileDecoration(uri, token) {
        if (uri.scheme === 'bash_commands_unimportant') {
            return {
                color: new vscode_1.ThemeColor('disabledForeground'),
                // badge: "1"
            };
        }
        else if (uri.scheme === 'selected_model') {
            return {
                color: new vscode_1.ThemeColor('terminal.ansiGreen'),
                // badge: "2"
            };
        }
        return undefined;
    }
}
exports.TodoDecorationProvider = TodoDecorationProvider;
//# sourceMappingURL=MyDecorator.js.map