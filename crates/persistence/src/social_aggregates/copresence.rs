use std::collections::BTreeMap;

use crate::common::{row_i64, row_string, ParamsBuilder};
use crate::database::DatabaseService;
use crate::realtime::normalize_user_table_prefix;
use crate::Error;

use super::caveats::copresence_caveats;
use super::helpers::{
    append_time_window_filter, clamped_optional_limit, millis_to_minutes, normalize_access_bucket,
    table_exists,
};
use super::types::{
    CopresenceGroupBy, CopresenceSummaryInput, CopresenceSummaryOutput, CopresenceSummaryRow,
};

pub fn get_copresence_summary(
    db: &DatabaseService,
    input: CopresenceSummaryInput,
) -> Result<CopresenceSummaryOutput, Error> {
    let limit = clamped_optional_limit(input.limit, 25, 100);
    let min_millis = input.min_minutes.unwrap_or(0).max(0).saturating_mul(60_000);
    let world_id_expr = match input.group_by {
        CopresenceGroupBy::Friend => "''",
        CopresenceGroupBy::FriendWorld => {
            "CASE
                WHEN substr(g.location, 1, 5) = 'wrld_' AND instr(g.location, ':') > 0
                    THEN substr(g.location, 1, instr(g.location, ':') - 1)
                WHEN substr(g.location, 1, 5) = 'wrld_' AND instr(g.location, ':') = 0
                    THEN g.location
                ELSE ''
             END"
        }
    };
    let mut sql = String::from(
        "WITH base AS (
            SELECT
                COALESCE(g.user_id, '') AS user_id,
                COALESCE(g.display_name, '') AS display_name,
                ",
    );
    sql.push_str(world_id_expr);
    sql.push_str(
        " AS world_id,
                COALESCE(g.location, '') AS location,
                g.time,
                COALESCE(g.created_at, '') AS created_at,
                CASE
                    WHEN g.location LIKE '%~private(%' AND g.location LIKE '%~canRequestInvite%' THEN 'invitePlus'
                    WHEN g.location LIKE '%~private(%' THEN 'invite'
                    WHEN g.location LIKE '%~friends(%' THEN 'friends'
                    WHEN g.location LIKE '%~hidden(%' THEN 'friendsPlus'
                    WHEN g.location LIKE '%~group(%' THEN 'group'
                    WHEN substr(g.location, 1, 5) = 'wrld_' AND instr(g.location, ':') > 0 THEN 'public'
                    ELSE 'unknown'
                END AS access_bucket
            FROM gamelog_join_leave g
            WHERE g.type = 'OnPlayerLeft' AND g.time > 0",
    );
    let mut params = ParamsBuilder::new();
    append_time_window_filter(&mut sql, &mut params, &input.time_window, "g.created_at");

    if input.friends_only {
        if let Some(owner_user_id) = input
            .owner_user_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let user_prefix = normalize_user_table_prefix(owner_user_id)?;
            let table_name = format!("{user_prefix}_friend_log_current");
            if table_exists(db, &table_name)? {
                sql.push_str(&format!(
                    " AND EXISTS (SELECT 1 FROM {table_name} f WHERE f.user_id = g.user_id)"
                ));
            } else {
                return Ok(CopresenceSummaryOutput {
                    rows: Vec::new(),
                    total_rows: 0,
                    returned_rows: 0,
                    truncated: false,
                    caveats: copresence_caveats(),
                });
            }
        }
    }
    sql.push_str(
        ")
        , grouped AS (
            SELECT
                user_id,
                display_name,
                world_id,
                SUM(time) AS total_millis,
                COUNT(DISTINCT CASE WHEN created_at <> '' THEN substr(created_at, 1, 10) END) AS co_days,
                COUNT(DISTINCT CASE WHEN location <> '' THEN location END) AS instances,
                MAX(created_at) AS last_seen_together
            FROM base
            WHERE NOT (trim(user_id) = '' AND trim(display_name) = '')
            GROUP BY user_id, display_name, world_id
            HAVING SUM(time) >= @min_millis
        )
        , ranked AS (
            SELECT
                user_id,
                display_name,
                world_id,
                total_millis,
                co_days,
                instances,
                last_seen_together,
                COUNT(*) OVER () AS total_rows
            FROM grouped
            ORDER BY total_millis DESC, display_name ASC, user_id ASC
            LIMIT @limit
        )
        , access AS (
            SELECT
                user_id,
                display_name,
                world_id,
                access_bucket,
                SUM(time) AS access_millis
            FROM base
            WHERE NOT (trim(user_id) = '' AND trim(display_name) = '')
            GROUP BY user_id, display_name, world_id, access_bucket
        )
        SELECT
            ranked.user_id,
            ranked.display_name,
            ranked.world_id,
            ranked.total_millis,
            ranked.co_days,
            ranked.instances,
            ranked.last_seen_together,
            ranked.total_rows,
            access.access_bucket,
            access.access_millis
        FROM ranked
        LEFT JOIN access
            ON access.user_id = ranked.user_id
            AND access.display_name = ranked.display_name
            AND access.world_id = ranked.world_id
        ORDER BY ranked.total_millis DESC, ranked.display_name ASC, ranked.user_id ASC, ranked.world_id ASC, access.access_bucket ASC",
    );
    params = params.set("min_millis", min_millis).set("limit", limit);

    let mut rows = Vec::new();
    let mut current_key: Option<CopresenceKey> = None;
    let mut current_row: Option<CopresenceSummaryRow> = None;
    let mut total_rows = 0usize;
    for row in db.execute(&sql, &params.build())? {
        let user_id = row_string(&row, 0);
        let display_name = row_string(&row, 1);
        let world_id = row_string(&row, 2);
        let key = CopresenceKey {
            user_id: user_id.clone(),
            display_name: display_name.clone(),
            world_id: (!world_id.is_empty()).then_some(world_id.clone()),
        };

        if current_key.as_ref() != Some(&key) {
            if let Some(row) = current_row.take() {
                rows.push(row);
            }
            current_key = Some(key.clone());
            current_row = Some(CopresenceSummaryRow {
                user_id: key.user_id,
                display_name: key.display_name,
                world_id: key.world_id,
                world_name: None,
                total_minutes: millis_to_minutes(row_i64(&row, 3)),
                co_days: usize::try_from(row_i64(&row, 4).max(0)).unwrap_or(0),
                instances: usize::try_from(row_i64(&row, 5).max(0)).unwrap_or(0),
                last_seen_together: row_string(&row, 6),
                minutes_by_access: BTreeMap::new(),
            });
        }
        if total_rows == 0 {
            total_rows = usize::try_from(row_i64(&row, 7).max(0)).unwrap_or(0);
        }
        let access = normalize_access_bucket(&row_string(&row, 8));
        let access_minutes = millis_to_minutes(row_i64(&row, 9).max(0));
        if access_minutes > 0 {
            if let Some(current_row) = current_row.as_mut() {
                current_row.minutes_by_access.insert(access, access_minutes);
            }
        }
    }
    if let Some(row) = current_row {
        rows.push(row);
    }
    let returned_rows = rows.len();

    Ok(CopresenceSummaryOutput {
        rows,
        total_rows,
        returned_rows,
        truncated: returned_rows < total_rows,
        caveats: copresence_caveats(),
    })
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct CopresenceKey {
    user_id: String,
    display_name: String,
    world_id: Option<String>,
}
