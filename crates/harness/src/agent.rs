use std::collections::HashSet;
use std::sync::Arc;

use serde_json::{Map, Value};
use tokio_util::sync::CancellationToken;
use vrcx_0_integrations::llm::{ChatMessage, LlmClient, ToolDefinition};
use vrcx_0_mcp::{InProcessMcpTools, ToolCallOutcome};

use crate::entities::{extract_entities, surfaced_entities, Entity};
use crate::events::AssistantEmitter;
use crate::session::{ActiveTurn, Message, Role, SessionStore, TurnStatus};

const MAX_TOOL_ROUNDS: usize = 6;
const HISTORY_LIMIT: usize = 16;
const SUMMARY_LIMIT: usize = 240;
const TOOL_CONTENT_CHAR_BUDGET: usize = 64_000;
const TOOL_RESULT_ARRAY_LIMIT: usize = 100;
const TOOL_RESULT_STRING_LIMIT: usize = 4_000;
const FINAL_ANSWER_PROMPT: &str = "\
Stop calling tools now and write the final answer using only the tool results already \
in this conversation. If the data is incomplete, say so briefly and answer with the \
best supported facts.";

pub const SYSTEM_PROMPT: &str = "\
You are the VRCX-0 social assistant. Answer questions about the signed-in user's \
VRChat social life using the provided tools, which return observed facts from local \
history and the live session (centered on \"me\").

Rules:
- Call a tool instead of guessing; compose several tools for broad questions.
- Missing data means unobserved, not false. Facts about ME hold even inside private \
instances; facts about a THIRD PARTY are blind in private instances — say so.
- \"Me\" (the signed-in user) is NOT a friend. Never include myself in friend lists, \
counts, or rankings.
- Each tool result carries a `caveats` array; reflect the relevant ones instead of \
presenting figures as exact.
- For most/top/closest/ranked questions, the tools already rank and limit the rows. \
Read the top rows and answer — do NOT keep calling tools to enumerate everyone. \
Mention coverage or truncation when it matters.

Style:
- Stay on VRChat social topics. Be concise and refer to people by name.
- Reply in Markdown. Put any comparative or ranked numbers (activity by weekday or \
hour, top friends, time spent) in a table with a column for the value.
- Never draw charts or bars from block, box, or ASCII characters (▇ █ ▁ ─ ━ etc.); \
they misalign in proportional fonts and render as missing-character boxes.
- Use tasteful emoji to keep the tone warm and friendly.";

pub(crate) struct TurnContext {
    pub tools: Arc<InProcessMcpTools>,
    pub sessions: Arc<SessionStore>,
    pub emitter: AssistantEmitter,
    pub client: LlmClient,
    pub tool_defs: Arc<Vec<ToolDefinition>>,
    pub session_id: String,
    pub turn_id: String,
    pub locale: Option<String>,
    pub cancel: CancellationToken,
}

pub(crate) async fn run_turn(ctx: TurnContext) {
    let mut working = build_context(&ctx);
    let mut collected: Vec<Entity> = Vec::new();
    let mut final_answer = String::new();
    let mut used_tools = false;
    let user_text = latest_user_message(&ctx).unwrap_or_default();
    let mut dispatched_tools = HashSet::new();

    for _round in 0..MAX_TOOL_ROUNDS {
        if ctx.cancel.is_cancelled() {
            return finish_cancelled(&ctx);
        }

        let turn = {
            let emitter = &ctx.emitter;
            let stream = ctx
                .client
                .stream_chat(&working, ctx.tool_defs.as_slice(), |delta| {
                    emitter.delta(delta);
                });
            tokio::pin!(stream);
            tokio::select! {
                result = &mut stream => result,
                _ = ctx.cancel.cancelled() => return finish_cancelled(&ctx),
            }
        };

        let turn = match turn {
            Ok(turn) => turn,
            Err(error) => return finish_error(&ctx, "llm", &error.to_string()),
        };

        if turn.tool_calls.is_empty() {
            final_answer = turn.content;
            break;
        }

        working.push(turn.clone().into_message());
        for call in &turn.tool_calls {
            used_tools = true;
            ctx.emitter
                .tool_call(&call.id, &call.function.name, &call.function.arguments);
            let arguments = normalize_tool_arguments(
                &call.function.name,
                parse_arguments(&call.function.arguments),
                &user_text,
            );
            let signature = tool_call_signature(&call.function.name, arguments.as_ref());
            let resolved = if dispatched_tools.insert(signature) {
                let outcome = ctx
                    .tools
                    .call_tool(call.function.name.clone(), arguments)
                    .await;
                resolve_tool_outcome(outcome)
            } else {
                tracing::warn!(
                    tool = %call.function.name,
                    args = %call.function.arguments,
                    "assistant: skipped duplicate tool call in one turn"
                );
                duplicate_tool_call_result(&call.function.name)
            };
            if !resolved.ok {
                tracing::error!(
                    tool = %call.function.name,
                    args = %call.function.arguments,
                    detail = %resolved.summary,
                    "assistant: tool call failed"
                );
            }
            collected.extend(resolved.entities.iter().cloned());
            ctx.emitter
                .tool_result(&call.id, resolved.ok, &resolved.summary, &resolved.entities);
            working.push(ChatMessage::tool(call.id.clone(), resolved.content));
        }
    }

    if final_answer.trim().is_empty() && used_tools {
        working.push(ChatMessage::user(FINAL_ANSWER_PROMPT));
        let turn = {
            let emitter = &ctx.emitter;
            let stream = ctx.client.stream_chat(&working, &[], |delta| {
                emitter.delta(delta);
            });
            tokio::pin!(stream);
            tokio::select! {
                result = &mut stream => result,
                _ = ctx.cancel.cancelled() => return finish_cancelled(&ctx),
            }
        };
        match turn {
            Ok(turn) => {
                final_answer = turn.content;
            }
            Err(error) => return finish_error(&ctx, "llm", &error.to_string()),
        }
    }

    if !ctx.sessions.is_current_turn(&ctx.session_id, &ctx.turn_id) {
        return;
    }

    if final_answer.trim().is_empty() {
        return finish_error(
            &ctx,
            "no_answer",
            "Stopped after using tools without composing a reply. Try rephrasing or narrowing your question.",
        );
    }

    ctx.sessions
        .push_message(&ctx.session_id, Role::Assistant, final_answer.clone());

    let surfaced = surfaced_entities(dedup_entities(collected), &final_answer);
    if !surfaced.is_empty() {
        ctx.sessions
            .set_surfaced_entities(&ctx.session_id, &surfaced);
        ctx.emitter.turn_entities(&surfaced);
    }

    ctx.sessions.set_active_turn(
        &ctx.session_id,
        Some(ActiveTurn {
            turn_id: ctx.turn_id.clone(),
            status: TurnStatus::Done,
        }),
    );
    ctx.emitter.done();
}

fn build_context(ctx: &TurnContext) -> Vec<ChatMessage> {
    let mut working = vec![ChatMessage::system(SYSTEM_PROMPT)];
    if let Some(locale) = ctx
        .locale
        .as_deref()
        .map(str::trim)
        .filter(|l| !l.is_empty())
    {
        working.push(ChatMessage::system(format!(
            "Write your reply in the language that matches this interface locale code: \
{locale}. Keep proper nouns (names, world titles) as-is."
        )));
    }
    let history = ctx.sessions.history(&ctx.session_id);
    let start = context_window_start(&history);
    for message in &history[start..] {
        match message.role {
            Role::User => working.push(ChatMessage::user(message.content.clone())),
            Role::Assistant => {
                working.push(ChatMessage::assistant(message.content.clone()));
            }
        }
    }
    working
}

fn latest_user_message(ctx: &TurnContext) -> Option<String> {
    ctx.sessions
        .history(&ctx.session_id)
        .into_iter()
        .rev()
        .find(|message| matches!(message.role, Role::User))
        .map(|message| message.content)
}

// Keep the most recent HISTORY_LIMIT messages as a FIFO window, but never start
// it on an assistant turn whose preceding question was evicted.
fn context_window_start(history: &[Message]) -> usize {
    let mut start = history.len().saturating_sub(HISTORY_LIMIT);
    while history
        .get(start)
        .is_some_and(|message| matches!(message.role, Role::Assistant))
    {
        start += 1;
    }
    start
}

fn finish_cancelled(ctx: &TurnContext) {
    if !ctx.sessions.is_current_turn(&ctx.session_id, &ctx.turn_id) {
        return;
    }
    ctx.sessions.set_active_turn(
        &ctx.session_id,
        Some(ActiveTurn {
            turn_id: ctx.turn_id.clone(),
            status: TurnStatus::Cancelled,
        }),
    );
    ctx.emitter.error("cancelled", "Turn cancelled.");
}

fn finish_error(ctx: &TurnContext, code: &str, message: &str) {
    if !ctx.sessions.is_current_turn(&ctx.session_id, &ctx.turn_id) {
        return;
    }
    ctx.sessions.set_active_turn(
        &ctx.session_id,
        Some(ActiveTurn {
            turn_id: ctx.turn_id.clone(),
            status: TurnStatus::Error,
        }),
    );
    ctx.emitter.error(code, message);
}

struct ResolvedTool {
    ok: bool,
    content: String,
    summary: String,
    entities: Vec<Entity>,
}

fn resolve_tool_outcome(outcome: Result<ToolCallOutcome, vrcx_0_mcp::McpError>) -> ResolvedTool {
    match outcome {
        Ok(result) => {
            let entities = result
                .structured
                .as_ref()
                .map(extract_entities)
                .or_else(|| {
                    serde_json::from_str::<Value>(&result.text)
                        .ok()
                        .map(|value| extract_entities(&value))
                })
                .unwrap_or_default();
            let content = tool_content(&result);
            let summary = truncate(if result.text.is_empty() {
                &content
            } else {
                &result.text
            });
            ResolvedTool {
                ok: !result.is_error,
                content,
                summary,
                entities,
            }
        }
        Err(error) => {
            let message = format!("tool error: {error}");
            ResolvedTool {
                ok: false,
                content: message.clone(),
                summary: truncate(&message),
                entities: Vec::new(),
            }
        }
    }
}

fn duplicate_tool_call_result(tool_name: &str) -> ResolvedTool {
    ResolvedTool {
        ok: true,
        content: format!(
            "VRCX-0 skipped a duplicate call to `{tool_name}` with the same arguments in this turn. Use the previous tool result and compose the answer now."
        ),
        summary: "Skipped duplicate tool call; use the previous result.".into(),
        entities: Vec::new(),
    }
}

fn normalize_tool_arguments(
    tool_name: &str,
    arguments: Option<Map<String, Value>>,
    user_text: &str,
) -> Option<Map<String, Value>> {
    let mut arguments = arguments.unwrap_or_default();
    match tool_name {
        "get_copresence_summary" => {
            ensure_limit(&mut arguments, ranked_limit_for_user_text(user_text));
        }
        "get_friend_changes" | "get_invite_history" | "search_worlds_visited" => {
            ensure_limit(&mut arguments, 25);
        }
        "get_friend_log" => {
            ensure_limit(&mut arguments, 100);
        }
        _ => {}
    }
    (!arguments.is_empty()).then_some(arguments)
}

fn ensure_limit(arguments: &mut Map<String, Value>, limit: i64) {
    let has_valid_limit = arguments
        .get("limit")
        .and_then(Value::as_i64)
        .is_some_and(|value| value > 0);
    if !has_valid_limit {
        arguments.insert("limit".into(), Value::from(limit));
    }
}

fn ranked_limit_for_user_text(user_text: &str) -> i64 {
    let normalized = user_text.to_lowercase();
    let asks_single_winner = [
        "一番",
        "いちばん",
        "最も",
        "最多",
        "誰",
        "だれ",
        "who",
        "most",
        "best",
    ]
    .iter()
    .any(|needle| normalized.contains(needle));
    let asks_list = [
        "top ",
        "top",
        "ランキング",
        "rank",
        "list",
        "一覧",
        "人たち",
        "people",
    ]
    .iter()
    .any(|needle| normalized.contains(needle));

    if asks_single_winner && !asks_list {
        3
    } else {
        10
    }
}

fn tool_call_signature(tool_name: &str, arguments: Option<&Map<String, Value>>) -> String {
    let args = arguments
        .map(|arguments| Value::Object(arguments.clone()).to_string())
        .unwrap_or_else(|| "null".into());
    format!("{tool_name}:{args}")
}

fn tool_content(result: &ToolCallOutcome) -> String {
    match result.structured.as_ref() {
        Some(value) if !value.is_null() => budget_json_tool_content(value),
        _ => budget_text_tool_content(&result.text),
    }
}

fn budget_json_tool_content(value: &Value) -> String {
    let raw = value.to_string();
    if within_tool_budget(&raw) {
        return raw;
    }

    let light =
        compact_json_value(value, TOOL_RESULT_ARRAY_LIMIT, TOOL_RESULT_STRING_LIMIT).to_string();
    if within_tool_budget(&light) {
        return light;
    }

    let aggressive = compact_json_value(
        value,
        TOOL_RESULT_ARRAY_LIMIT / 4,
        TOOL_RESULT_STRING_LIMIT / 4,
    )
    .to_string();
    if within_tool_budget(&aggressive) {
        return aggressive;
    }
    budget_text_tool_content(&aggressive)
}

fn budget_text_tool_content(text: &str) -> String {
    if within_tool_budget(text) {
        return text.to_string();
    }
    let keep = TOOL_CONTENT_CHAR_BUDGET.saturating_sub(128);
    let clipped: String = text.chars().take(keep).collect();
    let omitted = text.chars().count().saturating_sub(clipped.chars().count());
    format!("{clipped}\n\n[Tool result truncated by VRCX-0: omitted {omitted} characters.]")
}

fn within_tool_budget(text: &str) -> bool {
    text.chars().count() <= TOOL_CONTENT_CHAR_BUDGET
}

fn compact_json_value(value: &Value, array_limit: usize, string_limit: usize) -> Value {
    match value {
        Value::Array(items) => {
            let mut compacted = items
                .iter()
                .take(array_limit)
                .map(|item| compact_json_value(item, array_limit, string_limit))
                .collect::<Vec<_>>();
            if items.len() > array_limit {
                compacted.push(serde_json::json!({
                    "__truncated": true,
                    "originalCount": items.len(),
                    "omittedCount": items.len() - array_limit,
                }));
            }
            Value::Array(compacted)
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(key, nested)| {
                    (
                        key.clone(),
                        compact_json_value(nested, array_limit, string_limit),
                    )
                })
                .collect(),
        ),
        Value::String(text) if text.chars().count() > string_limit => {
            let clipped: String = text.chars().take(string_limit).collect();
            Value::String(format!(
                "{clipped}… [truncated {} characters]",
                text.chars().count().saturating_sub(clipped.chars().count())
            ))
        }
        _ => value.clone(),
    }
}

fn parse_arguments(raw: &str) -> Option<serde_json::Map<String, Value>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut map = match serde_json::from_str::<serde_json::Map<String, Value>>(trimmed) {
        Ok(map) => map,
        Err(error) => {
            // Distinguish "model sent no args" (empty, handled above) from
            // "model sent malformed JSON we dropped" — the latter usually means
            // a truncated stream or a weak model and is worth surfacing.
            tracing::warn!(args = %trimmed, %error, "assistant: tool arguments were not valid JSON; dispatching with none");
            return None;
        }
    };
    // Models routinely emit explicit `null` for optional parameters. serde's
    // `#[serde(default)]` only covers a missing key, not an explicit null, so
    // drop null-valued keys to let tool defaults apply.
    map.retain(|_, value| !value.is_null());
    Some(map)
}

fn dedup_entities(entities: Vec<Entity>) -> Vec<Entity> {
    let mut seen = std::collections::HashSet::new();
    entities
        .into_iter()
        .filter(|entity| seen.insert(entity.id.clone()))
        .collect()
}

fn truncate(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= SUMMARY_LIMIT {
        return trimmed.to_string();
    }
    let clipped: String = trimmed.chars().take(SUMMARY_LIMIT).collect();
    format!("{clipped}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn turns(pairs: usize) -> Vec<Message> {
        let mut messages = Vec::new();
        for index in 0..pairs {
            for role in [Role::User, Role::Assistant] {
                messages.push(Message {
                    id: format!("m{}", messages.len()),
                    seq: messages.len() as u64,
                    role,
                    content: format!("c{index}"),
                    created_at: String::new(),
                });
            }
        }
        messages
    }

    #[test]
    fn keeps_everything_under_the_limit() {
        let history = turns(4);
        assert_eq!(context_window_start(&history), 0);
    }

    #[test]
    fn slides_in_pairs_and_starts_on_a_user_turn() {
        // 10 pairs = 20 messages; window keeps the most recent 16.
        let history = turns(10);
        let start = context_window_start(&history);
        assert_eq!(history.len() - start, HISTORY_LIMIT);
        assert!(matches!(history[start].role, Role::User));
    }

    #[test]
    fn skips_orphaned_leading_assistant() {
        // 8 pairs + a fresh trailing question = 17 messages; the raw window would
        // open on an assistant (index 1), so it must advance to the next user.
        let mut history = turns(8);
        history.push(Message {
            id: "q".into(),
            seq: history.len() as u64,
            role: Role::User,
            content: "new question".into(),
            created_at: String::new(),
        });
        let start = context_window_start(&history);
        assert_eq!(start, 2);
        assert!(matches!(history[start].role, Role::User));
    }

    #[test]
    fn large_structured_tool_results_are_compacted_for_llm_context() {
        let rows = (0..150)
            .map(|index| {
                serde_json::json!({
                    "userId": format!("usr_{index}"),
                    "displayName": format!("Friend {index}"),
                    "notes": "x".repeat(500),
                })
            })
            .collect::<Vec<_>>();
        let value = serde_json::json!({ "rows": rows, "caveats": ["local data"] });

        let content = budget_json_tool_content(&value);
        let parsed: Value = serde_json::from_str(&content).unwrap();
        let compact_rows = parsed["rows"].as_array().unwrap();
        let marker = compact_rows.last().unwrap();

        assert!(within_tool_budget(&content));
        assert!(compact_rows.len() <= TOOL_RESULT_ARRAY_LIMIT + 1);
        assert_eq!(marker["__truncated"], true);
        assert!(marker["omittedCount"].as_u64().unwrap() >= 50);
        assert!(
            compact_rows[0]["notes"].as_str().unwrap().chars().count()
                <= TOOL_RESULT_STRING_LIMIT + 64
        );
    }

    #[test]
    fn huge_text_tool_results_get_a_truncation_notice() {
        let text = "x".repeat(TOOL_CONTENT_CHAR_BUDGET + 1_000);

        let content = budget_text_tool_content(&text);

        assert!(within_tool_budget(&content));
        assert!(content.contains("Tool result truncated by VRCX-0"));
    }

    #[test]
    fn top_100_compact_aggregate_rows_fit_without_truncation() {
        let rows = (0..100)
            .map(|index| {
                serde_json::json!({
                    "userId": format!("usr_{index:032}"),
                    "displayName": format!("Friend Name {index:03}"),
                    "totalMinutes": 12345,
                    "coDays": 365,
                    "instances": 999,
                    "lastSeenTogether": "2026-06-26T12:34:56Z",
                    "minutesByAccess": {
                        "public": 1111,
                        "friends": 2222,
                        "invite": 3333,
                        "group": 4444,
                    },
                })
            })
            .collect::<Vec<_>>();
        let value = serde_json::json!({
            "rows": rows,
            "caveats": ["Local observer-centered data; private instances are undercounted."],
        });

        let content = budget_json_tool_content(&value);
        let parsed: Value = serde_json::from_str(&content).unwrap();

        assert!(within_tool_budget(&content));
        assert_eq!(parsed["rows"].as_array().unwrap().len(), 100);
        assert!(parsed["rows"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row.get("__truncated").is_none()));
    }

    #[test]
    fn copresence_top_question_gets_floor_limit_when_model_omits_it() {
        let arguments = normalize_tool_arguments(
            "get_copresence_summary",
            Some(serde_json::Map::new()),
            "今までで一番あっている人は誰かな",
        )
        .unwrap();

        assert_eq!(arguments.get("limit").and_then(Value::as_i64), Some(3));
    }

    #[test]
    fn tool_call_signature_includes_normalized_arguments() {
        let first = normalize_tool_arguments("get_copresence_summary", None, "who have I met most")
            .unwrap();
        let second = normalize_tool_arguments(
            "get_copresence_summary",
            Some(serde_json::Map::new()),
            "who have I met most",
        )
        .unwrap();

        assert_eq!(
            tool_call_signature("get_copresence_summary", Some(&first)),
            tool_call_signature("get_copresence_summary", Some(&second))
        );
    }
}
