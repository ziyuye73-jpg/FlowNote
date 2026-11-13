#!/usr/bin/env python3
"""Create a portable Chrome/Edge + Codex plugin ZIP using only the standard library."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]


def package(output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Explicit shipping roots exclude local recordings, dependencies and build output.
    files = [ROOT / 'README.md', ROOT / '项目说明.md']
    for directory in ('extension', 'scripts', 'skills', '.codex-plugin'):
        files.extend(p for p in (ROOT / directory).rglob('*')
                     if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc')
    with output.open('xb') as stream, ZipFile(stream, 'w', ZIP_DEFLATED) as archive:
        for source in sorted(files):
            archive.write(source, 'FlowNote/' + source.relative_to(ROOT).as_posix())
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist' / 'FlowNote-macOS-Windows.zip')
    print(package(parser.parse_args().output))
