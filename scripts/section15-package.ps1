param([string]$OutputName = 'UDC-Section15-Part1-PARTIAL.zip')
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($OutputName -notmatch '^[A-Za-z0-9_-]+\.zip$') { throw 'Invalid archive filename.' }
$outputDirectory = Join-Path $repository 'artifacts'
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$archivePath = Join-Path $outputDirectory $OutputName
if (Test-Path -LiteralPath $archivePath) { throw 'Archive already exists; choose a new isolated filename.' }
$paths = @(git -C $repository ls-files; git -C $repository ls-files --others --exclude-standard) | Sort-Object -Unique
$safePaths = @($paths | Where-Object {
  $_ -notmatch '(^|/)(\.git|\.netlify|node_modules|dist|artifacts|\.tools\.local)(/|$)' -and
  $_ -notmatch '(^|/)\.env($|\.)' -and
  $_ -notmatch '\.(pem|pfx|p12|key|zip|docx|pdf)$' -and
  $_ -notmatch '(?i)(service-account|credentials?)'
})
# .env.example is intentionally excluded too: no environment bytes enter handoff.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::Open($archivePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite)
$archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $safePaths) {
    $absolute = [IO.Path]::GetFullPath((Join-Path $repository $relative))
    if (-not $absolute.StartsWith($repository + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive target escapes repository.' }
    $item = Get-Item -LiteralPath $absolute
    if ($item.LinkType) { throw 'Archive does not follow links.' }
    if (-not $item.PSIsContainer) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$absolute,$relative.Replace('\','/'),[IO.Compression.CompressionLevel]::Optimal) | Out-Null }
  }
} finally { $archive.Dispose(); $stream.Dispose() }
$verify = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  if (@($verify.Entries | Where-Object { $_.FullName -match '(^|/)(\.env|\.git|\.tools\.local|node_modules|artifacts)(/|$|\.)' }).Count) { throw 'Unexpected excluded archive content.' }
  if (-not $verify.GetEntry('docs/section15-part1-implementation-verdict.md')) { throw 'Missing PARTIAL verdict.' }
  if (-not $verify.GetEntry('netlify/lib/communication-service.js')) { throw 'Missing implementation.' }
  [pscustomobject]@{ Archive=$archivePath; Entries=$verify.Entries.Count; Bytes=(Get-Item -LiteralPath $archivePath).Length; Verdict='PARTIAL'; ProductionDeployment=$false }
} finally { $verify.Dispose() }
