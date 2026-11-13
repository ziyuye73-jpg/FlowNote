#!/bin/sh
# macOS entry point; arguments match the Python converter.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python_path=${FLOWNOTE_PYTHON:-python3}
if ! command -v "$python_path" >/dev/null 2>&1; then
    printf '%s\n' 'Python 3.10+ is required. Install Python or set FLOWNOTE_PYTHON to its executable.' >&2
    exit 1
fi
if ! "$python_path" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    printf '%s\n' 'Python 3.10+ is required.' >&2
    exit 1
fi
exec "$python_path" "$script_dir/recording_to_skill.py" "$@"
