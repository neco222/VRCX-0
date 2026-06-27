use std::collections::HashMap;

use cosmic_text::{Attrs, Buffer, Metrics, Shaping};

use crate::font::{new_shared_overlay_font_system, SharedOverlayFontSystem};

// Bound on cached shaped lines so scrolling feed text cannot grow memory without
// limit; the working set (device chips + visible feed rows) is far smaller.
const MAX_CACHED_LINES: usize = 512;

struct ShapedLine {
    total_width: f32,
    cluster_ends: Vec<(usize, f32)>,
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct LineKey {
    text: String,
    size_bits: u32,
}

pub struct TextMeasurer {
    font_system: SharedOverlayFontSystem,
    cache: HashMap<LineKey, ShapedLine>,
}

impl TextMeasurer {
    pub fn new() -> Self {
        Self::with_font_system(new_shared_overlay_font_system())
    }

    pub fn with_font_system(font_system: SharedOverlayFontSystem) -> Self {
        Self {
            font_system,
            cache: HashMap::new(),
        }
    }

    pub fn text_width(&mut self, text: &str, font_size: f32) -> f32 {
        self.shaped(text, font_size).total_width
    }

    pub fn prefix_byte_len_within(&mut self, text: &str, max_width: f32, font_size: f32) -> usize {
        let line = self.shaped(text, font_size);
        let mut keep = 0;
        for &(end_byte, cumulative) in &line.cluster_ends {
            if cumulative <= max_width {
                keep = end_byte;
            } else {
                break;
            }
        }
        keep.min(text.len())
    }

    fn shaped(&mut self, text: &str, font_size: f32) -> &ShapedLine {
        let key = LineKey {
            text: text.to_string(),
            size_bits: font_size.to_bits(),
        };
        if !self.cache.contains_key(&key) {
            let line = self.shape(text, font_size);
            if self.cache.len() >= MAX_CACHED_LINES {
                self.cache.clear();
            }
            self.cache.insert(key.clone(), line);
        }
        self.cache.get(&key).expect("line shaped and cached above")
    }

    fn shape(&mut self, text: &str, font_size: f32) -> ShapedLine {
        let Ok(mut font_system) = self.font_system.lock() else {
            return ShapedLine {
                total_width: 0.0,
                cluster_ends: Vec::new(),
            };
        };
        let metrics = Metrics::new(font_size, font_size);
        let mut buffer = Buffer::new(&mut font_system, metrics);
        buffer.set_size(None, Some(font_size));
        buffer.set_text(text, &Attrs::new(), Shaping::Advanced, None);
        buffer.shape_until_scroll(&mut font_system, false);

        let mut total_width = 0.0_f32;
        let mut cluster_ends: Vec<(usize, f32)> = Vec::new();
        for run in buffer.layout_runs() {
            total_width = total_width.max(run.line_w);
            let glyphs = run.glyphs;
            for (index, glyph) in glyphs.iter().enumerate() {
                let cumulative = glyphs
                    .get(index + 1)
                    .map(|next| next.x)
                    .unwrap_or(run.line_w);
                cluster_ends.push((glyph.end, cumulative));
            }
        }
        ShapedLine {
            total_width,
            cluster_ends,
        }
    }
}

impl Default for TextMeasurer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_has_zero_width() {
        let mut measurer = TextMeasurer::new();
        assert_eq!(measurer.text_width("", 14.0), 0.0);
    }

    #[test]
    fn prefix_len_is_char_boundary() {
        let mut measurer = TextMeasurer::new();
        let text = "日本語テスト";
        let keep = measurer.prefix_byte_len_within(text, 20.0, 14.0);
        assert!(
            text.is_char_boundary(keep),
            "keep={keep} not a char boundary"
        );
        assert!(keep <= text.len());
    }

    #[test]
    fn wider_width_allows_longer_or_equal_prefix() {
        let mut measurer = TextMeasurer::new();
        let text = "abcdefghij";
        let narrow = measurer.prefix_byte_len_within(text, 10.0, 14.0);
        let wide = measurer.prefix_byte_len_within(text, 1000.0, 14.0);
        assert!(wide >= narrow);
    }

    #[test]
    fn measuring_unusual_unicode_never_panics() {
        let mut measurer = TextMeasurer::new();
        for text in [
            "こんにちは世界",
            "🎮👾🕹️",
            "a\u{0301}\u{200d}b",
            "🇯🇵🇺🇸",
            "\u{0301}",
            "",
        ] {
            let _ = measurer.text_width(text, 17.0);
            let _ = measurer.prefix_byte_len_within(text, 24.0, 17.0);
        }
    }
}
