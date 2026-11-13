param(
    [Parameter(Mandatory=$true)][string]$Recording,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9]+(-[a-z0-9]+)*$')][string]$Name,
    [string]$Output = (Join-Path $HOME '.codex/skills')
)
$ErrorActionPreference = 'Stop'
$pythonPath = $null
$pythonArgs = @()
$bundled = Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$candidates = @()
if ($env:FLOWNOTE_PYTHON) {
    $candidates += @{ Command = $env:FLOWNOTE_PYTHON; Args = @() }
} else {
    if (Test-Path -LiteralPath $bundled) { $candidates += @{ Command = $bundled; Args = @() } }
    $candidates += @{ Command = 'py'; Args = @('-3') }
    $candidates += @{ Command = 'python3'; Args = @() }
    $candidates += @{ Command = 'python'; Args = @() }
}
foreach ($candidate in $candidates) {
    $runtime = Get-Command $candidate.Command -CommandType Application -ErrorAction SilentlyContinue
    if (-not $runtime) { continue }
    $candidateArgs = $candidate.Args
    & $runtime.Source @candidateArgs -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>$null
    if ($LASTEXITCODE -eq 0) {
        $pythonPath = $runtime.Source
        $pythonArgs = $candidateArgs
        break
    }
}
if (-not $pythonPath) { throw 'Python 3.10+ is required. Install Python or set FLOWNOTE_PYTHON to its executable.' }
& $pythonPath @pythonArgs (Join-Path $PSScriptRoot 'recording_to_skill.py') $Recording --name $Name --output $Output
exit $LASTEXITCODE
