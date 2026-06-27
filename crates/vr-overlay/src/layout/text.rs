use super::measure::TextMeasurer;

const ELLIPSIS: char = '…';
const ELLIPSIS_STR: &str = "…";

pub fn ellipsize_to_width(
    measurer: &mut TextMeasurer,
    text: &str,
    max_width: f32,
    font_size: f32,
) -> String {
    let max_width = max_width.max(1.0);
    if measurer.text_width(text, font_size) <= max_width {
        return text.to_string();
    }

    let ellipsis_width = measurer.text_width(ELLIPSIS_STR, font_size);
    let available = (max_width - ellipsis_width).max(0.0);
    let keep = measurer.prefix_byte_len_within(text, available, font_size);
    match text.get(..keep) {
        Some(prefix) if !prefix.is_empty() => {
            let mut output = prefix.to_string();
            output.push(ELLIPSIS);
            output
        }
        _ => ELLIPSIS.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_stays_empty() {
        let mut measurer = TextMeasurer::new();
        assert_eq!(ellipsize_to_width(&mut measurer, "", 100.0, 14.0), "");
    }

    #[test]
    fn fitting_text_is_returned_verbatim() {
        let mut measurer = TextMeasurer::new();
        assert_eq!(
            ellipsize_to_width(&mut measurer, "Hello", 100_000.0, 14.0),
            "Hello"
        );
    }

    #[test]
    fn truncated_text_ends_with_ellipsis() {
        let mut measurer = TextMeasurer::new();
        let out = ellipsize_to_width(
            &mut measurer,
            "Hello, world, this is a long line",
            30.0,
            14.0,
        );
        assert!(
            out == "…" || out.ends_with('…'),
            "unexpected ellipsize output: {out:?}"
        );
    }

    #[test]
    fn ellipsizing_unusual_unicode_never_panics() {
        let mut measurer = TextMeasurer::new();
        for text in [
            "こんにちは世界の皆さん",
            "🎮👾🕹️🎲🎯",
            "a\u{0301}\u{200d}b",
            "🇯🇵🇺🇸",
        ] {
            let _ = ellipsize_to_width(&mut measurer, text, 24.0, 17.0);
        }
    }
}
