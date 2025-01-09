# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2025-01-07 TODO

### Added

- Automatic session recovery.
- Automatic rule validation and correction: generated Snakemake rules are now checked for errors, and fed back to the model with the error message for correction. Can be disabled in settings.

### Changed

- Improved prompts - now the model prefers to output generic rules using wildcards.
- Improved Snakemake rule generation regarding the best practices: now rules contains Log directive. 
- Log directive and generic rules can be disabled in settings.


## [0.1.2] - 2025-01-07

### Added

- Support for arbitrary models through OpenAI API standard.
- Support for GNU Make rules output.


## [0.1.1] - 2025-01-07
Initial release