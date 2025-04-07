# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2025-04-07

### Added:
- Automatic generation of config files.
- Chat Panel inside Snakemaker main view. Allows to access Snakemaker chat with any LLM, without the need to use Copilot.
- Snakemaker now has context of included .snk and .yaml files.
- Notebook export now uses the *script* directive of Snakemake, allowing for smaller generated code (command line arguments not needed anymore).
- Notebook export now allows to resolve dependencies with wildcards.


### Changed:
- Improved Snakefile generation, new rules are now added at the end of the Snakefile, rule all is updated.
- Improved support for external LLMs, better error handling.
- Better prompts for LLM, resulting in overall improved quality of solutions.
- Bug fixes.

## [0.2.1] - 2025-03-20

### Added:
- Notebook export process can now be saved to file and loaded back.
- Notebook export: now a config.yaml file is generated and updated with the notebook export process.

### Changed:
- Improvements in management of functions in the notebook feature.
- New rules added to the bottom of the Snakefile.
- Improved rule: all generation.
- Exporting rule: now Snakemaker looks for Snakefile(s) opened in the editor's tabs.
- Improved notebook export: better code generation.
- Improved notebook export: using script directive to allow scripts accessing Snakemake state.

## [0.2.0] - 2025-03-07

### Changed:
- Small fixes and improvements.

## [0.1.9] - 2025-03-06

### Added
- Notebook export: Copilot Chat can now perform actions on the exporting process such as batch-fixing code, modifying dependencies, renaming rules and more.
- Notebook export: Snakemake rules can now be modified by hand.
- Notebook export: added Undo/Redo functionality.

### Changed
- Bug fixes
- Improved user interface.

## [0.1.8] - 2025-03-04

### Added
- Experimental - export Notebook feature.
- Managing of loops in bash commands.
- Added option for adding comments to generated rules
- Added command for automatic generation of documentation for the current work.

### Changed
- Improved model context, now it manages includes and config files.
- Improved output formatting. Now rules are added at the end of the Snakefile.
- General improvements in prompts.

## [0.1.7] - 2025-01-16

### Added 

- Snakefile/Makefile is now included in the model's context. Redundant rules are not generated, and the model tries to follow the formalism of the existing rules. Limited to the currently opened file in the editor for now.
- New command allows to manually paste command history into Snakemaker history.

### Changed

- Prompts improved, allowing for better rule generation.
- Model's output cleaned up from recurrent headers that do not belong to the Snakefile and the models insist in producing.

## [0.1.6] - 2025-01-15

### Added

- Icons for light theme (in case someone is crazy enough to use it)

### Changed

- Settings regrouped
- Improved Chat capabilities
- Custom model setup has now a dedicated view

## [0.1.5] - 2025-01-10

### Changed

- Small bugfixes and improvements in the chat interface.
- Improved performances.

## [0.1.4] - 2025-01-09

### Added

- Automatic session recovery. By default, Snakemaker maintain the session state between the runs. Can be disabled in settings.
- Automatic rule validation and correction: generated Snakemake rules are now checked for errors, and fed back to the model with the error message for correction. Can be disabled in settings.

### Changed

- Improved prompts - now the model prefers to output generic rules using wildcards.
- Improved Snakemake rule generation regarding the best practices: now rules contains Log directive. 
- Log directive and generic rules can be disabled in settings.
- Improved chat integration: chat is more useful and informative.


## [0.1.2] - 2025-01-07

### Added

- Support for arbitrary models through OpenAI API standard.
- Support for GNU Make rules output.


## [0.1.1] - 2025-01-07
Initial release