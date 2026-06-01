pub mod layout;
pub mod model;
pub mod render;
pub mod scene;
pub mod surfaces;

pub use model::{
    Color, DeviceChip, DeviceStatus, FeedKind, FeedLine, FeedSeverity, OverlayFooter, OverlaySize,
    OverlaySurfaceId, Rect, RgbaFrame,
};
pub use render::{OverlayRenderError, OverlayRenderer, TinySkiaRenderer};
pub use scene::{DrawCommand, HitRegion, OverlayScene, TextStyle};
pub use surfaces::wrist::{build_wrist_scene, WristSurfaceModel};
