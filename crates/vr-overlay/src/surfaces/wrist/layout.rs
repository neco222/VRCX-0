use std::cmp::Reverse;

use crate::{
    layout::ellipsize_to_width,
    model::{Color, DeviceChip, DeviceStatus, OverlaySurfaceId, Rect},
    scene::{DrawCommand, OverlayScene, TextStyle},
};

use super::{model::WristSurfaceModel, style};

pub fn build_wrist_scene(model: &WristSurfaceModel) -> OverlayScene {
    let mut scene = OverlayScene::new(OverlaySurfaceId::new("wrist"), model.size);
    let width = model.size.width as f32;
    let height = model.size.height as f32;
    let background = if model.dark_background {
        style::BACKGROUND
    } else {
        style::LIGHT_BACKGROUND
    };
    let panel = if model.dark_background {
        style::PANEL
    } else {
        style::LIGHT_PANEL
    };

    scene.push(DrawCommand::FillRect {
        rect: Rect::new(0.0, 0.0, width, height),
        color: background,
    });
    scene.push(DrawCommand::FillRect {
        rect: Rect::new(0.0, 0.0, width, style::TOP_BAR_HEIGHT),
        color: panel,
    });
    scene.push(DrawCommand::FillRect {
        rect: Rect::new(
            0.0,
            height - style::FOOTER_HEIGHT,
            width,
            style::FOOTER_HEIGHT,
        ),
        color: panel,
    });
    scene.push(DrawCommand::FillRect {
        rect: Rect::new(0.0, style::TOP_BAR_HEIGHT, width, 1.0),
        color: style::DIVIDER,
    });
    scene.push(DrawCommand::FillRect {
        rect: Rect::new(0.0, height - style::FOOTER_HEIGHT, width, 1.0),
        color: style::DIVIDER,
    });

    push_device_bar(&mut scene, model);
    push_feed_rows(&mut scene, model);
    push_footer(&mut scene, model);

    scene
}

fn push_device_bar(scene: &mut OverlayScene, model: &WristSurfaceModel) {
    let mut devices = model.devices.clone();
    devices.sort_by_key(|device| Reverse(device.priority));
    let mut x = style::MARGIN;
    let y = 18.0;
    let mut rendered_count = 0usize;
    for device in devices.iter().take(8) {
        let chip_width = device_chip_width(device, model.show_battery_percent);
        if x + chip_width > model.size.width as f32 - style::MARGIN {
            break;
        }
        let label_width = device_label_width(&device.label);
        scene.push(DrawCommand::Text {
            origin_x: x,
            origin_y: y + 7.0,
            max_width: label_width,
            text: ellipsize_to_width(&device.label, label_width, 15.0),
            style: TextStyle::new(15.0, 19.0, style::TEXT),
        });
        let battery_x = x + label_width + 8.0;
        push_battery_icon(scene, battery_x, y + 10.0, device);
        if model.show_battery_percent {
            if let Some(percent) = device.battery_percent {
                scene.push(DrawCommand::Text {
                    origin_x: battery_x + 42.0,
                    origin_y: y + 8.0,
                    max_width: 42.0,
                    text: format!("{percent}%"),
                    style: TextStyle::new(14.0, 18.0, status_color(device.status)),
                });
            }
        }
        x += chip_width + 10.0;
        rendered_count += 1;
    }
    if model.devices.len() > rendered_count {
        let remaining = format!("+{}", model.devices.len() - rendered_count);
        scene.push(DrawCommand::Text {
            origin_x: x,
            origin_y: y + 7.0,
            max_width: 64.0,
            text: remaining,
            style: TextStyle::new(16.0, 20.0, style::MUTED_TEXT),
        });
    }
}

fn device_label_width(label: &str) -> f32 {
    (label.chars().count() as f32 * 12.0 + 8.0).clamp(28.0, 60.0)
}

fn device_chip_width(device: &DeviceChip, show_percent: bool) -> f32 {
    let percent_width = if show_percent && device.battery_percent.is_some() {
        42.0
    } else {
        0.0
    };
    device_label_width(&device.label) + 8.0 + 36.0 + percent_width
}

fn push_battery_icon(scene: &mut OverlayScene, x: f32, y: f32, device: &DeviceChip) {
    let color = status_color(device.status);
    let body = Rect::new(x, y, 30.0, 16.0);
    scene.push(DrawCommand::StrokeRect {
        rect: body,
        color,
        width: 2.0,
    });
    scene.push(DrawCommand::FillRect {
        rect: Rect::new(x + 31.0, y + 5.0, 4.0, 6.0),
        color,
    });
    let fill_width = 24.0 * battery_fill_ratio(device);
    if fill_width > 0.0 {
        scene.push(DrawCommand::FillRect {
            rect: Rect::new(x + 3.0, y + 3.0, fill_width, 10.0),
            color,
        });
    }
}

fn battery_fill_ratio(device: &DeviceChip) -> f32 {
    if let Some(percent) = device.battery_percent {
        return (percent as f32 / 100.0).clamp(0.0, 1.0);
    }
    match device.status {
        DeviceStatus::Normal | DeviceStatus::Charging => 1.0,
        DeviceStatus::LowBattery => 0.3,
        DeviceStatus::CriticalBattery => 0.15,
        DeviceStatus::TrackingWarning => 0.5,
        DeviceStatus::Disconnected => 0.0,
    }
}

fn push_feed_rows(scene: &mut OverlayScene, model: &WristSurfaceModel) {
    let top = style::TOP_BAR_HEIGHT + 9.0;
    let bottom = model.size.height as f32 - style::FOOTER_HEIGHT - 6.0;
    let max_rows = ((bottom - top) / style::FEED_ROW_HEIGHT).floor().max(0.0) as usize;
    let available_width = model.size.width as f32 - style::MARGIN * 2.0;
    for (index, row) in model.feed_rows.iter().take(max_rows).enumerate() {
        let y = top + index as f32 * style::FEED_ROW_HEIGHT;
        scene.push(DrawCommand::Text {
            origin_x: style::MARGIN,
            origin_y: y + 2.0,
            max_width: 52.0,
            text: row.time_text.clone(),
            style: TextStyle::new(15.0, 19.0, style::MUTED_TEXT),
        });
        scene.push(DrawCommand::Text {
            origin_x: style::MARGIN + 62.0,
            origin_y: y + 2.0,
            max_width: available_width - 62.0,
            text: ellipsize_to_width(&row.detail, available_width - 62.0, 18.0),
            style: TextStyle::new(18.0, 22.0, style::TEXT),
        });
        scene.push(DrawCommand::FillRect {
            rect: Rect::new(
                style::MARGIN,
                y + style::FEED_ROW_HEIGHT - 4.0,
                available_width,
                1.0,
            ),
            color: style::DIVIDER,
        });
    }
}

fn push_footer(scene: &mut OverlayScene, model: &WristSurfaceModel) {
    let y = model.size.height as f32 - style::FOOTER_HEIGHT + 12.0;
    let width = model.size.width as f32;
    scene.push(DrawCommand::Text {
        origin_x: style::MARGIN,
        origin_y: y,
        max_width: 128.0,
        text: model.footer.left.clone(),
        style: TextStyle::new(15.0, 19.0, style::MUTED_TEXT),
    });
    scene.push(DrawCommand::Text {
        origin_x: width * 0.5 - 90.0,
        origin_y: y,
        max_width: 180.0,
        text: model.footer.center.clone(),
        style: TextStyle::new(15.0, 19.0, style::MUTED_TEXT),
    });
    scene.push(DrawCommand::Text {
        origin_x: width - style::MARGIN - 80.0,
        origin_y: y,
        max_width: 80.0,
        text: model.footer.right.clone(),
        style: TextStyle::new(15.0, 19.0, style::MUTED_TEXT),
    });
}

fn status_color(status: DeviceStatus) -> Color {
    match status {
        DeviceStatus::Normal | DeviceStatus::Charging => style::NORMAL,
        DeviceStatus::LowBattery => style::LOW,
        DeviceStatus::CriticalBattery | DeviceStatus::Disconnected => style::CRITICAL,
        DeviceStatus::TrackingWarning => style::WARNING,
    }
}
