import { CancellationToken, FileDecoration, FileDecorationProvider, ProviderResult, ThemeColor, Uri } from "vscode";
import { BashCommandViewModel } from "../viewmodel/BashCommandViewmodel";

// define the decoration provider
export class TodoDecorationProvider implements FileDecorationProvider {
    private viewModel: BashCommandViewModel;
    constructor(viewModel: BashCommandViewModel) {
        this.viewModel = viewModel;
    }
    provideFileDecoration(uri: Uri, token: CancellationToken): ProviderResult<FileDecoration> {
        if (uri.scheme === 'bash_commands_unimportant' || uri.scheme === 'bash_command_info_unimportant') {
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