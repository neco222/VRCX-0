<div align="center">

# VRCX-0

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-Hant.md) | 日本語 | [한국어](README.ko-KR.md)

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

VRCX-0 は VRCX のリライト版です。従来の CefSharp + Vue ベースの構成から、**Tauri + React** ベースへ作り直しています。
開発は、以前 VRCX のメンテナーを務めていたメンバーの一人が行っています。

VRCX-0 は、プレイヤーの普段使いを重視しています。リソース使用量を抑え、アプリサイズをコンパクトにしながら、新機能の開発とサポートを続けていきます。

現行の VRCX はすでに安定した状態にあり、今後は大きな変更よりも、メンテナンスや不具合修正が中心になると見ています。一方で、VRCX-0 では新機能の開発やサポートを続けながら、独自のロードマップに沿って開発を進めていきます。

## 主な特徴

- VRCX と比べて、メモリ使用量をおよそ 50%〜70% 削減
- バックグラウンドモードでは、基本機能を動かしたまま、メモリ使用量を数十 MB 程度に抑えられます
- AppImage を除き、インストーラーは十数MB 程度の軽量サイズで、アプリ本体のサイズも大幅に削減
- 見直した UI と操作体験
- キーボードだけでの操作に対応
- ヘッドレスモード
- 新機能の開発とサポートを継続

## データ移行

初回起動時に、既存の VRCX のデータベースと設定を自動で移行できます。

移行しても、元の VRCX データには変更を加えません。
既存ユーザーは手動設定なしで、これまでのデータを引き継いで使い始められます。

## ライセンス

このリポジトリの初回コミットは、フォーク時点の上流 VRCX のスナップショットに対応しており、MIT License に従います。

フォーク後に追加、変更、または書き直されたコードは、GNU General Public License v3.0 (GPLv3) に従います。

## 開発

開発に必要なもの:

- Node.js LTS
- rustup 経由でインストールした Rust の latest stable toolchain

```bash
git clone https://github.com/Map1en/VRCX-0
cd VRCX-0

npm install
npm run tauri:dev
```
