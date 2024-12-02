"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TodoDecorationProvider = void 0;
const vscode_1 = require("vscode");
// define the decoration provider
class TodoDecorationProvider {
    provideFileDecoration(uri, token) {
        console.log('provideFileDecoration', uri.toString());
        console.log(uri.scheme);
        // https://code.visualstudio.com/api/references/theme-color#lists-and-trees
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