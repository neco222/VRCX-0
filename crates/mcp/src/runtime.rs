use std::sync::Arc;

use vrcx_0_application::{
    MutualGraphFetchRuntime, RealtimeHostRuntime, RuntimeAuthScope, RuntimeDiagnostics,
    RuntimeSyncEngine, TaskSupervisor, WebClient,
};
use vrcx_0_persistence::config::ConfigRepository;
use vrcx_0_persistence::DatabaseService;
use vrcx_0_runtime_host::RuntimeHostState;

#[derive(Clone)]
pub struct McpRuntime {
    pub(crate) db: Arc<DatabaseService>,
    pub(crate) web: Arc<WebClient>,
    pub(crate) diagnostics: RuntimeDiagnostics,
    pub(crate) sync: RuntimeSyncEngine,
    pub(crate) realtime_runtime: Arc<RealtimeHostRuntime>,
    pub(crate) auth_scope: RuntimeAuthScope,
    pub(crate) config: ConfigRepository,
    pub(crate) mutual_graph_fetch: MutualGraphFetchRuntime,
    pub(crate) tasks: TaskSupervisor,
}

impl McpRuntime {
    pub fn from_host(state: &RuntimeHostState) -> Self {
        Self {
            db: Arc::clone(&state.db),
            web: Arc::clone(&state.web),
            diagnostics: state.runtime_context.diagnostics.clone(),
            sync: state.runtime_context.sync.clone(),
            realtime_runtime: Arc::clone(&state.realtime_runtime),
            auth_scope: state.runtime_context.auth_scope.clone(),
            config: state.runtime_context.config.clone(),
            mutual_graph_fetch: state.runtime_context.mutual_graph_fetch.clone(),
            tasks: state.runtime_context.tasks.clone(),
        }
    }

    pub(crate) fn current_user_id(&self) -> Option<String> {
        // The auth scope holds the signed-in user across WebSocket reconnects;
        // the realtime friend snapshot is only populated while a live session is
        // active, so prefer the auth scope and fall back to the snapshot.
        let from_auth = self.auth_scope.snapshot().current_user_id;
        if !from_auth.trim().is_empty() {
            return Some(from_auth);
        }
        self.realtime_runtime
            .friend_snapshot()
            .map(|snapshot| snapshot.current_user_id)
            .filter(|value| !value.trim().is_empty())
    }

    pub(crate) fn current_endpoint(&self) -> String {
        self.realtime_runtime
            .friend_snapshot()
            .map(|snapshot| snapshot.endpoint)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_default()
    }
}
