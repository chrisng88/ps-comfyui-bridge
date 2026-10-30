# 示例工作流说明

这里是两份变体示例，根目录的 `workflow_api.json` 是插件默认加载的那份。三份是同一套流程（Flux + TTP 分块高清修复 / 产品精修），区别主要在 denoise（0.2 / 0.3）、VAE 文件名和个别批处理节点。

| 文件 | denoise | VAE |
|---|---|---|
| `../workflow_api.json` | 0.2 | `ae.sft` |
| `pc-ai-cloudstudio.json` | 0.3 | `ae.sft` |
| `ps-ai.json` | 0.3 | `ae.safetensors` |

使用方法：把文件复制到插件根目录，并在面板里把工作流文件名改成它。

依赖的模型和自定义节点清单见根目录 README 的「示例工作流」一节。缺模型 / 节点时 ComfyUI 会报红，那是示例的依赖问题，和插件无关 — 也可以直接换成你自己跑通的工作流。
