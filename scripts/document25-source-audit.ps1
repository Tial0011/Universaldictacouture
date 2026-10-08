param([string]$SourceDirectory='C:/Users/HP ENVY/Videos/1A1 IMPORTANT UDC PICTURES/✅ SECTION 16')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archives=@()
foreach($archive in @(@{Role='primary';Name='SECTION 16 VISUAL OFFICIAL .docx'},@{Role='support';Name='SECTION 16 VISUAL .docx'})){
  $sourcePath=Join-Path $SourceDirectory $archive.Name
  $zip=[IO.Compression.ZipFile]::OpenRead($sourcePath)
  try{
    $reader=[IO.StreamReader]::new($zip.GetEntry('word/document.xml').Open())
    try{$xml=[xml]$reader.ReadToEnd()}finally{$reader.Dispose()}
    $ns=[Xml.XmlNamespaceManager]::new($xml.NameTable);$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $rows=@($xml.SelectNodes('//w:body//w:p',$ns)|ForEach-Object{($_.SelectNodes('.//w:t',$ns)|ForEach-Object{$_.InnerText}) -join ''}|Where-Object{$_})
    $records=[ordered]@{}
    for($index=0;$index -lt $rows.Count;$index++){
      if($rows[$index] -match '^(S16-XW-M\d{2}-\d{3})(?:\s+\|\s*(.*))?$'){
        $id=$Matches[1];$inline=$Matches[2]
        if(-not $records.Contains($id)){
          $condition=if($inline){$inline}else{$rows[$index+2]}
          $records[$id]=[ordered]@{sourceQualifiedId=$archive.Role+':'+$id;id=$id;module=$id.Substring(7,3);condition=$condition;paragraph=$index}
        }
      }
    }
    $archives+= [ordered]@{role=$archive.Role;file=$archive.Name;sha256=(Get-FileHash -LiteralPath $sourcePath).Hash;paragraphs=$rows.Count;embeddedMedia=@($zip.Entries|Where-Object{$_.FullName -like 'word/media/*' -and $_.Name}).Count;records=@($records.Values)}
  }finally{$zip.Dispose()}
}
$support=@{};foreach($record in $archives[1].records){$support[$record.id]=$record.condition}
$reused=@($archives[0].records|Where-Object{$support.ContainsKey($_.id) -and $support[$_.id] -ne $_.condition}|ForEach-Object{[ordered]@{id=$_.id;primaryCondition=$_.condition;supportCondition=$support[$_.id];disposition='SOURCE-QUALIFIED — reconcile by condition and locked authority, not ID alone'}})
$result=[ordered]@{archives=$archives;differentConditionsUnderReusedId=$reused;formalFlowsCreated=0;newProductUiCreated=$false}
$artifact=Join-Path $PSScriptRoot '../.tools.local/s16-document25/source-audit.json'
$result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $artifact -Encoding utf8
"Primary records: $($archives[0].records.Count); supporting records: $($archives[1].records.Count); reused IDs with different labels: $($reused.Count); new formal flows: 0"
