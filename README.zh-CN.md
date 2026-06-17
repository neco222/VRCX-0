<div align="center">

# VRCX-0

[English](README.md) | 简体中文 | [繁體中文](README.zh-Hant.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md)

[![Release](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Map1en/VRCX-0/badge-data/version.json&style=flat)](https://github.com/Map1en/VRCX-0/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat)](LICENSE)
[![Downloads](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Map1en/VRCX-0/badge-data/downloads.json&style=flat)](https://github.com/Map1en/VRCX-0/releases)
[![Discord](https://img.shields.io/discord/1494343220467994644?logo=discord&logoColor=white&label=discord&style=flat)](https://discord.gg/fehKP3SVPN)
<br>
[![Build](https://img.shields.io/github/actions/workflow/status/Map1en/VRCX-0/build.yml?branch=master&label=build&style=flat)](https://github.com/Map1en/VRCX-0/actions/workflows/build.yml)
[![Unit Test](https://img.shields.io/github/actions/workflow/status/Map1en/VRCX-0/unit-test.yml?branch=master&label=tests&style=flat)](https://github.com/Map1en/VRCX-0/actions/workflows/unit-test.yml)
[![TS Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Map1en/VRCX-0/badge-data/coverage.json&style=flat)](https://github.com/Map1en/VRCX-0/actions/workflows/unit-test.yml)
[![Rust Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Map1en/VRCX-0/badge-data/rust-coverage.json&style=flat)](https://github.com/Map1en/VRCX-0/actions/workflows/unit-test.yml)

</div>

VRCX-0 是 VRCX 的重写版本，使用 **Tauri + React** 重新构建，替代原有的 CefSharp + Vue 架构。
它由 VRCX 前维护者之一开发。

VRCX-0 关注玩家日常使用：更低占用、更小体积，以及持续推进的新功能开发和支持。

现在 VRCX 整体已经比较稳定，后续变化不会太多，主要会以维护和修复为主；而VRCX-0 会继续推进、按照新路线路线图开发。

## 主要特点

- 相比 VRCX，内存占用通常降低约 50%–70%
- 后台模式下可继续使用基础服务，内存占用仅小几十 MB
- 除 AppImage 外，安装包体积仅十几 MB，程序体积更小
- 新的 UI 和交互设计
- 支持完整键盘操作
- 无头模式
- 持续的新功能开发和支持

## 数据迁移

VRCX-0 首次运行时可以自动迁移现有 VRCX 的数据库和配置。

原 VRCX 数据不会被修改。
现有用户不需要手动设置，可以从原来的数据继续使用。

## 许可

本仓库的第一个提交对应 fork 时的上游 VRCX 项目快照，并遵循 MIT License。

fork 之后新增、修改、重写的代码，均遵循 GNU General Public License v3.0（GPLv3）。

## 开发

需要安装：

- Node.js LTS
- Rust latest stable，建议通过 rustup 安装

```bash
git clone https://github.com/Map1en/VRCX-0
cd VRCX-0

npm install
npm run tauri:dev
```
