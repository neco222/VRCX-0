use super::event_patch::{
    apply_friend_event, apply_patch_to_state, is_friend_event_type, record_to_value,
};
use super::persistence::{duration_ms, is_online_state, online_offline_feed_entry};
use super::projection::state_bucket_from_patch;
use super::utils::{bool_field, object_with_pending_offline, string_field, EventTime};
use super::*;

pub(super) const PENDING_OFFLINE_DELAY_MS: u64 = 170_000;

#[derive(Clone, Debug)]
pub(super) struct PendingOffline {
    pub(super) token: u64,
    pub(super) patch: serde_json::Value,
    pub(super) previous: FriendRecord,
}

#[derive(Clone, Debug, Default)]
pub(super) struct RealtimeFriendState {
    pub(super) generation: u64,
    pub(super) timer_token: u64,
    pub(super) baseline: Option<RealtimeFriendSnapshot>,
    pub(super) pending_offline: HashMap<String, PendingOffline>,
}

#[derive(Clone, Debug, Default)]
pub struct RealtimeFriendsRuntime {
    state: Arc<Mutex<RealtimeFriendState>>,
}

impl RealtimeFriendsRuntime {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_baseline(
        &self,
        baseline: FriendRosterBaseline,
        realtime_generation: u64,
        baseline_revision: u64,
    ) -> FriendBaselineResult {
        let mut baseline = baseline.normalized();
        let mut state = self.lock_state();
        let generation = realtime_generation;
        let previous_generation = state.baseline.as_ref().map(|baseline| baseline.generation);
        state.generation = state.generation.max(generation);
        if previous_generation == Some(generation) {
            state.pending_offline.retain(|user_id, _| {
                let Some(record) = baseline.friends_by_id.get_mut(user_id) else {
                    return false;
                };
                if !is_online_state(record) {
                    return false;
                }
                record
                    .extra
                    .insert("pendingOffline".into(), Value::Bool(true));
                true
            });
        } else {
            state.pending_offline.clear();
        }
        let friend_count = baseline.friends_by_id.len();
        state.baseline = Some(RealtimeFriendSnapshot {
            current_user_id: baseline.current_user_id,
            endpoint: baseline.endpoint,
            websocket: baseline.websocket,
            generation,
            baseline_revision,
            friends_by_id: baseline.friends_by_id,
        });

        FriendBaselineResult {
            accepted: true,
            generation,
            baseline_revision,
            friend_count,
        }
    }

    pub fn clear(&self) -> u64 {
        let mut state = self.lock_state();
        state.generation = state.generation.saturating_add(1);
        state.baseline = None;
        state.pending_offline.clear();
        state.generation
    }

    pub fn clear_baseline_if_revision(&self, generation: u64, baseline_revision: u64) -> bool {
        let mut state = self.lock_state();
        let should_clear = state
            .baseline
            .as_ref()
            .map(|baseline| {
                baseline.generation == generation && baseline.baseline_revision == baseline_revision
            })
            .unwrap_or(false);
        if should_clear {
            state.generation = state.generation.saturating_add(1);
            state.baseline = None;
            state.pending_offline.clear();
        }
        should_clear
    }

    pub fn snapshot(&self) -> Option<RealtimeFriendSnapshot> {
        self.lock_state().baseline.clone()
    }

    pub fn apply_ws_message(
        &self,
        payload: &RealtimeWsMessagePayload,
    ) -> RealtimeFriendApplyResult {
        let Some(message_type) = payload.json.get("type").and_then(Value::as_str) else {
            return RealtimeFriendApplyResult::Ignored;
        };
        if !is_friend_event_type(message_type) {
            return RealtimeFriendApplyResult::Ignored;
        }
        let content = payload.json.get("content").unwrap_or(&Value::Null);
        let now = EventTime::from_received_at(&payload.received_at);
        let mut state = self.lock_state();
        if state.baseline.is_none() {
            return RealtimeFriendApplyResult::MissingBaseline;
        }
        apply_friend_event(&mut state, message_type, content, &now)
            .map(Box::new)
            .map(RealtimeFriendApplyResult::Output)
            .unwrap_or(RealtimeFriendApplyResult::Ignored)
    }

    pub fn fire_pending_offline(
        &self,
        user_id: &str,
        token: u64,
        now_iso: String,
    ) -> Option<RealtimeFriendOutput> {
        let mut state = self.lock_state();
        let owner_user_id = state.baseline.as_ref()?.current_user_id.clone();
        let generation = state.baseline.as_ref()?.generation;
        let baseline_revision = state.baseline.as_ref()?.baseline_revision;
        let pending = state.pending_offline.get(user_id)?;
        if pending.token != token {
            return None;
        }
        let pending = state.pending_offline.remove(user_id)?;
        let current = state.baseline.as_ref()?.friends_by_id.get(user_id)?;
        if is_online_state(current) && !bool_field(record_to_value(current).get("pendingOffline")) {
            return None;
        }

        let patch = object_with_pending_offline(pending.patch, false);
        let state_bucket = state_bucket_from_patch(&patch, "offline");
        let previous = pending.previous;
        let mut output = RealtimeFriendOutput {
            owner_user_id,
            projection: FriendProjection {
                generation,
                baseline_revision,
                ..FriendProjection::default()
            },
            ..RealtimeFriendOutput::default()
        };
        apply_patch_to_state(&mut state, &mut output, user_id, patch, &state_bucket);
        let location = string_field(record_to_value(&previous).get("location"));
        output
            .persistence
            .feed_entries
            .push(online_offline_feed_entry(
                "Offline",
                user_id,
                output
                    .projection
                    .patches
                    .last()
                    .map(|patch| &patch.patch)
                    .unwrap_or(&Value::Null),
                &record_to_value(&previous),
                &location,
                duration_ms(&previous, Utc::now().timestamp_millis()),
                &now_iso,
            ));
        output.projection.feed_entries = output.persistence.feed_entries.clone();
        Some(output)
    }

    fn lock_state(&self) -> std::sync::MutexGuard<'_, RealtimeFriendState> {
        self.state.lock().unwrap_or_else(|error| error.into_inner())
    }
}
