<div align="center">

# VRCX-0

English | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md)

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

VRCX-0 is a rewrite of VRCX, rebuilt from the previous CefSharp + Vue architecture with **Tauri + React**. It is developed by one of VRCX's former maintainers.

VRCX-0 focuses on players' everyday use: lower resource usage, a smaller app, and continued feature development and support.

The current VRCX project is already largely stable, with future upstream changes likely to focus mainly on maintenance and fixes rather than major changes. VRCX-0 will continue feature development and support while moving forward with its own roadmap.

## Highlights

- About 50%–70% lower memory usage compared to VRCX
- Background mode keeps core services running with only a few dozen MB of memory usage
- Installers are just over 10 MB (except the Linux AppImage), with a much smaller application size
- New UI and interaction model
- Full keyboard navigation
- Headless mode
- Continued feature development and support

## Data Migration

On first run, VRCX-0 can automatically migrate your existing VRCX database and settings.

Your original VRCX data is not modified.
Existing users can start using VRCX-0 with their current data without any manual setup.

## License

The initial commit of this repository corresponds to the upstream VRCX snapshot at the time of the fork and is licensed under the MIT License.

All modifications, additions, rewrites, and new code introduced after the fork are licensed under the GNU General Public License v3.0 (GPLv3).

## Development

Requirements:

- Node.js LTS
- Latest stable Rust toolchain via rustup

```bash
git clone https://github.com/Map1en/VRCX-0
cd VRCX-0

npm install
npm run tauri:dev
```
