param([int]$Start = 0, [int]$End = 180, [switch]$ExtractMedia)
$source = 'C:/Users/HP ENVY/Videos/1A1 IMPORTANT UDC PICTURES/✅ SECTION 15/SECTION 15 DOCUMENT 1 PART 1 .docx'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($source)
try {
  $reader = [IO.StreamReader]::new($archive.GetEntry('word/document.xml').Open())
  try { $document = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
  $namespaces = [Xml.XmlNamespaceManager]::new($document.NameTable)
  $namespaces.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $paragraphs = @($document.SelectNodes('//w:body//w:p',$namespaces) | ForEach-Object {
    ($_.SelectNodes('.//w:t',$namespaces) | ForEach-Object { $_.InnerText }) -join ''
  } | Where-Object { $_ })
  for ($index = $Start; $index -lt [Math]::Min($End,$paragraphs.Count); $index++) {
    "$index $($paragraphs[$index])"
  }
  if ($ExtractMedia) {
    $destination = Join-Path $PSScriptRoot '../.tools.local/section15-part1-reference'
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    foreach ($entry in $archive.Entries | Where-Object { $_.FullName -like 'word/media/*' }) {
      $target = Join-Path $destination ([IO.Path]::GetFileName($entry.FullName))
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
      $entry.FullName
    }
  }
} finally { $archive.Dispose() }
