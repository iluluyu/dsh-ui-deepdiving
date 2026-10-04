<p align="right"><a href="README.md">简体中文</a> · <a href="README.en.md">English</a></p>

# dsh-ui-deepdiving

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的运行状态行加水流光影。关动画时仍显示官方文字。

六种预设，设置里即时切换：水流（默认）、原版扫光、呼吸、虹彩、脉冲、极光。状态文字留空则保留官方文案和计时。

## 安装

需要 dsh `0.2.1`。

```sh
dsh plugin --profile web add dsh-ui-deepdiving
```

重启 `dsh web` 并刷新。卸载：`dsh plugin --profile web remove dsh-ui-deepdiving`。

## 设置

*插件 → dsh-ui-deepdiving*。默认：水流，速度跟随生成，辉光关，减弱动态时强制流动关。打开「减弱动态时强制流动」后，系统减少动态时仍保持流动。

## 许可

MIT © iluluyu
