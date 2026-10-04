<p align="right"><a href="README.md">简体中文</a> · <a href="README.en.md">English</a></p>

# dsh-ui-deepdiving

Flowing light for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) running label. The official text still shows when animations are off.

Six presets, switched live: water flow (default), stock sweep, breath, rainbow, pulse, aurora. An empty status string keeps the official wording and clock.

## Install

Requires dsh `0.2.1`.

```sh
dsh plugin --profile web add dsh-ui-deepdiving
```

Restart `dsh web` and reload. Uninstall: `dsh plugin --profile web remove dsh-ui-deepdiving`.

## Settings

*Plugins → dsh-ui-deepdiving*. Defaults: water flow, speed follows generation, glow off, force-flow under reduced motion off. Turn that switch on to keep flowing when the system reduces motion.

## License

MIT © iluluyu
