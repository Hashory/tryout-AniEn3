use std::{io::IsTerminal, process::ExitCode};

use check_24fps::{Config, OutStyle};
use clap::{Parser, ValueEnum};

#[derive(Debug, Parser)]
#[command(
    name = "check24fps",
    version,
    about = "Checks After Effects .aep composition frame rates"
)]
struct Args {
    #[arg(long, default_value = "24", value_parser = parse_positive_f64)]
    frame_rate: f64,

    #[arg(long, default_value = "0.001", value_parser = parse_non_negative_f64)]
    tolerance: f64,

    #[arg(long, value_enum, default_value_t = CliOutStyle::Default)]
    out_style: CliOutStyle,

    #[arg(long)]
    quiet: bool,

    #[arg(long)]
    no_color: bool,

    #[arg(long)]
    fail_fast: bool,

    #[arg(required = true)]
    inputs: Vec<String>,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum CliOutStyle {
    Default,
    Json,
}

impl From<CliOutStyle> for OutStyle {
    fn from(value: CliOutStyle) -> Self {
        match value {
            CliOutStyle::Default => Self::Default,
            CliOutStyle::Json => Self::Json,
        }
    }
}

fn main() -> ExitCode {
    let args = Args::parse();
    let config = Config {
        expected_frame_rate: args.frame_rate,
        tolerance: args.tolerance,
        fail_fast: args.fail_fast,
    };
    let out_style = OutStyle::from(args.out_style);
    let report = check_24fps::run(&args.inputs, &config);

    match out_style {
        OutStyle::Default => {
            let color_enabled = !args.no_color && std::io::stdout().is_terminal();
            print!(
                "{}",
                check_24fps::render_default(&report, args.quiet, color_enabled)
            );
        }
        OutStyle::Json => match serde_json::to_string_pretty(&report) {
            Ok(json) => println!("{json}"),
            Err(err) => {
                eprintln!("internal_error: failed to serialize JSON output: {err}");
                return ExitCode::from(2);
            }
        },
    }

    ExitCode::from(report.exit_code())
}

fn parse_positive_f64(value: &str) -> Result<f64, String> {
    let parsed = value
        .parse::<f64>()
        .map_err(|err| format!("invalid number: {err}"))?;
    if parsed.is_finite() && parsed > 0.0 {
        Ok(parsed)
    } else {
        Err("value must be a finite number greater than 0".to_string())
    }
}

fn parse_non_negative_f64(value: &str) -> Result<f64, String> {
    let parsed = value
        .parse::<f64>()
        .map_err(|err| format!("invalid number: {err}"))?;
    if parsed.is_finite() && parsed >= 0.0 {
        Ok(parsed)
    } else {
        Err("value must be a finite number greater than or equal to 0".to_string())
    }
}
