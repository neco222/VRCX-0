use vrcx_0_vr_overlay::{
    build_wrist_scene, Color, DeviceChip, DeviceStatus, FeedKind, FeedLine, FeedSeverity,
    OverlayFooter, OverlayRenderer, OverlaySize, OverlaySurfaceId, TinySkiaRenderer,
    WristSurfaceModel,
};

#[test]
fn wrist_surface_builds_scene_with_future_hit_region_boundary() {
    let model = sample_wrist_model();

    let scene = build_wrist_scene(&model);

    assert_eq!(scene.surface_id, OverlaySurfaceId::new("wrist"));
    assert_eq!(scene.size, OverlaySize::new(512, 512));
    assert!(
        scene.commands.len() >= 12,
        "wrist scene should contain background, device chips, feed rows, and footer commands"
    );
    assert!(
        scene.hit_regions.is_empty(),
        "first wrist proof is read-only but must keep the interaction boundary explicit"
    );
}

#[test]
fn tiny_skia_renderer_outputs_non_empty_rgba_frame() {
    let scene = build_wrist_scene(&sample_wrist_model());
    let mut renderer = TinySkiaRenderer::new();

    let frame = renderer.render(&scene).expect("render wrist scene");

    assert_eq!(frame.size, OverlaySize::new(512, 512));
    assert_eq!(frame.data.len(), 512 * 512 * 4);
    assert!(
        frame
            .data
            .chunks_exact(4)
            .any(|pixel| pixel[3] > 0 && (pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0)),
        "rendered frame should contain visible non-transparent pixels"
    );
}

fn sample_wrist_model() -> WristSurfaceModel {
    WristSurfaceModel {
        size: OverlaySize::new(512, 512),
        dark_background: true,
        show_battery_percent: true,
        devices: vec![
            DeviceChip {
                label: "HMD".to_string(),
                status: DeviceStatus::Normal,
                battery_percent: Some(82),
                text: "82".to_string(),
                priority: 10,
            },
            DeviceChip {
                label: "L".to_string(),
                status: DeviceStatus::LowBattery,
                battery_percent: Some(18),
                text: "18 low".to_string(),
                priority: 20,
            },
            DeviceChip {
                label: "T4".to_string(),
                status: DeviceStatus::TrackingWarning,
                battery_percent: Some(44),
                text: "warn".to_string(),
                priority: 30,
            },
        ],
        feed_rows: vec![
            FeedLine {
                time_text: "16:31".to_string(),
                kind: FeedKind::Invite,
                detail: "Ada invited you to 测试世界".to_string(),
                severity: FeedSeverity::Important,
            },
            FeedLine {
                time_text: "16:30".to_string(),
                kind: FeedKind::Friend,
                detail: "Mika joined current instance".to_string(),
                severity: FeedSeverity::Normal,
            },
            FeedLine {
                time_text: "16:28".to_string(),
                kind: FeedKind::System,
                detail: "Instance queue ready".to_string(),
                severity: FeedSeverity::Normal,
            },
        ],
        footer: OverlayFooter {
            left: "8 players".to_string(),
            center: "Instance 12m".to_string(),
            right: "12:34".to_string(),
        },
        accent: Color::rgba(94, 234, 212, 255),
        captured_at_ms: 1_717_200_000_000,
    }
}
