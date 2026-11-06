use std::collections::HashMap;

use rand::Rng;
use rand::distributions::{Alphanumeric, Distribution};
use uuid::Uuid;

const FIRST_NAMES: &[&str] = &[
    "Ada", "Alan", "Grace", "Linus", "Margaret", "Dennis", "Barbara", "James", "Radia", "Ken",
    "Frances", "Guido", "Anita", "Tim", "Shafi",
];

const LAST_NAMES: &[&str] = &[
    "Lovelace",
    "Turing",
    "Hopper",
    "Torvalds",
    "Hamilton",
    "Ritchie",
    "Liskov",
    "Gosling",
    "Perlman",
    "Thompson",
    "Allen",
    "Rossum",
    "Borg",
    "Berners-Lee",
    "Goldwasser",
];

const WORDS: &[&str] = &[
    "aurora", "bamboo", "cobalt", "delta", "ember", "falcon", "garnet", "harbor", "indigo",
    "jasmine", "krypton", "lantern", "meadow", "nimbus", "onyx",
];

/// Resolves `{{variables}}` for a single request.
///
/// Environment variables win over built-ins. Built-ins such as `$timestamp`
/// and `$uuid` are generated once per request. Dynamic `$random*` values are
/// generated on every occurrence unless the expression ends with `.once`,
/// in which case the first generated value is reused for this request.
pub struct TemplateContext {
    vars: HashMap<String, String>,
    builtins: HashMap<String, String>,
    once: HashMap<String, String>,
}

impl TemplateContext {
    pub fn new(vars: &HashMap<String, String>) -> Self {
        let mut builtins = HashMap::new();
        builtins.insert(
            "$timestamp".to_string(),
            chrono::Utc::now().timestamp().to_string(),
        );
        builtins.insert("$isoTimestamp".to_string(), chrono::Utc::now().to_rfc3339());
        builtins.insert("$uuid".to_string(), Uuid::new_v4().to_string());
        Self {
            vars: vars.clone(),
            builtins,
            once: HashMap::new(),
        }
    }

    pub fn resolve(&mut self, input: &str) -> (String, Vec<String>) {
        let mut output = String::with_capacity(input.len());
        let mut missing = Vec::new();
        let mut rest = input;

        while let Some(start) = rest.find("{{") {
            output.push_str(&rest[..start]);
            let after = &rest[start + 2..];
            if let Some(end) = after.find("}}") {
                let raw = after[..end].trim();
                if raw.is_empty() {
                    output.push_str(&rest[start..start + 2 + end + 2]);
                } else {
                    let (name, once) = match raw.strip_suffix(".once") {
                        Some(base) => (base.trim(), true),
                        None => (raw, false),
                    };
                    match self.lookup(name, once) {
                        Some(value) => output.push_str(&value),
                        None => {
                            missing.push(name.to_string());
                            output.push_str(&rest[start..start + 2 + end + 2]);
                        }
                    }
                }
                rest = &after[end + 2..];
            } else {
                output.push_str(&rest[start..]);
                rest = "";
            }
        }
        output.push_str(rest);
        (output, missing)
    }

    fn lookup(&mut self, name: &str, once: bool) -> Option<String> {
        if let Some(value) = self.vars.get(name) {
            return Some(value.clone());
        }
        if let Some(value) = self.builtins.get(name) {
            return Some(value.clone());
        }
        if !name.starts_with("$random") {
            return None;
        }
        if once {
            if let Some(value) = self.once.get(name) {
                return Some(value.clone());
            }
        }
        let value = generate(name)?;
        if once {
            self.once.insert(name.to_string(), value.clone());
        }
        Some(value)
    }
}

fn split_expression(name: &str) -> (String, Option<String>) {
    if let Some(position) = name.find('(') {
        if name.ends_with(')') {
            let base = name[..position].trim().to_string();
            let args = name[position + 1..name.len() - 1].trim().to_string();
            return (base, Some(args));
        }
    }
    (name.to_string(), None)
}

fn int_args(args: Option<&str>, default_min: i64, default_max: i64) -> (i64, i64) {
    let Some(args) = args else {
        return (default_min, default_max);
    };
    let parts: Vec<&str> = args
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    match parts.as_slice() {
        [one] => match one.parse::<i64>() {
            Ok(max) if max >= 0 => (0, max),
            Ok(max) => (max, 0),
            Err(_) => (default_min, default_max),
        },
        [min, max] => match (min.parse::<i64>(), max.parse::<i64>()) {
            (Ok(min), Ok(max)) if min <= max => (min, max),
            (Ok(min), Ok(max)) => (max, min),
            _ => (default_min, default_max),
        },
        _ => (default_min, default_max),
    }
}

fn float_args(args: Option<&str>) -> (f64, f64, usize) {
    let Some(args) = args else {
        return (0.0, 1000.0, 2);
    };
    let parts: Vec<&str> = args
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    let mut min = 0.0;
    let mut max = 1000.0;
    let mut decimals = 2usize;
    if let Some(value) = parts.first().and_then(|value| value.parse::<f64>().ok()) {
        min = value;
    }
    if let Some(value) = parts.get(1).and_then(|value| value.parse::<f64>().ok()) {
        max = value;
    }
    if let Some(value) = parts.get(2).and_then(|value| value.parse::<usize>().ok()) {
        decimals = value.min(6);
    }
    if min > max {
        std::mem::swap(&mut min, &mut max);
    }
    (min, max, decimals)
}

fn alpha_length(args: Option<&str>) -> usize {
    args.and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(8)
        .clamp(1, 128)
}

fn random_name() -> &'static str {
    let mut rng = rand::thread_rng();
    FIRST_NAMES[rng.gen_range(0..FIRST_NAMES.len())]
}

fn random_last_name() -> &'static str {
    let mut rng = rand::thread_rng();
    LAST_NAMES[rng.gen_range(0..LAST_NAMES.len())]
}

fn random_word() -> &'static str {
    let mut rng = rand::thread_rng();
    WORDS[rng.gen_range(0..WORDS.len())]
}

fn generate(name: &str) -> Option<String> {
    let (base, args) = split_expression(name);
    let args = args.as_deref();
    let mut rng = rand::thread_rng();
    match base.as_str() {
        "$randomInt" => {
            let (min, max) = int_args(args, 0, 1000);
            Some(rng.gen_range(min..=max).to_string())
        }
        "$randomFloat" => {
            let (min, max, decimals) = float_args(args);
            let value = rng.gen_range(min..=max);
            Some(format!("{value:.decimals$}"))
        }
        "$randomBoolean" => Some(if rng.gen_bool(0.5) {
            "true".to_string()
        } else {
            "false".to_string()
        }),
        "$randomAlphaNumeric" | "$randomString" => {
            let length = alpha_length(args);
            let value: String = Alphanumeric
                .sample_iter(&mut rng)
                .take(length)
                .map(char::from)
                .collect();
            Some(value)
        }
        "$randomUUID" => Some(Uuid::new_v4().to_string()),
        "$randomEmail" => {
            let first = random_name().to_lowercase();
            let number = rng.gen_range(1..10_000);
            Some(format!("{first}{number}@example.com"))
        }
        "$randomFirstName" => Some(random_name().to_string()),
        "$randomLastName" => Some(random_last_name().to_string()),
        "$randomFullName" => Some(format!("{} {}", random_name(), random_last_name())),
        "$randomPhoneNumber" => {
            let second = rng.gen_range(3..=9);
            let rest: u32 = rng.gen_range(0..1_000_000_000);
            Some(format!("1{second}{rest:09}"))
        }
        "$randomWord" => Some(random_word().to_string()),
        "$randomDate" | "$randomDateRecent" => {
            let days = rng.gen_range(0..365);
            Some(
                (chrono::Utc::now() - chrono::Duration::days(days))
                    .format("%Y-%m-%d")
                    .to_string(),
            )
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_environment_variables() {
        let mut vars = HashMap::new();
        vars.insert("base".to_string(), "https://example.com".to_string());
        let mut context = TemplateContext::new(&vars);
        let (value, missing) = context.resolve("{{base}}/api");
        assert_eq!(value, "https://example.com/api");
        assert!(missing.is_empty());
    }

    #[test]
    fn reports_missing_variables() {
        let mut context = TemplateContext::new(&HashMap::new());
        let (value, missing) = context.resolve("{{nope}}");
        assert_eq!(value, "{{nope}}");
        assert_eq!(missing, vec!["nope".to_string()]);
    }

    #[test]
    fn random_int_respects_range() {
        let mut context = TemplateContext::new(&HashMap::new());
        let (value, missing) = context.resolve("{{$randomInt(5,5)}}");
        assert_eq!(value, "5");
        assert!(missing.is_empty());
    }

    #[test]
    fn random_alpha_numeric_has_requested_length() {
        let mut context = TemplateContext::new(&HashMap::new());
        let (value, missing) = context.resolve("{{$randomAlphaNumeric(12)}}");
        assert_eq!(value.len(), 12);
        assert!(value.chars().all(|ch| ch.is_ascii_alphanumeric()));
        assert!(missing.is_empty());
    }

    #[test]
    fn once_reuses_value_within_request() {
        let mut context = TemplateContext::new(&HashMap::new());
        let (value, missing) =
            context.resolve("{{$randomAlphaNumeric(10).once}}/{{$randomAlphaNumeric(10).once}}");
        let parts: Vec<&str> = value.split('/').collect();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0], parts[1]);
        assert!(missing.is_empty());
    }

    #[test]
    fn random_email_looks_like_email() {
        let mut context = TemplateContext::new(&HashMap::new());
        let (value, missing) = context.resolve("{{$randomEmail}}");
        assert!(value.contains('@'));
        assert!(value.ends_with(".com"));
        assert!(missing.is_empty());
    }

    #[test]
    fn static_uuid_is_stable_within_request() {
        let mut context = TemplateContext::new(&HashMap::new());
        let (value, _) = context.resolve("{{$uuid}}/{{$uuid}}");
        let parts: Vec<&str> = value.split('/').collect();
        assert_eq!(parts[0], parts[1]);
    }
}
