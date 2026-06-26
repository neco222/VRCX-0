use std::collections::{BTreeMap, BTreeSet};

use crate::database::DatabaseService;
use crate::friends::friend_log_current_list;
use crate::mutual_graph::mutual_graph_snapshot_get;
use crate::Error;

use super::caveats::social_graph_caveats;
use super::types::{SocialGraphEdge, SocialGraphInput, SocialGraphNode, SocialGraphOutput};

const DEFAULT_MAX_NODES: usize = 100;
const MAX_MAX_NODES: usize = 250;
const DEFAULT_MAX_EDGES: usize = 500;
const MAX_MAX_EDGES: usize = 1_000;

pub fn get_social_graph(
    db: &DatabaseService,
    input: SocialGraphInput,
) -> Result<SocialGraphOutput, Error> {
    let owner_user_id = input.owner_user_id;
    let snapshot = mutual_graph_snapshot_get(db, owner_user_id.clone())?;
    let display_name_by_user_id = friend_log_current_list(db, owner_user_id)?
        .into_iter()
        .filter(|friend| !friend.display_name.trim().is_empty())
        .map(|friend| (friend.user_id, friend.display_name))
        .collect::<BTreeMap<_, _>>();
    let mut fetched_friends = 0usize;
    let mut opted_out_friends = 0usize;
    let mut newest_fetched_at: Option<String> = None;
    let mut oldest_fetched_at: Option<String> = None;
    for meta in &snapshot.meta {
        if meta.opted_out {
            opted_out_friends += 1;
            continue;
        }
        if meta.last_fetched_at.trim().is_empty() {
            continue;
        }
        fetched_friends += 1;
        newest_fetched_at = Some(match newest_fetched_at {
            Some(current) => current.max(meta.last_fetched_at.clone()),
            None => meta.last_fetched_at.clone(),
        });
        oldest_fetched_at = Some(match oldest_fetched_at {
            Some(current) => current.min(meta.last_fetched_at.clone()),
            None => meta.last_fetched_at.clone(),
        });
    }
    let focus = input
        .user_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let max_nodes = clamped_limit(input.max_nodes, DEFAULT_MAX_NODES, MAX_MAX_NODES);
    let max_edges = clamped_limit(input.max_edges, DEFAULT_MAX_EDGES, MAX_MAX_EDGES);
    let mut degree_by_user_id: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut edges = Vec::new();

    for friend_id in snapshot.friend_ids {
        if focus
            .as_ref()
            .is_some_and(|focus| input.depth == 0 && focus != &friend_id)
        {
            continue;
        }
        degree_by_user_id.entry(friend_id).or_default();
    }

    for link in snapshot.links {
        if let Some(focus) = &focus {
            if input.depth <= 1 && link.friend_id != *focus && link.mutual_id != *focus {
                continue;
            }
        }
        degree_by_user_id
            .entry(link.friend_id.clone())
            .or_default()
            .insert(link.mutual_id.clone());
        degree_by_user_id
            .entry(link.mutual_id.clone())
            .or_default()
            .insert(link.friend_id.clone());
        edges.push(SocialGraphEdge {
            source_user_id: link.friend_id,
            target_user_id: link.mutual_id,
        });
    }

    let total_nodes = degree_by_user_id.len();
    let total_edges = edges.len();
    let mut nodes = degree_by_user_id
        .into_iter()
        .map(|(user_id, connections)| SocialGraphNode {
            display_name: display_name_by_user_id
                .get(&user_id)
                .cloned()
                .unwrap_or_default(),
            user_id,
            connection_degree: connections.len(),
        })
        .collect::<Vec<_>>();
    nodes.sort_by(|left, right| {
        right
            .connection_degree
            .cmp(&left.connection_degree)
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.user_id.cmp(&right.user_id))
    });
    if let Some(focus) = &focus {
        if let Some(index) = nodes.iter().position(|node| node.user_id == *focus) {
            let focus_node = nodes.remove(index);
            nodes.insert(0, focus_node);
        }
    }
    nodes.truncate(max_nodes);

    let retained_user_ids = nodes
        .iter()
        .map(|node| node.user_id.clone())
        .collect::<BTreeSet<_>>();
    let edges = edges
        .into_iter()
        .filter(|edge| {
            retained_user_ids.contains(&edge.source_user_id)
                && retained_user_ids.contains(&edge.target_user_id)
        })
        .take(max_edges)
        .collect::<Vec<_>>();

    Ok(SocialGraphOutput {
        truncated: nodes.len() < total_nodes || edges.len() < total_edges,
        nodes,
        edges,
        total_nodes,
        total_edges,
        fetched_friends,
        opted_out_friends,
        newest_fetched_at,
        oldest_fetched_at,
        caveats: social_graph_caveats(),
    })
}

fn clamped_limit(limit: Option<i64>, default: usize, max: usize) -> usize {
    limit
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(default)
        .clamp(1, max)
}
