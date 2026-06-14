use serde_json::{json, Value};
use vrcx_0_application::OverlayActivityDelivery;

use crate::vr_overlay::{OverlayLocale, OverlayLocalizer};

pub(crate) fn build_delivery_payload(
    delivery: &OverlayActivityDelivery,
    locale: OverlayLocale,
) -> Value {
    let localizer = OverlayLocalizer::new(locale);
    let entry = &delivery.entry;
    let title = localizer.text(&entry.content.title);
    let body = localizer.text(&entry.content.body);
    let text = combine_text(&title, &body);

    json!({
        "sourceId": entry.source_id,
        "activityType": entry.activity_type,
        "desktop": delivery.desktop,
        "vr": delivery.vr,
        "title": title,
        "body": body,
        "text": text,
        "imageUrl": entry.content.image_url,
        "actorUserId": entry.actor_user_id,
    })
}

fn combine_text(title: &str, body: &str) -> String {
    let title = title.trim();
    let body = body.trim();
    match (title.is_empty(), body.is_empty()) {
        (false, false) => format!("{title} {body}"),
        (false, true) => title.to_string(),
        (true, false) => body.to_string(),
        (true, true) => String::new(),
    }
}
