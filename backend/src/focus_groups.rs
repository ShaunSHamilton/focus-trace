//! Compiled matcher for user-defined focus groups. Built once per query from
//! the persisted `FocusGroup` list, then queried per focus session to assign it
//! to the first group (by order) whose any rule matches.

use crate::dto::FocusGroup;
use regex::Regex;

#[derive(Clone, Copy, PartialEq)]
enum Field {
    Exe,
    Title,
    BrowserProfile,
    Url,
}

enum Pred {
    Contains(String), // lowercased needle
    Equals(String),   // lowercased
    Regex(Regex),     // compiled with case-insensitive flag
}

struct Rule {
    field: Field,
    pred: Pred,
}

struct Group {
    id: i64,
    name: String,
    color: String,
    rules: Vec<Rule>,
}

pub struct Matcher {
    groups: Vec<Group>,
}

impl Matcher {
    /// Compile a matcher from persisted groups. Rules with an invalid regex are
    /// skipped rather than failing the whole build.
    pub fn build(groups: &[FocusGroup]) -> Self {
        let mut out = Vec::with_capacity(groups.len());
        for g in groups {
            let mut rules = Vec::with_capacity(g.rules.len());
            for r in &g.rules {
                if r.value.is_empty() {
                    continue;
                }
                let field = match r.field.as_str() {
                    "title" => Field::Title,
                    "browser_profile" => Field::BrowserProfile,
                    "url" => Field::Url,
                    _ => Field::Exe,
                };
                let pred = match r.op.as_str() {
                    "equals" => Pred::Equals(r.value.to_lowercase()),
                    "regex" => match Regex::new(&format!("(?i){}", r.value)) {
                        Ok(re) => Pred::Regex(re),
                        Err(_) => continue,
                    },
                    _ => Pred::Contains(r.value.to_lowercase()),
                };
                rules.push(Rule { field, pred });
            }
            out.push(Group {
                id: g.id,
                name: g.name.clone(),
                color: g.color.clone(),
                rules,
            });
        }
        Self { groups: out }
    }

    /// First group whose any rule matches `(exe, title, browser_profile, url)`. Returns
    /// `(group_id, name, color)`.
    pub fn assign(&self, exe: &str, title: &str, profile: Option<&str>, url: Option<&str>) -> Option<(i64, &str, &str)> {
        let exe_lc = exe.to_lowercase();
        let title_lc = title.to_lowercase();
        let profile_raw = profile.unwrap_or("");
        let profile_lc = profile_raw.to_lowercase();
        let url_raw = url.unwrap_or("");
        let url_lc = url_raw.to_lowercase();

        for g in &self.groups {
            for r in &g.rules {
                let (raw, lc): (&str, &str) = match r.field {
                    Field::Exe => (exe, &exe_lc),
                    Field::Title => (title, &title_lc),
                    Field::BrowserProfile => (profile_raw, &profile_lc),
                    Field::Url => (url_raw, &url_lc),
                };
                let hit = match &r.pred {
                    Pred::Contains(n) => lc.contains(n.as_str()),
                    Pred::Equals(v) => lc == v.as_str(),
                    Pred::Regex(re) => re.is_match(raw),
                };
                if hit {
                    return Some((g.id, &g.name, &g.color));
                }
            }
        }
        None
    }
}
