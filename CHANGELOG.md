# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2025-01- TODO

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