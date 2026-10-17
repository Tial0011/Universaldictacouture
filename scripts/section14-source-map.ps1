$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = 'C:/Users/HP ENVY/Videos/1A1 IMPORTANT UDC PICTURES/✅ SECTION 14'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sources = @()
$references = @()
foreach ($sourceName in @('SECTION 14 VISUAL .docx','SECTION 14 VISUAL OFFICIAL  .docx')) {
  $sourcePath = Join-Path $sourceRoot $sourceName
  $zip = [IO.Compression.ZipFile]::OpenRead($sourcePath)
  try {
    $reader = [IO.StreamReader]::new($zip.GetEntry('word/document.xml').Open())
    try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $reader = [IO.StreamReader]::new($zip.GetEntry('word/_rels/document.xml.rels').Open())
    try { [xml]$rels = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $targets = @{}
    foreach ($relation in $rels.Relationships.Relationship) { $targets[$relation.Id] = $relation.Target }
    $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $ns.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
    $paras = @($xml.SelectNodes('//w:body//w:p',$ns))
    $text = @($paras | ForEach-Object { ($_.SelectNodes('.//w:t',$ns) | ForEach-Object { $_.InnerText }) -join '' } | Where-Object { $_ -match '\S' })
    $sources += [ordered]@{file=$sourcePath;sha256=(Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash;bodyParagraphs=$text.Count;mediaFiles=@($zip.Entries | Where-Object { $_.FullName -like 'word/media/*' }).Count;textRead='complete';layoutPageRendering='not performed'}
    if ($sourceName -eq 'SECTION 14 VISUAL .docx') {
      $reference = $null
      $mode = $null
      foreach ($paragraph in $paras) {
        $line = ($paragraph.SelectNodes('.//w:t',$ns) | ForEach-Object { $_.InnerText }) -join ''
        if ($line -match '^(S14-M\d\d[A-C D]?-V\d\d\d) — (.+)$' -and $line -notmatch '^FIG-') {
          if ($reference) { $references += [pscustomobject]$reference }
          $reference = [ordered]@{document17Id=$Matches[1];title=$Matches[2];ledgerMapping='family-level only; exact original-binary lineage not certified';sourceImage=$null;implementation='partial';component='src/pages/admin/Operations/MainOrderWorkspace.jsx';route='/admin/orders/:orderId'}
          if ($Matches[1] -match '^S14-M01-') { $reference.component='src/pages/admin/Operations/OrderQueue.jsx';$reference.route='/admin/orders' }
        }
        if ($reference -and $mode -and $line -match '\S') { $reference[$mode]=$line;$mode=$null }
        if ($reference -and $line -eq 'Visual Status') { $mode='classification' }
        if ($reference -and $line -eq 'Source Artifact') { $mode='declaredArtifact' }
        if ($reference -and $line -eq 'Known Final Corrections') { $mode='writtenOverride' }
        if ($reference) {
          foreach ($blip in $paragraph.SelectNodes('.//a:blip',$ns)) {
            if ($reference.document17Id -ne 'S14-M06C-V000') {
              $reference.sourceImage = '.tools.local/section14-reference/library/' + [IO.Path]::GetFileName($targets[$blip.GetAttribute('embed','http://schemas.openxmlformats.org/officeDocument/2006/relationships')])
            }
          }
        }
      }
      if ($reference) { $references += [pscustomobject]$reference }
    }
  } finally { $zip.Dispose() }
}
# Entries in the final appendix repeat IDs without record headings. No inferred
# new visual position or guessed M1/M2-F1 package count is added.
$unique = @($references | Group-Object document17Id | ForEach-Object { $_.Group[0] })
$result = [ordered]@{sources=$sources;document17References=$unique;officialLedgerVerifiedSubtotal=81;module1FinalCount=$null;module2Flow1FinalCount=$null;sectionWideExactVisualCount=$null;sourceProvenance='PARTIALLY VERIFIED';newArchitectureImages=0}
$result | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $root 'docs/section14-source-map.json') -Encoding utf8
[pscustomobject]@{Sources=$sources.Count;References=$unique.Count;Output='docs/section14-source-map.json';ExactSectionTotal='UNRESOLVED'}
