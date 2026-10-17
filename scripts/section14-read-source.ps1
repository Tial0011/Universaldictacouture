param(
  [ValidateSet('library','ledger','master1','master2','master3','master4')][string]$Document = 'library',
  [int]$Start = 0,
  [int]$End = 400,
  [switch]$ExtractMedia
)
$names = @{
  library = 'SECTION 14 VISUAL .docx'
  ledger = 'SECTION 14 VISUAL OFFICIAL  .docx'
  master1 = 'SECTION 14 DOCUMENT 1 PART 1 .docx'
  master2 = 'SECTION 14 DOCUMENT 1 PART 2 .docx'
  master3 = 'SECTION 14 DOCUMENT 1 PART 3 .docx'
  master4 = 'SECTION 14 DOCUMENT 1 PART 4 .docx'
}
$source = Join-Path 'C:/Users/HP ENVY/Videos/1A1 IMPORTANT UDC PICTURES/✅ SECTION 14' $names[$Document]
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($source)
try {
  $reader = [IO.StreamReader]::new($archive.GetEntry('word/document.xml').Open())
  try { $xml = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
  $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
  $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $paragraphs = @($xml.SelectNodes('//w:body//w:p',$ns) | ForEach-Object {
    ($_.SelectNodes('.//w:t',$ns) | ForEach-Object { $_.InnerText }) -join ''
  } | Where-Object { $_ -match '\S' })
  "SOURCE $source | paragraphs $($paragraphs.Count) | requested [$Start,$End)"
  for ($index = $Start; $index -lt [Math]::Min($End,$paragraphs.Count); $index++) {
    "$index $($paragraphs[$index])"
  }
  if ($ExtractMedia) {
    $destination = Join-Path $PSScriptRoot "../.tools.local/section14-reference/$Document"
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    foreach ($entry in $archive.Entries | Where-Object { $_.FullName -like 'word/media/*' }) {
      $target = Join-Path $destination ([IO.Path]::GetFileName($entry.FullName))
      if (-not [IO.File]::Exists($target)) { [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false) }
      $entry.FullName
    }
  }
} finally { $archive.Dispose() }
