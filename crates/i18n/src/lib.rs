use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    fallback_locale: String,
    locales: BTreeMap<String, BTreeMap<String, String>>,
}

impl Catalog {
    pub fn fallback_locale(&self) -> &str {
        &self.fallback_locale
    }

    pub fn locales(&self) -> &BTreeMap<String, BTreeMap<String, String>> {
        &self.locales
    }

    pub fn localized_text(&self, locale: &str, key: &str) -> Option<&str> {
        self.locales
            .get(locale)
            .and_then(|values| values.get(key))
            .map(String::as_str)
    }

    pub fn resolve_locale(&self, language: &str) -> String {
        resolve_locale(language, self.locales.keys(), self.fallback_locale())
    }

    pub fn text(&self, language: &str, key: &str, fallback: &str) -> String {
        let locale = self.resolve_locale(language);
        self.localized_text(&locale, key)
            .or_else(|| self.localized_text(self.fallback_locale(), key))
            .unwrap_or(fallback)
            .to_string()
    }
}

pub fn parse_catalog(source: &str, label: &str) -> Catalog {
    serde_json::from_str(source)
        .unwrap_or_else(|error| panic!("{label} must be valid JSON: {error}"))
}

pub fn resolve_locale<I, S>(language: &str, available_locales: I, fallback_locale: &str) -> String
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let available = available_locales
        .into_iter()
        .map(|locale| locale.as_ref().to_string())
        .collect::<Vec<_>>();
    let fallback = if fallback_locale.trim().is_empty() {
        "en"
    } else {
        fallback_locale
    };
    let candidate = language.trim().replace('_', "-");
    if candidate.is_empty() {
        return fallback.to_string();
    }
    if let Some(exact) = available.iter().find(|locale| locale.as_str() == candidate) {
        return exact.clone();
    }

    let parts = candidate
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let base_language = parts
        .first()
        .map(|part| part.to_ascii_lowercase())
        .unwrap_or_default();
    if base_language.is_empty() {
        return fallback.to_string();
    }

    if base_language == "zh" {
        let traditional = parts
            .iter()
            .skip(1)
            .map(|part| part.to_ascii_lowercase())
            .any(|part| matches!(part.as_str(), "hant" | "tw" | "hk" | "mo"));
        let target = if traditional { "zh-TW" } else { "zh-CN" };
        return available
            .iter()
            .find(|locale| locale.as_str() == target)
            .cloned()
            .unwrap_or_else(|| fallback.to_string());
    }

    available
        .iter()
        .find(|locale| locale.to_ascii_lowercase() == base_language)
        .cloned()
        .unwrap_or_else(|| fallback.to_string())
}

pub fn interpolate(template: &str, params: &Value) -> String {
    let Some(params) = params.as_object() else {
        return template.to_string();
    };
    let chars = template.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(template.len());
    let mut index = 0;

    while index < chars.len() {
        if chars[index] != '{' {
            output.push(chars[index]);
            index += 1;
            continue;
        }

        let mut end = index + 1;
        while end < chars.len() && chars[end] != '}' {
            end += 1;
        }

        if end >= chars.len() {
            output.push(chars[index]);
            index += 1;
            continue;
        }

        let key = chars[index + 1..end].iter().collect::<String>();
        output.push_str(&param_value(params.get(key.trim())));
        index = end + 1;
    }

    output
}

pub fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn param_value(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.trim().to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Number(value)) => value.to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;
    use serde_json::json;

    use super::*;

    const LANGUAGE_CODES: &[&str] = &[
        "cs", "en", "es", "fr", "hu", "ja", "ko", "pl", "pt", "ru", "th", "vi", "zh-CN", "zh-TW",
    ];

    #[derive(Deserialize)]
    struct LocaleCase {
        input: String,
        expected: String,
    }

    #[test]
    fn normalization_matches_shared_locale_cases() {
        let cases = serde_json::from_str::<Vec<LocaleCase>>(include_str!(
            "../../../src/localization/locale-cases.json"
        ))
        .expect("locale cases");
        let available = LANGUAGE_CODES
            .iter()
            .map(|code| (*code).to_string())
            .collect::<Vec<_>>();

        for locale_case in cases {
            assert_eq!(
                resolve_locale(&locale_case.input, available.iter(), "en"),
                locale_case.expected,
                "{}",
                locale_case.input
            );
        }
    }

    #[test]
    fn catalog_text_uses_locale_then_fallback_then_call_site_fallback() {
        let catalog = parse_catalog(
            r#"{
                "version": 1,
                "fallbackLocale": "en",
                "locales": {
                    "en": { "hello": "Hello", "missingInJa": "Fallback" },
                    "ja": { "hello": "こんにちは" }
                }
            }"#,
            "test catalog",
        );

        assert_eq!(catalog.text("ja", "hello", "Hi"), "こんにちは");
        assert_eq!(catalog.text("ja", "missingInJa", "Hi"), "Fallback");
        assert_eq!(catalog.text("ja", "absent", "Hi"), "Hi");
    }

    #[test]
    fn interpolation_replaces_scalar_params_and_collapses_whitespace() {
        let output = interpolate(
            "{name} has invited you to {location} {message}",
            &json!({ "name": " Ada ", "location": "Test World", "message": "" }),
        );

        assert_eq!(
            collapse_whitespace(&output),
            "Ada has invited you to Test World"
        );
    }
}
