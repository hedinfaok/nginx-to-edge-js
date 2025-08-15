#!/bin/bash

# Batch convert all example nginx configurations to edge functions
# 
# Usage:
#   ./scripts/convert-examples.sh                    # Convert all examples to all platforms
#   ./scripts/convert-examples.sh cloudflare         # Convert all examples to CloudFlare Workers
#   ./scripts/convert-examples.sh nextjs             # Convert all examples to Next.js Middleware
#   ./scripts/convert-examples.sh lambda-edge        # Convert all examples to AWS Lambda@Edge
#   ./scripts/convert-examples.sh quickjs            # Convert all examples to QuickJS

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXAMPLES_DIR="$PROJECT_DIR/examples"
OUTPUT_BASE_DIR="$PROJECT_DIR/out"
CLI_PATH="$PROJECT_DIR/dist/src/cli/index.js"

# Platform configuration (using arrays for compatibility)
PLATFORM_NAMES=("cloudflare" "nextjs" "lambda-edge" "quickjs")
PLATFORM_EXTS=("js" "ts" "js" "js")
PLATFORM_LABELS=("CloudFlare Workers" "Next.js Middleware" "AWS Lambda@Edge" "QuickJS")

# Function to get platform info
get_platform_ext() {
    local platform="$1"
    for i in "${!PLATFORM_NAMES[@]}"; do
        if [[ "${PLATFORM_NAMES[$i]}" == "$platform" ]]; then
            echo "${PLATFORM_EXTS[$i]}"
            return 0
        fi
    done
    return 1
}

get_platform_label() {
    local platform="$1"
    for i in "${!PLATFORM_NAMES[@]}"; do
        if [[ "${PLATFORM_NAMES[$i]}" == "$platform" ]]; then
            echo "${PLATFORM_LABELS[$i]}"
            return 0
        fi
    done
    return 1
}

is_valid_platform() {
    local platform="$1"
    for p in "${PLATFORM_NAMES[@]}"; do
        if [[ "$p" == "$platform" ]]; then
            return 0
        fi
    done
    return 1
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Emojis (may not work on all terminals)
CHECK="✅"
CROSS="❌"
ROCKET="🚀"
FILE="📄"
FOLDER="📁"
CHART="📊"
TARGET="🎯"
STAR="🌟"
PARTY="🎉"
WARNING="⚠️"

# Get all .conf files in the examples directory
get_example_files() {
    find "$EXAMPLES_DIR" -name "*.conf" -type f | sort | while read -r file; do
        basename "$file"
    done
}

# Check if CLI is built
check_cli_built() {
    if [[ ! -f "$CLI_PATH" ]]; then
        echo -e "${CROSS} CLI not built. Please run: npm run build"
        exit 1
    fi
}

# Run the CLI command to generate edge function code
run_generation() {
    local platform="$1"
    local config_file="$2"
    local output_path="$3"
    
    local config_path="$EXAMPLES_DIR/$config_file"
    
    # Capture both stdout and stderr, and the exit code
    local temp_output
    temp_output=$(mktemp)
    local temp_error
    temp_error=$(mktemp)
    
    if node "$CLI_PATH" generate "$platform" "$config_path" --output "$output_path" \
        >"$temp_output" 2>"$temp_error"; then
        # Success
        rm -f "$temp_output" "$temp_error"
        return 0
    else
        # Failure - read error message
        local error_msg
        error_msg=$(cat "$temp_error" "$temp_output" 2>/dev/null | head -n 3 | tr '\n' ' ')
        rm -f "$temp_output" "$temp_error"
        echo "$error_msg"
        return 1
    fi
}

# Convert all examples for a specific platform
convert_examples_for_platform() {
    local platform="$1"
    local ext
    ext=$(get_platform_ext "$platform")
    local name
    name=$(get_platform_label "$platform")
    
    echo
    echo -e "${ROCKET} Converting examples to $name..."
    echo "============================================================"
    
    # Get list of files
    local files
    readarray -t files < <(get_example_files)
    local total_files=${#files[@]}
    
    local output_dir="$OUTPUT_BASE_DIR/$platform"
    mkdir -p "$output_dir"
    
    local success_count=0
    local failure_count=0
    declare -a failed_files
    
    for file in "${files[@]}"; do
        local base_name="${file%.conf}"
        local output_file="$output_dir/${base_name}.$ext"
        
        echo -e "${FILE} Processing $file..."
        
        if error_msg=$(run_generation "$platform" "$file" "$output_file"); then
            echo -e "  ${CHECK} Generated: $output_file"
            ((success_count++))
        else
            echo -e "  ${CROSS} Failed: $error_msg"
            failed_files+=("$file: $error_msg")
            ((failure_count++))
        fi
    done
    
    # Summary
    echo
    echo -e "${CHART} ${platform^^} Conversion Summary:"
    echo -e "  ${CHECK} Success: $success_count/$total_files"
    echo -e "  ${CROSS} Failed: $failure_count/$total_files"
    echo -e "  ${FOLDER} Output: $output_dir"
    
    if [[ $failure_count -gt 0 ]]; then
        echo
        echo -e "${CROSS} Failed conversions:"
        for failed in "${failed_files[@]}"; do
            echo "  - $failed"
        done
    fi
    
    # Return counts for caller (using global variables since bash functions are limited)
    LAST_SUCCESS_COUNT=$success_count
    LAST_FAILURE_COUNT=$failure_count
}

# Convert all examples for all platforms
convert_all_examples() {
    echo -e "${STAR} Converting all examples to all edge platforms..."
    echo "============================================================"
    
    # Get list of files
    local files
    readarray -t files < <(get_example_files)
    local total_files=${#files[@]}
    
    echo -e "${FILE} Found $total_files example configuration files:"
    for file in "${files[@]}"; do
        echo "  - $file"
    done
    
    local total_success=0
    local total_failure=0
    declare -a platform_results
    
    for platform in "${PLATFORM_NAMES[@]}"; do
        if convert_examples_for_platform "$platform"; then
            local label
            label=$(get_platform_label "$platform")
            platform_results+=("$label: $LAST_SUCCESS_COUNT/$total_files success")
            ((total_success += LAST_SUCCESS_COUNT))
            ((total_failure += LAST_FAILURE_COUNT))
        else
            local label
            label=$(get_platform_label "$platform")
            platform_results+=("$label: 0/$total_files success (failed entirely)")
            ((total_failure += total_files))
        fi
    done
    
    # Overall summary
    echo
    echo -e "${TARGET} OVERALL CONVERSION SUMMARY"
    echo "============================================================"
    echo -e "${FILE} Examples processed: $total_files"
    echo -e "${ROCKET} Platforms: ${#PLATFORM_NAMES[@]}"
    echo -e "${CHECK} Total successful conversions: $total_success"
    echo -e "${CROSS} Total failed conversions: $total_failure"
    echo -e "${FOLDER} Output directory: $OUTPUT_BASE_DIR"
    
    # Platform breakdown
    echo
    echo -e "${CHART} Platform Results:"
    for result in "${platform_results[@]}"; do
        echo "  $result"
    done
    
    if [[ $total_failure -gt 0 ]]; then
        echo
        echo -e "${WARNING} Some conversions failed. Check the logs above for details."
        exit 1
    else
        echo
        echo -e "${PARTY} All conversions completed successfully!"
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 [platform]"
    echo
    echo "Platforms:"
    for i in "${!PLATFORM_NAMES[@]}"; do
        local platform="${PLATFORM_NAMES[$i]}"
        local label="${PLATFORM_LABELS[$i]}"
        echo "  $platform - $label"
    done
    echo
    echo "Examples:"
    echo "  $0                    # Convert all examples to all platforms"
    echo "  $0 cloudflare         # Convert all examples to CloudFlare Workers"
    echo "  $0 nextjs             # Convert all examples to Next.js Middleware"
}

# Main execution
main() {
    local platform="$1"
    
    # Check if CLI is built
    check_cli_built
    
    if [[ -z "$platform" ]]; then
        # Convert all platforms
        convert_all_examples
    elif [[ -n "${PLATFORMS[$platform]}" ]]; then
        # Convert specific platform
        local files
        readarray -t files < <(get_example_files)
        echo -e "${FILE} Found ${#files[@]} example configuration files"
        convert_examples_for_platform "$platform"
    else
        echo -e "${CROSS} Unknown platform: $platform"
        echo -e "Supported platforms: ${!PLATFORMS[*]}"
        echo
        show_usage
        exit 1
    fi
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
