use crate::adapters::ipc::{IpcEventDisposition, IpcEventSink};
use crate::error::AppError;

use super::GameClientHostRuntime;

impl IpcEventSink for GameClientHostRuntime {
    fn on_ipc_event(&self, packet: &str) -> Result<IpcEventDisposition, AppError> {
        match self.on_ipc_packet(packet) {
            Ok(disposition) => Ok(disposition),
            Err(error) => {
                tracing::warn!("failed to handle GameClient IPC event: {error}");
                Ok(IpcEventDisposition::Forward)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use crate::adapters::application::game_client::GameClientHostRuntime;
    use crate::adapters::ipc::{IpcEventDisposition, IpcEventSink};
    use crate::adapters::log_watcher::LogWatcher;
    use crate::error::AppError;
    use vrcx_0_application::GameClientActions;
    use vrcx_0_application::ImageCache;
    use vrcx_0_application::Result as RuntimeResult;
    use vrcx_0_application::WebClient;
    use vrcx_0_persistence::game_log::{
        ensure_game_log_tables, get_game_log_events, get_game_log_externals,
    };
    use vrcx_0_persistence::storage::StorageService;
    use vrcx_0_persistence::DatabaseService;
    use vrcx_0_runtime_host::RuntimeHostContext;

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path =
                std::env::temp_dir().join(format!("vrcx-0-{name}-{}-{nonce}", std::process::id()));
            std::fs::create_dir_all(&path).unwrap();
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    struct NoopActions;

    impl GameClientActions for NoopActions {
        fn is_game_running(&self) -> bool {
            false
        }

        fn is_steamvr_running(&self) -> bool {
            true
        }

        fn start_game(&self, _arguments: &str) -> RuntimeResult<bool> {
            Ok(true)
        }

        fn start_game_from_path(&self, _path: &str, _arguments: &str) -> RuntimeResult<bool> {
            Ok(true)
        }
    }

    fn test_runtime(
        name: &str,
    ) -> Result<(TestDir, Arc<DatabaseService>, GameClientHostRuntime), AppError> {
        let dir = TestDir::new(name);
        let db = Arc::new(DatabaseService::new(&dir.path.join("VRCX-0.sqlite3"))?);
        let storage = StorageService::new(&dir.path.join("VRCX-0.json"))?;
        let web = Arc::new(WebClient::new(
            &storage,
            &db,
            "https://app.example".into(),
            env!("CARGO_PKG_VERSION"),
        )?);
        let image_fetcher = web.image_fetcher()?;
        let image_cache = Arc::new(ImageCache::new(dir.path.join("ImageCache"), image_fetcher)?);
        let context = Arc::new(RuntimeHostContext::new(Arc::clone(&db), web, image_cache));
        let runtime = GameClientHostRuntime::test_with_actions(
            context,
            LogWatcher::new(None),
            Arc::new(NoopActions),
        );
        Ok((dir, db, runtime))
    }

    #[test]
    fn writes_vrcx_messages_to_game_log_tables() -> Result<(), AppError> {
        let (_dir, db, runtime) = test_runtime("game-client-ipc-write")?;
        runtime.set_runtime_state(true, "wrld_runtime:1");

        assert_eq!(
            runtime.on_ipc_event(r#"{"type":"VrcxMessage","MsgType":"Noty","Data":"notice"}"#)?,
            IpcEventDisposition::Handled
        );
        assert_eq!(
            runtime.on_ipc_event(
                r#"{"type":"VrcxMessage","MsgType":"External","Data":"msg","DisplayName":"User","UserId":"usr_1"}"#
            )?,
            IpcEventDisposition::Handled
        );
        assert!(runtime.wait_until_idle());

        let events = get_game_log_events(&db)?;
        let externals = get_game_log_externals(&db)?;
        assert_eq!(events[0].data, "notice");
        assert_eq!(externals[0].message, "msg");
        assert_eq!(externals[0].display_name, "User");
        assert_eq!(externals[0].user_id, "usr_1");
        assert_eq!(externals[0].location, "wrld_runtime:1");
        Ok(())
    }

    #[test]
    fn forwards_vrcx_messages_when_session_is_inactive() -> Result<(), AppError> {
        let (_dir, db, runtime) = test_runtime("game-client-ipc-inactive")?;

        assert_eq!(
            runtime.on_ipc_event(r#"{"type":"VrcxMessage","MsgType":"Noty","Data":"notice"}"#)?,
            IpcEventDisposition::Forward
        );

        ensure_game_log_tables(&db)?;
        let events = get_game_log_events(&db)?;
        assert!(events.is_empty());
        Ok(())
    }
}
