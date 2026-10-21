# 扑翼模式 / Flapping mode

扑翼调试信息默认隐藏，开启“显示调试信息”后显示启动阻断原因、油门／解锁输入值、左右位置指令和频率。状态对应接收机已保存配置，不随未保存的表单改变。位置指令不是舵机位置反馈；失联时输入值可能已过期。旧固件没有诊断字段时显示状态不可用，需要同时更新接收机和配置器。当前零油门判断要求不超过 998 μs，最低 1000 μs 无法通过启动检查。

“飞控”页面新增独立、可折叠的“扑翼模式”，位于漂移辅助下方，新手和专家模式均可使用。沿用原页面结构，不新增机型分类。接收机产生扑动指令，配置器只负责设置；本模式不含姿态稳定。

1. 在 PWM 页面将两个物理输出设为普通舵机 PWM，关闭窄脉冲，并按硬件设置脉冲极性及端口行程限幅。修改 PWM 模式或刷新率后重启接收机，实际输出频率在启动时分配。
2. 展开扑翼设置，选择左右输出口，按实际机构填写各自上扑、下扑和停靠位置。位置是最终 PWM 微秒值，不叠加普通输出反向；镜像安装通过相反的上下端点顺序适配。默认位置均为 1500 μs，未校准时不能启用。
3. 选择油门／转向输入，默认 CH3 / CH1，配置共用的解锁开关（默认 CH5）。不得与启用的 Wi-Fi 共存开关或彼此冲突。漂移辅助与扑翼不可同时启用。
4. 设置频率、下扑时间占比和转向差动。默认 0.5–2 Hz、下扑 35%、差动 20%；这些是测试初值，不代表舵机或机体的已验证能力。最快半行程须至少有四个 PWM 刷新周期。
5. 使用飞控页面统一的保存入口，一次保存当前页面的飞控、解锁和扑翼设置。取消解锁时可保存；保持解锁和射频／Wi-Fi 共存时，将旧、新油门通道归零并等待停靠完成后也可保存。
6. 解锁后先让油门归零，再增加油门。左右同步、上扑慢下扑快，转向通过减小一侧下扑行程产生差动。零油门、取消解锁和失联会停止周期并在 300 ms 内插值到停靠位置；高油门重新连接不会自动恢复扑动。

未连接时可查看编辑，连接后载入设备参数；只有确认连接旧固件且缺少 `fc_flapping` 时才显示不支持。保存到旧固件时省略关闭状态的新字段，并拒绝发送启用请求。

Profile 沿用版本 1，新增 `flight.flapping`，缺少该字段时默认为关闭。导入校验包括解锁、通道冲突、端口、限幅和刷新率；原有飞控配置保存流程同步应用已导入的扑翼设置。扑翼与其他飞控设置共用一个表单和保存入口，不再提供独立保存按钮。PWM 页面显示已接管的端口。

Run `node --test src/drift.test.js src/flapping.test.js src/flight-save.test.js` and `npm run build` from `app`. Desktop validation uses the existing Tauri/NSIS build; updater signing may be disabled through a temporary external build configuration for a local test installer. Production configuration remains unchanged.

Browser checks use a mocked receiver for beginner/expert saving, invalid calibration, phone width, profile export/import/application, offline preview and old firmware. These checks do not replace servo, radio coexistence or flight testing.

2026-10-20 software verification: 66 selected receiver Native cases passed (10 flapping + 56 existing regression cases); 11 configurator unit tests passed; mocked-browser beginner/expert saving, profile application, offline/legacy behavior and phone layout passed without browser errors. ESP32-C3 unified firmware and the Windows NSIS test installer built successfully. Known upstream failing/empty Native suites were excluded, so this is not a full Native suite pass. No hardware was flashed and no servo, radio coexistence or flight test was performed.

2026-10-21 保存修复：删除独立扑翼表单与保存按钮，新手／专家均使用飞控页面统一保存；保存前读取当前全部表单值，避免忙碌重绘后读取旧配置。专家模式复用原解锁设置，新手模式保留一套共用解锁设置。校验或接收机拒绝保存时恢复当前输入和展开状态，不再把开关显示回旧值。

本次验证：17 项前端／保存回归测试通过；浏览器检查新手／专家模式的统一保存、开关启停、参数回读、Profile 应用、保存拒绝后保留输入、旧固件原飞控保存及离线预览，均通过。接收机代码本轮未修改，真实接收机保存与舵机操作仍需设备验证。
