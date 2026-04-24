use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

use aftereffects_aep_parser_rs::{AepError, Item, ItemType, Project, open_project};
use glob::glob;
use serde::Serialize;
use walkdir::WalkDir;

pub const TOOL_NAME: &str = "check24fps";
pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutStyle {
    Default,
    Json,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    pub expected_frame_rate: f64,
    pub tolerance: f64,
    pub fail_fast: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OverallStatus {
    Passed,
    Failed,
    Errored,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Passed,
    Failed,
    Errored,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CompositionStatus {
    Passed,
    Failed,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    NotFound,
    UnsupportedFormat,
    ParseError,
    IoError,
    InternalError,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotFound => "not_found",
            Self::UnsupportedFormat => "unsupported_format",
            Self::ParseError => "parse_error",
            Self::IoError => "io_error",
            Self::InternalError => "internal_error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ToolInfo {
    pub name: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportConfig {
    pub expected_frame_rate: f64,
    pub tolerance: f64,
    pub fail_fast: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Summary {
    pub status: OverallStatus,
    pub files: FileSummary,
    pub compositions: CompositionSummary,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct FileSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub errored: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct CompositionSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub unknown: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Report {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub tool: ToolInfo,
    pub config: ReportConfig,
    pub summary: Summary,
    pub files: Vec<FileResult>,
}

impl Report {
    pub fn exit_code(&self) -> u8 {
        match self.summary.status {
            OverallStatus::Passed => 0,
            OverallStatus::Failed => 1,
            OverallStatus::Errored => 2,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileResult {
    pub path: String,
    pub status: FileStatus,
    pub format: String,
    pub compositions: Vec<CompositionResult>,
    pub errors: Vec<ToolError>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompositionResult {
    pub index: usize,
    pub name: String,
    pub status: CompositionStatus,
    pub frame_rate: Option<f64>,
    pub expected_frame_rate: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ToolError {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Target {
    path: PathBuf,
    display_path: String,
}

pub fn run(inputs: &[String], config: &Config) -> Report {
    let mut files = Vec::new();

    'inputs: for input in inputs {
        for result in resolve_input(input) {
            let file = match result {
                Ok(target) => check_file(&target, config),
                Err(file) => file,
            };

            let should_stop = config.fail_fast && should_fail_fast(&file);
            files.push(file);

            if should_stop {
                break 'inputs;
            }
        }
    }

    let summary = summarize(&files);

    Report {
        schema_version: SCHEMA_VERSION,
        tool: ToolInfo {
            name: TOOL_NAME,
            version: env!("CARGO_PKG_VERSION"),
        },
        config: ReportConfig {
            expected_frame_rate: config.expected_frame_rate,
            tolerance: config.tolerance,
            fail_fast: config.fail_fast,
        },
        summary,
        files,
    }
}

pub fn is_matching_frame_rate(actual: f64, expected: f64, tolerance: f64) -> bool {
    (actual - expected).abs() <= tolerance
}

pub fn render_default(report: &Report, quiet: bool, color_enabled: bool) -> String {
    let mut lines = Vec::new();

    for file in &report.files {
        match file.status {
            FileStatus::Passed if quiet => {}
            FileStatus::Passed => {
                lines.push(format!(
                    "{} {}",
                    marker("✔", Color::Green, color_enabled),
                    file.path
                ));
            }
            FileStatus::Failed => {
                lines.push(format!(
                    "{} {}",
                    marker("✕", Color::Red, color_enabled),
                    file.path
                ));
                push_composition_lines(&mut lines, file, quiet, color_enabled);
            }
            FileStatus::Errored => {
                lines.push(format!(
                    "{} {}",
                    marker("✕", Color::Red, color_enabled),
                    file.path
                ));
                push_error_lines(&mut lines, file, color_enabled);
            }
            FileStatus::Skipped => {}
        }
    }

    if !lines.is_empty() {
        lines.push(String::new());
    }

    lines.push(summary_line(report));

    if report.summary.compositions.failed > 0 {
        lines.push(format!(
            "Expected frame rate: {}fps",
            format_fps(report.config.expected_frame_rate)
        ));
    }

    let mut output = lines.join("\n");
    output.push('\n');
    output
}

fn resolve_input(input: &str) -> Vec<Result<Target, FileResult>> {
    let path = Path::new(input);

    if path.is_file() {
        return vec![Ok(Target {
            path: path.to_path_buf(),
            display_path: input.to_string(),
        })];
    }

    if path.is_dir() {
        return resolve_directory(path);
    }

    if contains_glob_meta(input) {
        return resolve_glob(input);
    }

    vec![Err(error_file(
        input,
        "unknown",
        ErrorCode::NotFound,
        "input was not found",
    ))]
}

fn resolve_directory(path: &Path) -> Vec<Result<Target, FileResult>> {
    let mut targets = Vec::new();
    let mut errors = Vec::new();

    for entry in WalkDir::new(path) {
        match entry {
            Ok(entry) => {
                if entry.file_type().is_file() && is_aep_path(entry.path()) {
                    targets.push(Target {
                        path: entry.path().to_path_buf(),
                        display_path: entry.path().display().to_string(),
                    });
                }
            }
            Err(err) => {
                let display_path = err
                    .path()
                    .map(Path::display)
                    .map(|display| display.to_string())
                    .unwrap_or_else(|| path.display().to_string());
                errors.push(error_file(
                    &display_path,
                    "unknown",
                    ErrorCode::IoError,
                    &err.to_string(),
                ));
            }
        }
    }

    targets.sort_by(|left, right| left.display_path.cmp(&right.display_path));

    targets
        .into_iter()
        .map(Ok)
        .chain(errors.into_iter().map(Err))
        .collect()
}

fn resolve_glob(pattern: &str) -> Vec<Result<Target, FileResult>> {
    let entries = match glob(pattern) {
        Ok(entries) => entries,
        Err(err) => {
            return vec![Err(error_file(
                pattern,
                "unknown",
                ErrorCode::InternalError,
                &err.to_string(),
            ))];
        }
    };

    let mut targets = Vec::new();
    let mut errors = Vec::new();

    for entry in entries {
        match entry {
            Ok(path) => {
                if path.is_file() && is_aep_path(&path) {
                    targets.push(Target {
                        display_path: path.display().to_string(),
                        path,
                    });
                }
            }
            Err(err) => {
                let display_path = err.path().display().to_string();
                errors.push(error_file(
                    &display_path,
                    "unknown",
                    ErrorCode::IoError,
                    &err.to_string(),
                ));
            }
        }
    }

    targets.sort_by(|left, right| left.display_path.cmp(&right.display_path));

    if targets.is_empty() && errors.is_empty() {
        return vec![Err(error_file(
            pattern,
            "unknown",
            ErrorCode::NotFound,
            "glob matched no .aep files",
        ))];
    }

    targets
        .into_iter()
        .map(Ok)
        .chain(errors.into_iter().map(Err))
        .collect()
}

fn check_file(target: &Target, config: &Config) -> FileResult {
    if !is_aep_path(&target.path) {
        return error_file(
            &target.display_path,
            format_for_path(&target.path),
            ErrorCode::UnsupportedFormat,
            "only .aep files are supported",
        );
    }

    match open_project(&target.path) {
        Ok(project) => project_file(&target.display_path, &project, config),
        Err(err) => {
            let code = match err {
                AepError::Io(_) => ErrorCode::IoError,
                _ => ErrorCode::ParseError,
            };
            error_file(&target.display_path, "aep", code, &err.to_string())
        }
    }
}

fn project_file(path: &str, project: &Project, config: &Config) -> FileResult {
    let mut compositions = Vec::new();
    collect_compositions(&project.root_folder, &mut compositions, config);

    let status = if compositions
        .iter()
        .any(|composition| composition.status == CompositionStatus::Failed)
    {
        FileStatus::Failed
    } else {
        FileStatus::Passed
    };

    FileResult {
        path: path.to_string(),
        status,
        format: "aep".to_string(),
        compositions,
        errors: Vec::new(),
    }
}

fn collect_compositions(item: &Item, results: &mut Vec<CompositionResult>, config: &Config) {
    if item.item_type == ItemType::Composition {
        let frame_rate = item.footage_framerate;
        let status =
            if is_matching_frame_rate(frame_rate, config.expected_frame_rate, config.tolerance) {
                CompositionStatus::Passed
            } else {
                CompositionStatus::Failed
            };

        results.push(CompositionResult {
            index: results.len(),
            name: item.name.clone(),
            status,
            frame_rate: Some(frame_rate),
            expected_frame_rate: config.expected_frame_rate,
        });
    }

    for child in &item.folder_contents {
        collect_compositions(child, results, config);
    }
}

fn summarize(files: &[FileResult]) -> Summary {
    let mut file_summary = FileSummary::default();
    let mut composition_summary = CompositionSummary::default();

    for file in files {
        file_summary.total += 1;
        match file.status {
            FileStatus::Passed => file_summary.passed += 1,
            FileStatus::Failed => file_summary.failed += 1,
            FileStatus::Errored => file_summary.errored += 1,
            FileStatus::Skipped => {}
        }

        for composition in &file.compositions {
            composition_summary.total += 1;
            match composition.status {
                CompositionStatus::Passed => composition_summary.passed += 1,
                CompositionStatus::Failed => composition_summary.failed += 1,
                CompositionStatus::Unknown => composition_summary.unknown += 1,
            }
        }
    }

    let status = if file_summary.errored > 0 {
        OverallStatus::Errored
    } else if file_summary.failed > 0 {
        OverallStatus::Failed
    } else {
        OverallStatus::Passed
    };

    Summary {
        status,
        files: file_summary,
        compositions: composition_summary,
    }
}

fn should_fail_fast(file: &FileResult) -> bool {
    matches!(file.status, FileStatus::Failed | FileStatus::Errored)
}

fn error_file(path: &str, format: &str, code: ErrorCode, message: &str) -> FileResult {
    FileResult {
        path: path.to_string(),
        status: FileStatus::Errored,
        format: format.to_string(),
        compositions: Vec::new(),
        errors: vec![ToolError {
            code,
            message: message.to_string(),
        }],
    }
}

fn push_composition_lines(
    lines: &mut Vec<String>,
    file: &FileResult,
    quiet: bool,
    color_enabled: bool,
) {
    let visible: Vec<_> = file
        .compositions
        .iter()
        .filter(|composition| !(quiet && composition.status == CompositionStatus::Passed))
        .collect();

    for (position, composition) in visible.iter().enumerate() {
        let branch = if position + 1 == visible.len() {
            "└"
        } else {
            "├"
        };
        let sign = match composition.status {
            CompositionStatus::Passed => marker("✔", Color::Green, color_enabled),
            CompositionStatus::Failed => marker("✕", Color::Red, color_enabled),
            CompositionStatus::Unknown => marker("!", Color::Yellow, color_enabled),
        };
        let frame_rate = composition
            .frame_rate
            .map(format_fps)
            .unwrap_or_else(|| "unknown".to_string());
        lines.push(format!(
            "  {branch} {sign} {}  {frame_rate}fps",
            composition.name
        ));
    }
}

fn push_error_lines(lines: &mut Vec<String>, file: &FileResult, color_enabled: bool) {
    for (position, error) in file.errors.iter().enumerate() {
        let branch = if position + 1 == file.errors.len() {
            "└"
        } else {
            "├"
        };
        lines.push(format!(
            "  {branch} {} {}: {}",
            marker("!", Color::Yellow, color_enabled),
            error.code.as_str(),
            error.message
        ));
    }
}

fn summary_line(report: &Report) -> String {
    let checked = if report.summary.compositions.total > 0 {
        format!(
            "Checked {}, {}.",
            plural(report.summary.files.total, "file"),
            plural(report.summary.compositions.total, "comp")
        )
    } else {
        format!("Checked {}.", plural(report.summary.files.total, "file"))
    };

    let failed = report.summary.files.failed > 0;
    let errored = report.summary.files.errored > 0;

    match (failed, errored) {
        (false, false) => format!("{checked} All OK."),
        (true, false) => format!(
            "{checked} Failed: {}, {}.",
            plural(report.summary.files.failed, "file"),
            plural(report.summary.compositions.failed, "comp")
        ),
        (false, true) => format!(
            "{checked} Errors: {}.",
            plural(report.summary.files.errored, "file")
        ),
        (true, true) => format!(
            "{checked} Errors: {}. Failed: {}, {}.",
            plural(report.summary.files.errored, "file"),
            plural(report.summary.files.failed, "file"),
            plural(report.summary.compositions.failed, "comp")
        ),
    }
}

fn plural(count: usize, singular: &str) -> String {
    if count == 1 {
        format!("{count} {singular}")
    } else {
        format!("{count} {singular}s")
    }
}

fn format_fps(value: f64) -> String {
    let formatted = format!("{value:.6}");
    formatted
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

fn contains_glob_meta(input: &str) -> bool {
    input
        .chars()
        .any(|character| matches!(character, '*' | '?' | '[' | ']' | '{' | '}'))
}

fn is_aep_path(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("aep"))
}

fn format_for_path(path: &Path) -> &'static str {
    if is_aep_path(path) { "aep" } else { "unknown" }
}

#[derive(Debug, Clone, Copy)]
enum Color {
    Green,
    Red,
    Yellow,
}

fn marker(text: &'static str, color: Color, color_enabled: bool) -> String {
    if !color_enabled {
        return text.to_string();
    }

    let code = match color {
        Color::Green => "32",
        Color::Red => "31",
        Color::Yellow => "33",
    };

    format!("\x1b[{code}m{text}\x1b[0m")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_config() -> Config {
        Config {
            expected_frame_rate: 24.0,
            tolerance: 0.001,
            fail_fast: false,
        }
    }

    fn composition(status: CompositionStatus) -> CompositionResult {
        CompositionResult {
            index: 0,
            name: "main".to_string(),
            status,
            frame_rate: Some(24.0),
            expected_frame_rate: 24.0,
        }
    }

    fn report(files: Vec<FileResult>) -> Report {
        let summary = summarize(&files);
        Report {
            schema_version: SCHEMA_VERSION,
            tool: ToolInfo {
                name: TOOL_NAME,
                version: "0.1.0",
            },
            config: ReportConfig {
                expected_frame_rate: 24.0,
                tolerance: 0.001,
                fail_fast: false,
            },
            summary,
            files,
        }
    }

    #[test]
    fn compares_frame_rates_with_tolerance() {
        assert!(is_matching_frame_rate(24.0005, 24.0, 0.001));
        assert!(is_matching_frame_rate(23.9995, 24.0, 0.001));
        assert!(!is_matching_frame_rate(24.0015, 24.0, 0.001));
    }

    #[test]
    fn summarizes_status_and_exit_code_priority() {
        let failed = FileResult {
            path: "failed.aep".to_string(),
            status: FileStatus::Failed,
            format: "aep".to_string(),
            compositions: vec![composition(CompositionStatus::Failed)],
            errors: Vec::new(),
        };
        let errored = error_file("broken.aep", "aep", ErrorCode::ParseError, "broken");

        let failed_report = report(vec![failed.clone()]);
        assert_eq!(failed_report.summary.status, OverallStatus::Failed);
        assert_eq!(failed_report.exit_code(), 1);

        let errored_report = report(vec![failed, errored]);
        assert_eq!(errored_report.summary.status, OverallStatus::Errored);
        assert_eq!(errored_report.exit_code(), 2);
    }

    #[test]
    fn renders_quiet_default_without_passed_files_or_comps() {
        let passed = FileResult {
            path: "passed.aep".to_string(),
            status: FileStatus::Passed,
            format: "aep".to_string(),
            compositions: vec![composition(CompositionStatus::Passed)],
            errors: Vec::new(),
        };
        let failed = FileResult {
            path: "failed.aep".to_string(),
            status: FileStatus::Failed,
            format: "aep".to_string(),
            compositions: vec![
                composition(CompositionStatus::Failed),
                composition(CompositionStatus::Passed),
            ],
            errors: Vec::new(),
        };

        let rendered = render_default(&report(vec![passed, failed]), true, false);

        assert!(!rendered.contains("passed.aep"));
        assert!(rendered.contains("failed.aep"));
        assert_eq!(rendered.matches("main  24fps").count(), 1);
        assert!(rendered.contains("Failed: 1 file, 1 comp."));
    }

    #[test]
    fn serializes_json_shape() {
        let rendered = serde_json::to_string(&report(vec![FileResult {
            path: "passed.aep".to_string(),
            status: FileStatus::Passed,
            format: "aep".to_string(),
            compositions: vec![composition(CompositionStatus::Passed)],
            errors: Vec::new(),
        }]))
        .unwrap();

        assert!(rendered.contains("\"schemaVersion\":1"));
        assert!(rendered.contains("\"expectedFrameRate\":24.0"));
        assert!(rendered.contains("\"frameRate\":24.0"));
    }

    #[test]
    fn fail_fast_stops_after_first_error() {
        let config = Config {
            fail_fast: true,
            ..base_config()
        };
        let missing = "does-not-exist.aep".to_string();
        let report = run(&[missing, "also-missing.aep".to_string()], &config);

        assert_eq!(report.files.len(), 1);
        assert_eq!(report.exit_code(), 2);
    }
}
