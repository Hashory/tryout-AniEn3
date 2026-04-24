use std::{fs, path::PathBuf};

use assert_cmd::Command;
use serde_json::Value;
use tempfile::tempdir;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../aftereffects-aep-parser/data")
        .join(name)
}

fn command() -> Command {
    Command::cargo_bin("check24fps").expect("check24fps binary should be built")
}

#[test]
fn detects_mismatched_fixture_file() {
    let assert = command()
        .args(["--no-color", fixture("Item-01.aep").to_str().unwrap()])
        .assert()
        .code(1);

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    assert!(stdout.contains("✕"));
    assert!(stdout.contains("Comp 01  21fps"));
    assert!(stdout.contains("Comp 02  29.97fps"));
    assert!(stdout.contains("Failed: 1 file, 2 comps."));
    assert!(stdout.contains("Expected frame rate: 24fps"));
}

#[test]
fn resolves_directory_inputs_recursively() {
    let temp = tempdir().unwrap();
    let nested = temp.path().join("nested");
    fs::create_dir(&nested).unwrap();
    let target = nested.join("project.aep");
    fs::copy(fixture("Item-01.aep"), &target).unwrap();

    let assert = command()
        .args(["--no-color", temp.path().to_str().unwrap()])
        .assert()
        .code(1);

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    assert!(stdout.contains(&target.display().to_string()));
    assert!(stdout.contains("Checked 1 file, 2 comps."));
}

#[test]
fn expands_quoted_globs_and_outputs_json() {
    let temp = tempdir().unwrap();
    let nested = temp.path().join("nested");
    fs::create_dir(&nested).unwrap();
    fs::copy(fixture("Item-01.aep"), nested.join("project.aep")).unwrap();
    fs::write(nested.join("ignored.txt"), "not an aep").unwrap();

    let pattern = format!("{}/**/*.aep", temp.path().display()).replace('\\', "/");
    let assert = command()
        .args(["--out-style", "json", &pattern])
        .assert()
        .code(1);

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    let json: Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(json["summary"]["files"]["total"], 1);
    assert_eq!(json["summary"]["compositions"]["failed"], 2);
    assert_eq!(json["files"][0]["format"], "aep");
}

#[test]
fn reports_missing_input_as_not_found() {
    let assert = command()
        .args(["--out-style", "json", "missing-file.aep"])
        .assert()
        .code(2);

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    let json: Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(json["summary"]["status"], "errored");
    assert_eq!(json["files"][0]["errors"][0]["code"], "not_found");
}

#[test]
fn reports_unsupported_existing_files() {
    let temp = tempdir().unwrap();
    let unsupported = temp.path().join("project.txt");
    fs::write(&unsupported, "not an aep").unwrap();

    let assert = command()
        .args(["--no-color", unsupported.to_str().unwrap()])
        .assert()
        .code(2);

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    assert!(stdout.contains("unsupported_format"));
    assert!(stdout.contains("Checked 1 file."));
}

#[test]
fn fail_fast_stops_after_first_error() {
    let assert = command()
        .args([
            "--fail-fast",
            "--out-style",
            "json",
            "missing-file.aep",
            fixture("Item-01.aep").to_str().unwrap(),
        ])
        .assert()
        .code(2);

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    let json: Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(json["files"].as_array().unwrap().len(), 1);
    assert_eq!(json["files"][0]["path"], "missing-file.aep");
}

#[test]
fn json_output_writes_only_valid_json_to_stdout() {
    let assert = command()
        .args([
            "--out-style",
            "json",
            fixture("Item-01.aep").to_str().unwrap(),
        ])
        .assert()
        .code(1);

    let output = assert.get_output();
    let stdout = String::from_utf8(output.stdout.clone()).unwrap();
    let stderr = String::from_utf8(output.stderr.clone()).unwrap();
    let json: Value = serde_json::from_str(&stdout).unwrap();

    assert!(stderr.is_empty());
    assert_eq!(json["schemaVersion"], 1);
    assert_eq!(json["tool"]["name"], "check24fps");
}
