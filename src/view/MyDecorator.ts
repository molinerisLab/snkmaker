import { CancellationToken, FileDecoration, FileDecorationProvider, ProviderResult, ThemeColor, Uri } from "vscode";

// define the decoration provider
export class TodoDecorationProvider implements FileDecorationProvider {
    provideFileDecoration(uri: Uri, token: CancellationToken): ProviderResult<FileDecoration> {
        console.log('provideFileDecoration', uri.toString());
        console.log(uri.scheme);
        // https://code.visualstudio.com/api/references/theme-color#lists-and-trees
        if (uri.scheme === 'bash_commands_unimportant') {
            return {
                color: new ThemeColor('disabledForeground'),
                // badge: "1"
            };
        } else if (uri.scheme === 'selected_model'){
            return {
                color: new ThemeColor('terminal.ansiGreen'),
                // badge: "2"
            };
        }

        return undefined;
    }
}