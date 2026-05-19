use std::sync::{Arc, Mutex};

use serde_json::{json, Map, Value};
use vrcx_0_application::HostSessionRuntime;
use vrcx_0_application::ImageCache;
use vrcx_0_application::MutualGraphFetchRuntime;
use vrcx_0_application::RuntimeAuthScope;
use vrcx_0_application::RuntimeBackgroundJobs;
use vrcx_0_application::RuntimeDiagnostics;
use vrcx_0_application::RuntimeEventBus;
use vrcx_0_application::RuntimeLifecycle;
use vrcx_0_application::RuntimeSnapshot;
use vrcx_0_application::RuntimeSyncEngine;
use vrcx_0_application::TaskSupervisor;
use vrcx_0_application::WebClient;
use vrcx_0_persistence::config::ConfigRepository;
use vrcx_0_persistence::DatabaseService;

use crate::host_actions::RuntimeHost;

#[derive(Clone)]
pub struct RuntimeHostContext {
    pub db: Arc<DatabaseService>,
    pub web: Arc<WebClient>,
    pub image_cache: Arc<ImageCache>,
    pub event_bus: RuntimeEventBus,
    pub host: RuntimeHost,
    pub runtime: RuntimeLifecycle,
    pub background_jobs: RuntimeBackgroundJobs,
    pub sync: RuntimeSyncEngine,
    pub diagnostics: RuntimeDiagnostics,
    pub tasks: TaskSupervisor,
    pub session: HostSessionRuntime,
    pub auth_scope: RuntimeAuthScope,
    pub mutual_graph_fetch: MutualGraphFetchRuntime,
    pub config: ConfigRepository,
    game_log_snapshot: Arc<Mutex<RuntimeSnapshot>>,
    now_playing: Arc<Mutex<Value>>,
}

impl RuntimeHostContext {
    pub fn new(
        db: Arc<DatabaseService>,
        web: Arc<WebClient>,
        image_cache: Arc<ImageCache>,
    ) -> Self {
        let config = ConfigRepository::new(Arc::clone(&db));
        Self {
            db,
            web,
            image_cache,
            event_bus: RuntimeEventBus::new(),
            host: RuntimeHost::new(),
            runtime: RuntimeLifecycle::new(),
            background_jobs: RuntimeBackgroundJobs::new(),
            sync: RuntimeSyncEngine::new(),
            diagnostics: RuntimeDiagnostics::new(),
            tasks: TaskSupervisor::new(),
            session: HostSessionRuntime::new(),
            auth_scope: RuntimeAuthScope::new(),
            mutual_graph_fetch: MutualGraphFetchRuntime::new(),
            config,
            game_log_snapshot: Arc::new(Mutex::new(RuntimeSnapshot::default())),
            now_playing: Arc::new(Mutex::new(default_now_playing_value())),
        }
    }

    pub fn config(&self) -> &ConfigRepository {
        &self.config
    }

    pub fn game_log_snapshot_handle(&self) -> Arc<Mutex<RuntimeSnapshot>> {
        Arc::clone(&self.game_log_snapshot)
    }

    pub fn game_log_snapshot(&self) -> RuntimeSnapshot {
        self.game_log_snapshot
            .lock()
            .map(|snapshot| snapshot.clone())
            .unwrap_or_default()
    }

    pub fn now_playing(&self) -> Value {
        self.now_playing
            .lock()
            .map(|snapshot| snapshot.clone())
            .unwrap_or_else(|_| default_now_playing_value())
    }

    pub fn observe_runtime_event(&self, event: &str, payload: &Value) {
        if event != "gameLogSideEffect" {
            return;
        }

        let kind = payload
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or_default();
        match kind {
            "nowPlaying" => {
                let Some(patch) = payload.get("payload").and_then(Value::as_object) else {
                    return;
                };
                match self.now_playing.lock() {
                    Ok(mut current) => {
                        let mut merged = current
                            .as_object()
                            .cloned()
                            .unwrap_or_else(default_now_playing_map);
                        for (key, value) in patch {
                            merged.insert(key.clone(), value.clone());
                        }
                        *current = Value::Object(merged);
                    }
                    Err(error) => {
                        tracing::warn!("failed to lock now playing snapshot: {error}");
                    }
                }
            }
            "nowPlayingReset" => match self.now_playing.lock() {
                Ok(mut current) => {
                    *current = default_now_playing_value();
                }
                Err(error) => {
                    tracing::warn!("failed to lock now playing snapshot: {error}");
                }
            },
            _ => {}
        }
    }
}

fn default_now_playing_map() -> Map<String, Value> {
    default_now_playing_value()
        .as_object()
        .cloned()
        .unwrap_or_default()
}

fn default_now_playing_value() -> Value {
    json!({
        "url": "",
        "name": "",
        "source": "",
        "displayName": "",
        "thumbnailUrl": "",
        "length": 0,
        "position": 0,
        "startedAt": null,
        "updatedAt": null,
    })
}
