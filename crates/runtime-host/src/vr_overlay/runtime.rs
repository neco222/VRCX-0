use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use chrono::{DateTime, Local, Timelike};
use serde::Serialize;
use vrcx_0_application::{
    GameLogEvent, GameLogEventSink, GameProcessEvent, GameProcessEventSink, OverlayActivitySink,
    OverlayActivitySnapshot, TaskSupervisor,
};
use vrcx_0_core::log_watcher::GameLogEventKind;
use vrcx_0_host::vr_overlay::{
    OverlayActivationButton, OverlayPlacement, OverlaySurfaceConfig, VrDeviceSnapshot,
};
use vrcx_0_persistence::config::ConfigRepository;
use vrcx_0_vr_overlay::{
    build_wrist_scene, new_shared_overlay_font_system, OverlayRenderer, OverlaySize,
    OverlaySurfaceId, RgbaFrame, TextMeasurer, TinySkiaRenderer,
};

use crate::RuntimeHostContext;

use super::{
    build_wrist_surface_model,
    eligibility::{VrOverlayEligibility, WristOverlayStartMode},
    localization::OverlayLocale,
    manager::VrOverlayManager,
    service::{HostVrOverlayService, OverlayBackendPreference},
    WristOverlayFrameInput, WristOverlayRenderOptions, WristOverlaySizePreset, WristRuntimeFooter,
};

trait VrOverlayFrameProducer: Send {
    fn next_frame(&mut self, input: VrOverlayFrameInput) -> Result<RgbaFrame, String>;
}

type VrOverlayFrameProducerFactory = Box<dyn Fn() -> Box<dyn VrOverlayFrameProducer> + Send + Sync>;

pub const VR_OVERLAY_ENABLED_CONFIG_KEY: &str = "wristOverlayEnabled";
pub const VR_OVERLAY_BACKEND_CONFIG_KEY: &str = "wristOverlayBackend";
pub const VR_OVERLAY_START_MODE_CONFIG_KEY: &str = "wristOverlayStartMode";
pub const VR_OVERLAY_BUTTON_CONFIG_KEY: &str = "wristOverlayButton";
pub const VR_OVERLAY_HAND_CONFIG_KEY: &str = "wristOverlayHand";
pub const VR_OVERLAY_SIZE_CONFIG_KEY: &str = "wristOverlaySize";
pub const VR_OVERLAY_HIDE_PRIVATE_WORLDS_CONFIG_KEY: &str = "wristOverlayHidePrivateWorlds";
pub const VR_OVERLAY_DARK_BACKGROUND_CONFIG_KEY: &str = "wristOverlayDarkBackground";
pub const VR_OVERLAY_SHOW_DEVICES_CONFIG_KEY: &str = "wristOverlayShowDevices";
pub const VR_OVERLAY_SHOW_BATTERY_PERCENT_CONFIG_KEY: &str = "wristOverlayShowBatteryPercent";
const APP_LANGUAGE_CONFIG_KEY: &str = "appLanguage";
const DATE_TIME_HOUR12_CONFIG_KEY: &str = "dtHour12";
const WRIST_DEVICE_REFRESH_INTERVAL: Duration = Duration::from_secs(5);
const WRIST_FRAME_REFRESH_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum WristOverlayHand {
    #[default]
    Left,
    Right,
    Both,
}

impl WristOverlayHand {
    fn from_config(value: &str) -> Self {
        match value.trim() {
            "right" => Self::Right,
            "both" => Self::Both,
            _ => Self::Left,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct VrOverlayRuntimeConfig {
    start_mode: WristOverlayStartMode,
    backend: OverlayBackendPreference,
    button: OverlayActivationButton,
    hand: WristOverlayHand,
    render: WristOverlayRenderOptions,
    locale: OverlayLocale,
    dt_hour12: bool,
}

impl Default for VrOverlayRuntimeConfig {
    fn default() -> Self {
        Self {
            start_mode: WristOverlayStartMode::VrchatVrMode,
            backend: OverlayBackendPreference::Auto,
            button: OverlayActivationButton::Grip,
            hand: WristOverlayHand::Left,
            render: WristOverlayRenderOptions::default(),
            locale: OverlayLocale::default(),
            dt_hour12: false,
        }
    }
}

impl VrOverlayRuntimeConfig {
    fn surface_config_key(self) -> WristSurfaceRuntimeConfig {
        WristSurfaceRuntimeConfig {
            button: self.button,
            hand: self.hand,
            size: self.render.size,
        }
    }

    fn should_clear_device_snapshot_for(self, next_config: Self) -> bool {
        self.surface_config_key() != next_config.surface_config_key()
            || self.render.show_devices != next_config.render.show_devices
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WristSurfaceRuntimeConfig {
    button: OverlayActivationButton,
    hand: WristOverlayHand,
    size: WristOverlaySizePreset,
}

struct VrOverlayFrameInput {
    config: VrOverlayRuntimeConfig,
    devices: Vec<VrDeviceSnapshot>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VrOverlayRuntimeSnapshot {
    pub enabled: bool,
    pub backend_available: bool,
    pub running: bool,
    pub vr_mode: bool,
    pub steamvr_running: bool,
    pub active_backend: Option<String>,
}

pub struct VrOverlayRuntime {
    enabled: AtomicBool,
    game_running: AtomicBool,
    vr_mode: AtomicBool,
    steamvr_running: AtomicBool,
    refresh_loop_started: AtomicBool,
    backend_available: bool,
    context: Option<Arc<RuntimeHostContext>>,
    config: Mutex<VrOverlayRuntimeConfig>,
    devices: Mutex<Vec<VrDeviceSnapshot>>,
    manager: Mutex<VrOverlayManager<HostVrOverlayService>>,
    frame_producer_factory: VrOverlayFrameProducerFactory,
    frame_producer: Mutex<Option<Box<dyn VrOverlayFrameProducer>>>,
}

#[derive(Clone)]
pub struct VrOverlayActivitySink {
    runtime: Arc<VrOverlayRuntime>,
}

impl VrOverlayActivitySink {
    pub fn new(runtime: Arc<VrOverlayRuntime>) -> Self {
        Self { runtime }
    }
}

impl OverlayActivitySink for VrOverlayActivitySink {
    fn emit_overlay_activity_snapshot(&self, _snapshot: OverlayActivitySnapshot) {
        self.runtime.reconcile_current();
    }
}

impl VrOverlayRuntime {
    pub fn new(context: Arc<RuntimeHostContext>) -> Self {
        let config = load_runtime_config(context.config());
        let producer_context = Arc::clone(&context);
        Self::new_with_frame_producer_factory(
            HostVrOverlayService::backend_available(),
            Some(context.clone()),
            config,
            Box::new(move || {
                Box::new(RuntimeWristFrameProducer::new(Arc::clone(
                    &producer_context,
                )))
            }),
        )
    }

    pub fn new_for_test() -> Self {
        Self::new_for_test_with_backend_available(true)
    }

    pub fn new_for_test_with_backend_available(backend_available: bool) -> Self {
        Self::new_with_frame_producer_factory(
            backend_available,
            None,
            VrOverlayRuntimeConfig::default(),
            Box::new(|| Box::<StaticWristFrameProducer>::default()),
        )
    }

    #[cfg(test)]
    fn new_for_test_with_frame_producer_factory(
        backend_available: bool,
        frame_producer_factory: VrOverlayFrameProducerFactory,
    ) -> Self {
        Self::new_for_test_with_config_and_frame_producer_factory(
            backend_available,
            VrOverlayRuntimeConfig::default(),
            frame_producer_factory,
        )
    }

    #[cfg(test)]
    fn new_for_test_with_config_and_frame_producer_factory(
        backend_available: bool,
        config: VrOverlayRuntimeConfig,
        frame_producer_factory: VrOverlayFrameProducerFactory,
    ) -> Self {
        Self::new_with_frame_producer_factory(
            backend_available,
            None,
            config,
            frame_producer_factory,
        )
    }

    fn new_with_frame_producer_factory(
        backend_available: bool,
        context: Option<Arc<RuntimeHostContext>>,
        config: VrOverlayRuntimeConfig,
        frame_producer_factory: VrOverlayFrameProducerFactory,
    ) -> Self {
        let service = if context.is_some() {
            HostVrOverlayService::new_with_preference(wrist_surface_configs(config), config.backend)
        } else {
            HostVrOverlayService::new_noop(wrist_surface_configs(config))
        };
        Self {
            enabled: AtomicBool::new(false),
            game_running: AtomicBool::new(false),
            vr_mode: AtomicBool::new(false),
            steamvr_running: AtomicBool::new(false),
            refresh_loop_started: AtomicBool::new(false),
            backend_available,
            context,
            manager: Mutex::new(VrOverlayManager::new(service)),
            config: Mutex::new(config),
            devices: Mutex::new(Vec::new()),
            frame_producer_factory,
            frame_producer: Mutex::new(None),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        if enabled && !self.backend_available {
            tracing::warn!("no VR overlay backend is available in this build");
        }
        self.enabled.store(enabled, Ordering::Release);
        self.reconcile_current_with_device_refresh(true);
        if !enabled {
            self.release_frame_producer();
        }
    }

    pub fn start_refresh_loop(self: &Arc<Self>, tasks: TaskSupervisor) {
        if self.refresh_loop_started.swap(true, Ordering::AcqRel) {
            return;
        }
        let runtime = Arc::clone(self);
        tasks.spawn_cancellable_thread("vr-overlay-refresh", move |stop_token| {
            let mut next_device_refresh = Instant::now();
            while !stop_token.is_stop_requested() {
                std::thread::sleep(WRIST_FRAME_REFRESH_INTERVAL);
                if !runtime.is_enabled() {
                    continue;
                }
                let now = Instant::now();
                let refresh_devices = now >= next_device_refresh;
                runtime.reconcile_current_with_device_refresh(refresh_devices);
                if refresh_devices {
                    next_device_refresh = now + WRIST_DEVICE_REFRESH_INTERVAL;
                }
            }
        });
    }

    pub fn is_backend_available(&self) -> bool {
        self.backend_available
    }

    pub fn set_vr_mode(&self, vr_mode: bool) {
        self.vr_mode.store(vr_mode, Ordering::Release);
        self.reconcile_current_with_device_refresh(true);
    }

    pub fn stop(&self) {
        if let Ok(mut manager) = self.manager.lock() {
            manager.reconcile(VrOverlayEligibility::default());
        }
        self.release_frame_producer();
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    pub fn snapshot(&self) -> VrOverlayRuntimeSnapshot {
        let active_backend = self
            .manager
            .lock()
            .ok()
            .and_then(|manager| manager.active_backend())
            .map(str::to_string);
        VrOverlayRuntimeSnapshot {
            enabled: self.enabled.load(Ordering::Acquire),
            backend_available: self.backend_available,
            running: self.is_running(),
            vr_mode: self.vr_mode.load(Ordering::Acquire),
            steamvr_running: self.steamvr_running.load(Ordering::Acquire),
            active_backend,
        }
    }

    pub fn is_running(&self) -> bool {
        self.manager
            .lock()
            .map(|manager| manager.is_running())
            .unwrap_or(false)
    }

    fn update_process_status(&self, game_running: bool, steamvr_running: bool) {
        if !game_running {
            self.vr_mode.store(false, Ordering::Release);
        }
        self.game_running.store(game_running, Ordering::Release);
        self.steamvr_running
            .store(steamvr_running, Ordering::Release);
        self.reconcile_current_with_device_refresh(true);
    }

    pub fn reconcile_current(&self) {
        self.reconcile_current_with_device_refresh(false);
    }

    fn reconcile_current_with_device_refresh(&self, refresh_devices: bool) {
        let changed_config = self.changed_runtime_config();
        if let Ok(mut manager) = self.manager.lock() {
            let mut config = self.current_runtime_config();
            if let Some(next_config) = changed_config {
                if config.backend != next_config.backend {
                    manager.set_backend_preference(next_config.backend);
                }
                let surface_config_changed =
                    config.surface_config_key() != next_config.surface_config_key();
                let clear_devices = config.should_clear_device_snapshot_for(next_config);
                if surface_config_changed {
                    match manager.set_surface_configs(wrist_surface_configs(next_config)) {
                        Ok(()) => {
                            self.commit_runtime_config(next_config, clear_devices);
                            config = next_config;
                        }
                        Err(error) => {
                            tracing::warn!(
                                error = %error,
                                "failed to apply VR overlay runtime config"
                            );
                        }
                    }
                } else {
                    self.commit_runtime_config(next_config, clear_devices);
                    config = next_config;
                }
            }
            let eligibility = VrOverlayEligibility {
                enabled: self.enabled.load(Ordering::Acquire),
                backend_available: self.backend_available,
                game_running: self.game_running.load(Ordering::Acquire),
                vr_mode: self.vr_mode.load(Ordering::Acquire),
                steamvr_running: self.steamvr_running.load(Ordering::Acquire),
                start_mode: config.start_mode,
            };
            manager.reconcile(eligibility);
            if eligibility.can_run() && manager.is_running() {
                self.refresh_devices_if_needed(
                    &mut manager,
                    refresh_devices,
                    config.render.show_devices,
                );
                self.push_wrist_frame(&mut manager, config);
            } else {
                self.release_frame_producer();
            }
        }
    }

    fn changed_runtime_config(&self) -> Option<VrOverlayRuntimeConfig> {
        let Some(context) = &self.context else {
            return None;
        };
        let next_config = load_runtime_config(context.config());
        let Ok(current_config) = self.config.lock() else {
            return None;
        };
        if *current_config == next_config {
            return None;
        }
        Some(next_config)
    }

    fn commit_runtime_config(&self, next_config: VrOverlayRuntimeConfig, clear_devices: bool) {
        let Ok(mut current_config) = self.config.lock() else {
            return;
        };
        if *current_config == next_config {
            return;
        }
        *current_config = next_config;
        if clear_devices {
            if let Ok(mut devices) = self.devices.lock() {
                devices.clear();
            }
        }
    }

    fn current_runtime_config(&self) -> VrOverlayRuntimeConfig {
        self.config.lock().map(|config| *config).unwrap_or_default()
    }

    fn refresh_devices_if_needed(
        &self,
        manager: &mut VrOverlayManager<HostVrOverlayService>,
        refresh_devices: bool,
        show_devices: bool,
    ) {
        if !show_devices {
            if let Ok(mut devices) = self.devices.lock() {
                devices.clear();
            }
            return;
        }
        let devices_empty = self
            .devices
            .lock()
            .map(|devices| devices.is_empty())
            .unwrap_or(true);
        if !refresh_devices && !devices_empty {
            return;
        }
        match manager.snapshot_devices() {
            Ok(next_devices) => {
                if let Ok(mut devices) = self.devices.lock() {
                    *devices = next_devices;
                }
            }
            Err(error) => {
                tracing::warn!(error = %error, "failed to snapshot VR overlay devices");
            }
        }
    }

    fn push_wrist_frame(
        &self,
        manager: &mut VrOverlayManager<HostVrOverlayService>,
        config: VrOverlayRuntimeConfig,
    ) {
        let devices = self
            .devices
            .lock()
            .map(|devices| devices.clone())
            .unwrap_or_default();
        let frame = match self
            .frame_producer
            .lock()
            .map_err(|_| "wrist frame producer lock poisoned".to_string())
            .and_then(|mut producer| {
                let producer = producer.get_or_insert_with(|| (self.frame_producer_factory)());
                producer.next_frame(VrOverlayFrameInput { config, devices })
            }) {
            Ok(frame) => frame,
            Err(error) => {
                tracing::warn!(error = %error, "failed to render wrist overlay frame");
                return;
            }
        };

        if let Err(error) = manager.update_frame(frame) {
            tracing::warn!(error = %error, "failed to update wrist overlay frame");
        }
    }

    fn release_frame_producer(&self) {
        if let Ok(mut producer) = self.frame_producer.lock() {
            producer.take();
        }
        if let Ok(mut devices) = self.devices.lock() {
            devices.clear();
        }
    }
}

impl Default for VrOverlayRuntime {
    fn default() -> Self {
        Self::new_for_test()
    }
}

impl GameProcessEventSink for VrOverlayRuntime {
    fn on_game_process_event(&self, event: GameProcessEvent) -> vrcx_0_application::Result<()> {
        self.update_process_status(event.is_game_running, event.is_steamvr_running);
        Ok(())
    }
}

impl GameLogEventSink for VrOverlayRuntime {
    fn ingest_game_log_event(&self, event: &GameLogEvent) -> vrcx_0_application::Result<()> {
        match event.kind {
            GameLogEventKind::OpenVrInit => self.set_vr_mode(true),
            GameLogEventKind::DesktopMode | GameLogEventKind::VrcQuit => self.set_vr_mode(false),
            _ => {}
        }
        Ok(())
    }
}

struct RuntimeWristFrameProducer {
    context: Arc<RuntimeHostContext>,
    text: TextMeasurer,
    renderer: TinySkiaRenderer,
}

impl RuntimeWristFrameProducer {
    fn new(context: Arc<RuntimeHostContext>) -> Self {
        let font_system = new_shared_overlay_font_system();
        Self {
            context,
            text: TextMeasurer::with_font_system(Arc::clone(&font_system)),
            renderer: TinySkiaRenderer::with_font_system(font_system),
        }
    }
}

impl VrOverlayFrameProducer for RuntimeWristFrameProducer {
    fn next_frame(&mut self, input: VrOverlayFrameInput) -> Result<RgbaFrame, String> {
        let frame_input = build_wrist_frame_input(&self.context, input.config, input.devices);
        let model = build_wrist_surface_model(frame_input);
        self.renderer
            .render(&build_wrist_scene(&model, &mut self.text))
            .map_err(|error| error.to_string())
    }
}

#[derive(Default)]
struct StaticWristFrameProducer;

impl VrOverlayFrameProducer for StaticWristFrameProducer {
    fn next_frame(&mut self, _input: VrOverlayFrameInput) -> Result<RgbaFrame, String> {
        Ok(RgbaFrame::new(OverlaySize::new(16, 8), vec![0; 16 * 8 * 4]))
    }
}

fn wrist_surface_configs(config: VrOverlayRuntimeConfig) -> Vec<OverlaySurfaceConfig> {
    let mut configs = Vec::new();
    if matches!(config.hand, WristOverlayHand::Left | WristOverlayHand::Both) {
        configs.push(wrist_surface_config(
            "wrist-left",
            "left-hand",
            config.render.size,
            config.button,
        ));
    }
    if matches!(
        config.hand,
        WristOverlayHand::Right | WristOverlayHand::Both
    ) {
        configs.push(wrist_surface_config(
            "wrist-right",
            "right-hand",
            config.render.size,
            config.button,
        ));
    }
    configs
}

fn wrist_surface_config(
    surface_id: &str,
    device_hint: &str,
    size: WristOverlaySizePreset,
    button: OverlayActivationButton,
) -> OverlaySurfaceConfig {
    OverlaySurfaceConfig {
        surface_id: OverlaySurfaceId::new(surface_id),
        size: size.overlay_size(),
        physical_width_meters: size.physical_width_meters(),
        placement: OverlayPlacement::TrackedDeviceRelative {
            device_hint: device_hint.to_string(),
        },
        activation_button: button,
    }
}

pub(super) fn build_wrist_frame_input(
    context: &RuntimeHostContext,
    config: VrOverlayRuntimeConfig,
    devices: Vec<VrDeviceSnapshot>,
) -> WristOverlayFrameInput {
    let game_log = context.game_log_snapshot();
    let captured_at_ms = now_ms();
    WristOverlayFrameInput {
        activity: context.overlay_activity.snapshot(),
        devices,
        footer: WristRuntimeFooter {
            player_count: game_log.players.len() as u32,
            instance_duration: instance_duration_text(
                &game_log.location,
                &game_log.started_at,
                captured_at_ms,
            ),
            local_time: local_time_text(config.dt_hour12),
        },
        options: config.render,
        locale: config.locale.as_str().to_string(),
        captured_at_ms,
    }
}

pub(super) fn load_runtime_config(config: &ConfigRepository) -> VrOverlayRuntimeConfig {
    let start_mode = config
        .get_string(VR_OVERLAY_START_MODE_CONFIG_KEY, "vrchatVrMode")
        .map(|value| WristOverlayStartMode::from_config(&value))
        .unwrap_or_default();
    let backend = config
        .get_string(VR_OVERLAY_BACKEND_CONFIG_KEY, "auto")
        .map(|value| OverlayBackendPreference::from_config(&value))
        .unwrap_or_default();
    let button = config
        .get_string(VR_OVERLAY_BUTTON_CONFIG_KEY, "grip")
        .map(|value| match value.trim() {
            "menu" => OverlayActivationButton::Menu,
            _ => OverlayActivationButton::Grip,
        })
        .unwrap_or_default();
    let hand = config
        .get_string(VR_OVERLAY_HAND_CONFIG_KEY, "left")
        .map(|value| WristOverlayHand::from_config(&value))
        .unwrap_or_default();
    let size = config
        .get_string(
            VR_OVERLAY_SIZE_CONFIG_KEY,
            WristOverlaySizePreset::Normal.as_config(),
        )
        .map(|value| WristOverlaySizePreset::from_config(&value))
        .unwrap_or_default();
    let hide_private_worlds = config
        .get_bool(VR_OVERLAY_HIDE_PRIVATE_WORLDS_CONFIG_KEY, false)
        .unwrap_or(false);
    let dark_background = config
        .get_bool(VR_OVERLAY_DARK_BACKGROUND_CONFIG_KEY, true)
        .unwrap_or(true);
    let show_devices = config
        .get_bool(VR_OVERLAY_SHOW_DEVICES_CONFIG_KEY, true)
        .unwrap_or(true);
    let show_battery_percent = config
        .get_bool(VR_OVERLAY_SHOW_BATTERY_PERCENT_CONFIG_KEY, false)
        .unwrap_or(false);
    let locale = config
        .get_string(APP_LANGUAGE_CONFIG_KEY, "en")
        .map(|value| OverlayLocale::from_config(&value))
        .unwrap_or_default();
    let dt_hour12 = config
        .get_bool(DATE_TIME_HOUR12_CONFIG_KEY, false)
        .unwrap_or(false);

    VrOverlayRuntimeConfig {
        start_mode,
        backend,
        button,
        hand,
        render: WristOverlayRenderOptions {
            size,
            hide_private_worlds,
            dark_background,
            show_devices,
            show_battery_percent,
        },
        locale,
        dt_hour12,
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}

fn local_time_text(hour12: bool) -> String {
    let now = Local::now();
    format_local_time(now.hour(), now.minute(), hour12)
}

fn format_local_time(hour: u32, minute: u32, hour12: bool) -> String {
    if !hour12 {
        return format!("{hour:02}:{minute:02}");
    }
    let period = if hour < 12 { "AM" } else { "PM" };
    let display_hour = match hour % 12 {
        0 => 12,
        value => value,
    };
    format!("{display_hour}:{minute:02} {period}")
}

fn instance_duration_text(location: &str, started_at: &str, now_ms: i64) -> String {
    if !is_real_instance_location(location) {
        return String::new();
    }
    let Some(started_at_ms) = DateTime::parse_from_rfc3339(started_at)
        .ok()
        .map(|value| value.timestamp_millis())
    else {
        return String::new();
    };
    if now_ms < started_at_ms {
        return String::new();
    }
    compact_duration(now_ms - started_at_ms)
}

fn compact_duration(duration_ms: i64) -> String {
    let total_minutes = duration_ms / 60_000;
    if total_minutes < 1 {
        return "<1m".to_string();
    }
    let total_hours = total_minutes / 60;
    let minutes = total_minutes % 60;
    if total_hours < 1 {
        return format!("{minutes}m");
    }
    if total_hours < 24 {
        return format!("{total_hours}h {minutes}m");
    }
    let days = total_hours / 24;
    let hours = total_hours % 24;
    format!("{days}d {hours}h")
}

fn is_real_instance_location(location: &str) -> bool {
    let location = location.trim().to_ascii_lowercase();
    location.starts_with("wrld_") && location.contains(':')
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn locale_is_render_only_config() {
        let base = VrOverlayRuntimeConfig::default();
        let mut translated = base;
        translated.locale = OverlayLocale::ZhCn;

        assert_eq!(base.surface_config_key(), translated.surface_config_key());
        assert!(!base.should_clear_device_snapshot_for(translated));
    }

    #[test]
    fn clock_mode_is_render_only_config() {
        let base = VrOverlayRuntimeConfig::default();
        let mut hour12 = base;
        hour12.dt_hour12 = true;

        assert_eq!(base.surface_config_key(), hour12.surface_config_key());
        assert!(!base.should_clear_device_snapshot_for(hour12));
    }

    #[test]
    fn surface_config_key_tracks_surface_affecting_fields() {
        let base = VrOverlayRuntimeConfig::default();

        let mut resized = base;
        resized.render.size = WristOverlaySizePreset::Large;
        assert_ne!(base.surface_config_key(), resized.surface_config_key());

        let mut moved = base;
        moved.hand = WristOverlayHand::Right;
        assert_ne!(base.surface_config_key(), moved.surface_config_key());

        let mut button = base;
        button.button = OverlayActivationButton::Menu;
        assert_ne!(base.surface_config_key(), button.surface_config_key());
    }

    #[test]
    fn render_options_do_not_rebuild_surface_except_size() {
        let base = VrOverlayRuntimeConfig::default();

        let mut dark_background = base;
        dark_background.render.dark_background = !dark_background.render.dark_background;
        assert_eq!(
            base.surface_config_key(),
            dark_background.surface_config_key()
        );

        let mut percent = base;
        percent.render.show_battery_percent = !percent.render.show_battery_percent;
        assert_eq!(base.surface_config_key(), percent.surface_config_key());
    }

    #[test]
    fn frame_producer_is_created_only_while_runtime_can_render_and_released_when_ineligible() {
        let created = Arc::new(AtomicUsize::new(0));
        let dropped = Arc::new(AtomicUsize::new(0));
        let runtime = VrOverlayRuntime::new_for_test_with_frame_producer_factory(
            true,
            counting_frame_producer_factory(Arc::clone(&created), Arc::clone(&dropped)),
        );

        assert_eq!(created.load(Ordering::SeqCst), 0);

        runtime.set_enabled(true);
        assert_eq!(created.load(Ordering::SeqCst), 0);

        record_process_status(&runtime, true, true, true);
        assert_eq!(created.load(Ordering::SeqCst), 0);

        runtime.set_vr_mode(true);
        assert!(runtime.is_running());
        assert_eq!(created.load(Ordering::SeqCst), 1);

        runtime.reconcile_current();
        assert_eq!(created.load(Ordering::SeqCst), 1);

        runtime.set_enabled(false);
        assert!(!runtime.is_running());
        assert_eq!(dropped.load(Ordering::SeqCst), 1);

        runtime.set_enabled(true);
        assert!(runtime.is_running());
        assert_eq!(created.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn steamvr_start_mode_releases_frame_producer_when_steamvr_stops_not_when_game_stops() {
        let created = Arc::new(AtomicUsize::new(0));
        let dropped = Arc::new(AtomicUsize::new(0));
        let config = VrOverlayRuntimeConfig {
            start_mode: WristOverlayStartMode::SteamVr,
            ..VrOverlayRuntimeConfig::default()
        };
        let runtime = VrOverlayRuntime::new_for_test_with_config_and_frame_producer_factory(
            true,
            config,
            counting_frame_producer_factory(Arc::clone(&created), Arc::clone(&dropped)),
        );

        runtime.set_enabled(true);
        record_process_status(&runtime, true, true, true);
        assert!(runtime.is_running());
        assert_eq!(created.load(Ordering::SeqCst), 1);

        record_process_status(&runtime, false, true, true);
        assert!(runtime.is_running());
        assert_eq!(dropped.load(Ordering::SeqCst), 0);

        record_process_status(&runtime, false, false, false);
        assert!(!runtime.is_running());
        assert_eq!(dropped.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn format_local_time_respects_hour12_setting() {
        assert_eq!(format_local_time(0, 5, false), "00:05");
        assert_eq!(format_local_time(23, 7, false), "23:07");
        assert_eq!(format_local_time(0, 5, true), "12:05 AM");
        assert_eq!(format_local_time(12, 30, true), "12:30 PM");
        assert_eq!(format_local_time(23, 7, true), "11:07 PM");
    }

    fn counting_frame_producer_factory(
        created: Arc<AtomicUsize>,
        dropped: Arc<AtomicUsize>,
    ) -> Box<dyn Fn() -> Box<dyn VrOverlayFrameProducer> + Send + Sync> {
        Box::new(move || {
            created.fetch_add(1, Ordering::SeqCst);
            Box::new(CountingFrameProducer {
                dropped: Arc::clone(&dropped),
            })
        })
    }

    fn record_process_status(
        runtime: &VrOverlayRuntime,
        is_game_running: bool,
        is_steamvr_running: bool,
        game_changed: bool,
    ) {
        runtime
            .on_game_process_event(GameProcessEvent {
                is_game_running,
                is_steamvr_running,
                game_changed,
            })
            .expect("record process status");
    }

    struct CountingFrameProducer {
        dropped: Arc<AtomicUsize>,
    }

    impl VrOverlayFrameProducer for CountingFrameProducer {
        fn next_frame(&mut self, _input: VrOverlayFrameInput) -> Result<RgbaFrame, String> {
            Ok(RgbaFrame::new(OverlaySize::new(16, 8), vec![0; 16 * 8 * 4]))
        }
    }

    impl Drop for CountingFrameProducer {
        fn drop(&mut self) {
            self.dropped.fetch_add(1, Ordering::SeqCst);
        }
    }
}
